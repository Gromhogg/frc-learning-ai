import { Hono } from "hono";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "../../../db/index.ts";
import { users } from "../../../db/schema.ts";
import { requireAdmin, type AdminEnv } from "../../lib/require-auth.ts";

// The list of admins, oldest first. Read-only on purpose: anyone who enters
// the admin password becomes an admin, and admin access can't be removed in
// the app — so there is no route here that changes anything.
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
    admins: rows.map(({ createdAt, ...admin }) => ({ ...admin, adminSince: admin.adminSince ?? createdAt })),
  });
});

export default app;
