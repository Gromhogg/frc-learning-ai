import { Hono } from "hono";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "../../../db/index.ts";
import { users } from "../../../db/schema.ts";
import { requireAdmin, type AdminEnv } from "../../lib/require-auth.ts";
import { logEvent } from "../../lib/events.ts";
import { clearAttempts, takeAttempt } from "../../lib/limits.ts";
import {
  checkAdminPassword,
  isOwner,
  isOwnerEmail,
  MIN_ADMIN_PASSWORD,
  setAdminPassword,
} from "../../lib/admin-access.ts";

// The list of admins, oldest first, for every admin. The owner (OWNER_EMAIL)
// also gets everyone's account, and is the only one who can make or remove
// admins and change the admin password.
const app = new Hono<AdminEnv>();
app.use("*", requireAdmin);

app.get("/", async (c) => {
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      avatarUrl: users.avatarUrl,
      adminSince: users.adminSince,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.role, "admin"))
    // If admin_since is ever missing, fall back to when the account was made.
    .orderBy(asc(sql`coalesce(${users.adminSince}, ${users.createdAt})`), asc(users.id));

  return c.json({
    admins: rows.map(({ createdAt, ...admin }) => ({
      ...admin,
      adminSince: admin.adminSince ?? createdAt,
      owner: isOwnerEmail(admin.email),
    })),
  });
});

// ─── owner only ────────────────────────────────────────────────────────────

const ownerOnly = { error: "Only the owner can do this." };

// GET /people → everyone with an account, for making or removing admins.
app.get("/people", async (c) => {
  if (!(await isOwner(c.get("adminId")))) return c.json(ownerOnly, 403);
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email, avatarUrl: users.avatarUrl, role: users.role })
    .from(users)
    .orderBy(asc(users.name));
  return c.json({ people: rows.map((p) => ({ ...p, owner: isOwnerEmail(p.email) })) });
});

// POST /people/:id/role { role: "admin" | "student" }
app.post("/people/:id/role", async (c) => {
  const ownerId = c.get("adminId");
  if (!(await isOwner(ownerId))) return c.json(ownerOnly, 403);

  const id = Number(c.req.param("id"));
  const body = await c.req.json<{ role?: unknown }>().catch(() => ({ role: null }));
  const role = body.role === "admin" ? "admin" : body.role === "student" ? "student" : null;
  if (!role) return c.json({ error: "Pick admin or student." }, 400);

  const [person] = await db.select().from(users).where(eq(users.id, id));
  if (!person) return c.json({ error: "That account doesn't exist." }, 404);
  if (isOwnerEmail(person.email)) return c.json({ error: "The owner is always an admin." }, 400);
  if (person.role === role) return c.json({ ok: true });

  await db
    .update(users)
    .set(
      role === "admin"
        ? { role, adminSince: sql`coalesce(${users.adminSince}, CURRENT_TIMESTAMP)` }
        : { role, adminSince: null },
    )
    .where(eq(users.id, id));
  await logEvent({
    actorId: ownerId,
    action: role === "admin" ? "admin.grant" : "admin.remove",
    target: person.name,
    summary: role === "admin" ? `Made ${person.name} an admin` : `Removed admin from ${person.name}`,
  });
  return c.json({ ok: true });
});

// POST /password { current, next } — change the admin password.
app.post("/password", async (c) => {
  const ownerId = c.get("adminId");
  if (!(await isOwner(ownerId))) return c.json(ownerOnly, 403);

  const triesKey = `admin-password:${ownerId}`;
  const tries = await takeAttempt(triesKey, 5, 15 * 60_000);
  if (!tries.allowed) return c.json({ error: "Too many wrong tries. Wait 15 minutes." }, 429);

  const body = await c.req.json<{ current?: unknown; next?: unknown }>().catch(() => ({ current: "", next: "" }));
  const current = typeof body.current === "string" ? body.current.trim() : "";
  const next = typeof body.next === "string" ? body.next.trim() : "";
  if (!(await checkAdminPassword(current))) return c.json({ error: "The current password isn't right." }, 400);
  if (next.length < MIN_ADMIN_PASSWORD) {
    return c.json({ error: `The new password needs at least ${MIN_ADMIN_PASSWORD} characters.` }, 400);
  }

  await clearAttempts(triesKey);
  await setAdminPassword(next);
  await logEvent({ actorId: ownerId, action: "admin.password", target: null, summary: "Changed the admin password" });
  return c.json({ ok: true });
});

export default app;
