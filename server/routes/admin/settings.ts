import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../../../db/index.ts";
import { settings, users } from "../../../db/schema.ts";
import { requireAdmin, type AdminEnv } from "../../lib/require-auth.ts";
import { logEvent } from "../../lib/events.ts";
import { takeAttempt } from "../../lib/limits.ts";
import {
  checkKey,
  cleanKey,
  countOwnKeys,
  removeTeamKey,
  saveTeamKey,
  teamKeyInfo,
} from "../../ai/api-keys.ts";
import {
  MODEL_CHOICES,
  clearModelCache,
  isAllowedModel,
  modelIdFor,
  settingKey,
  type AgentRole,
} from "../../ai/models.ts";

// App settings admins can change: which Claude model each agent uses, and
// the team API key. Admins only.

const app = new Hono<AdminEnv>();
app.use("*", requireAdmin);

/** The names admins see on the Settings page, reused in the activity log. */
const ROLE_LABELS: Record<AgentRole, string> = {
  tutor: "Answers students",
  editor: "Prompt assistant & reviewer",
  learn: "Learns team facts & interests",
};

function isRole(value: unknown): value is AgentRole {
  return typeof value === "string" && Object.hasOwn(ROLE_LABELS, value);
}

function labelOf(id: string): string {
  return MODEL_CHOICES.find((m) => m.id === id)?.label ?? id;
}

async function currentModels(): Promise<Record<AgentRole, string>> {
  const fresh = { fresh: true };
  return {
    tutor: await modelIdFor("tutor", fresh),
    editor: await modelIdFor("editor", fresh),
    learn: await modelIdFor("learn", fresh),
  };
}

// GET / — the models admins can pick from, and which one each agent uses now
app.get("/", async (c) => c.json({ choices: MODEL_CHOICES, models: await currentModels() }));

// PUT /models — { role, model, expected }. `expected` is the model the page
// showed; if someone changed it since, refuse so nobody undoes another
// admin's choice without seeing it.
app.put("/models", async (c) => {
  const body = await c.req
    .json<{ role?: unknown; model?: unknown; expected?: unknown }>()
    .catch(() => ({}) as { role?: unknown; model?: unknown; expected?: unknown });
  const { role, model, expected } = body;

  if (!isRole(role)) return c.json({ error: "Unknown role." }, 400);
  if (typeof model !== "string" || !isAllowedModel(model)) return c.json({ error: "That model isn't one of the choices." }, 400);
  if (typeof expected !== "string") return c.json({ error: "Missing expected — reload the page and try again." }, 400);

  const current = await modelIdFor(role, { fresh: true });
  if (current !== expected) {
    return c.json({ error: "Someone changed this while you were looking.", current }, 409);
  }
  if (model === current) return c.json({ ok: true, models: await currentModels() });

  await db
    .insert(settings)
    .values({ key: settingKey(role), value: model })
    .onConflictDoUpdate({ target: settings.key, set: { value: model } });
  clearModelCache();

  await logEvent({
    actorId: c.get("adminId"),
    action: "settings.model",
    target: ROLE_LABELS[role],
    summary: `${ROLE_LABELS[role]}: ${labelOf(current)} → ${labelOf(model)}`,
  });
  return c.json({ ok: true, models: await currentModels() });
});

// ─── the team API key ──────────────────────────────────────────────────────
// The key everyone's chats run on unless they add their own, and the one
// background jobs always use. The key itself is never sent back.

async function keyStatus() {
  return { ...(await teamKeyInfo()), ownKeyCount: await countOwnKeys() };
}

/**
 * `expected` is the setAt the page showed (null if none was set in the app).
 * If another admin changed the key since, refuse, so nobody replaces or
 * removes someone else's key without seeing it.
 */
async function changedSince(expected: unknown): Promise<boolean> {
  const current = (await teamKeyInfo()).setAt;
  return (expected ?? null) !== current;
}

// GET /api-key → { source, hint, setByName, setAt, ownKeyCount }
app.get("/api-key", async (c) => c.json(await keyStatus()));

// PUT /api-key — { key, expected }
app.put("/api-key", async (c) => {
  const adminId = c.get("adminId");
  const body = await c.req
    .json<{ key?: unknown; expected?: unknown }>()
    .catch(() => ({}) as { key?: unknown; expected?: unknown });
  const cleaned = cleanKey(body.key);
  if (!cleaned.ok) return c.json({ error: cleaned.error }, 400);
  if (await changedSince(body.expected)) {
    return c.json({ error: "Another admin changed the key while you were looking." }, 409);
  }

  const limit = await takeAttempt(`apikey:${adminId}`, 10, 15 * 60 * 1000);
  if (!limit.allowed) return c.json({ error: "Too many tries. Wait a few minutes and try again." }, 429);
  const check = await checkKey(cleaned.key);
  if (!check.ok) return c.json({ error: check.error }, 400);

  const [admin] = await db.select({ name: users.name }).from(users).where(eq(users.id, adminId));
  await saveTeamKey(cleaned.key, { id: adminId, name: admin?.name ?? "An admin" });
  const status = await keyStatus();
  await logEvent({
    actorId: adminId,
    action: "settings.apiKey",
    target: "Team API key",
    summary: `Set the team API key (ends in ${status.hint?.slice(1)})`,
  });
  return c.json({ ok: true, ...status });
});

// DELETE /api-key?expected=… — go back to the key from setup (if any).
app.delete("/api-key", async (c) => {
  const expected = c.req.query("expected") || null;
  const before = await teamKeyInfo();
  if (before.source !== "settings") return c.json({ error: "There's no key set here to remove." }, 400);
  if (await changedSince(expected)) {
    return c.json({ error: "Another admin changed the key while you were looking." }, 409);
  }
  await removeTeamKey();
  await logEvent({
    actorId: c.get("adminId"),
    action: "settings.apiKey",
    target: "Team API key",
    summary: `Removed the team API key set by ${before.setByName} (ended in ${before.hint?.slice(1)})`,
  });
  return c.json({ ok: true, ...(await keyStatus()) });
});

export default app;
