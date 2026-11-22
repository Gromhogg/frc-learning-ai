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
  teamApiKey,
  teamKeyInfo,
} from "../../ai/api-keys.ts";
import {
  MODEL_CHOICES,
  PROVIDER_NAMES,
  clearModelCache,
  isAllowedModel,
  labelOf,
  modelIdFor,
  providerOf,
  settingKey,
  type AgentRole,
  type PaidProvider,
} from "../../ai/models.ts";
import { FREE_MODEL } from "../../lib/config.ts";

// App settings admins can change: which AI model each agent uses, and the
// team's Claude and OpenAI keys. Admins only.

const app = new Hono<AdminEnv>();
app.use("*", requireAdmin);

/** The names admins see on the Settings page, reused in the activity log. */
const ROLE_LABELS: Record<AgentRole, string> = {
  tutor: "Answers students",
  editor: "Prompt assistant & reviewer",
  learn: "Learns team facts & interests",
};

const ROLES = Object.keys(ROLE_LABELS) as AgentRole[];

function isRole(value: unknown): value is AgentRole {
  return typeof value === "string" && Object.hasOwn(ROLE_LABELS, value);
}

function isPaidProvider(value: unknown): value is PaidProvider {
  return value === "anthropic" || value === "openai";
}

async function currentModels(): Promise<Record<AgentRole, string>> {
  const fresh = { fresh: true };
  return {
    tutor: await modelIdFor("tutor", fresh),
    editor: await modelIdFor("editor", fresh),
    learn: await modelIdFor("learn", fresh),
  };
}

/** Which companies the team has a key for, so their models can be picked. */
async function keysReady(): Promise<Record<PaidProvider, boolean>> {
  return { anthropic: Boolean(await teamApiKey("anthropic")), openai: Boolean(await teamApiKey("openai")) };
}

async function saveModel(role: AgentRole, model: string): Promise<void> {
  await db
    .insert(settings)
    .values({ key: settingKey(role), value: model })
    .onConflictDoUpdate({ target: settings.key, set: { value: model } });
  clearModelCache();
}

// GET / — the models admins can pick from, which one each agent uses now,
// and which companies have a team key.
app.get("/", async (c) =>
  c.json({ choices: MODEL_CHOICES, models: await currentModels(), keys: await keysReady() }),
);

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

  const provider = providerOf(model);
  if (provider !== "free" && !(await teamApiKey(provider))) {
    return c.json({ error: `Add the team's ${PROVIDER_NAMES[provider]} key first.` }, 400);
  }

  const current = await modelIdFor(role, { fresh: true });
  if (current !== expected) {
    return c.json({ error: "Someone changed this while you were looking.", current }, 409);
  }
  if (model === current) return c.json({ ok: true, models: await currentModels() });

  await saveModel(role, model);
  await logEvent({
    actorId: c.get("adminId"),
    action: "settings.model",
    target: ROLE_LABELS[role],
    summary: `${ROLE_LABELS[role]}: ${labelOf(current)} → ${labelOf(model)}`,
  });
  return c.json({ ok: true, models: await currentModels() });
});

// ─── the team API keys ─────────────────────────────────────────────────────
// Optional. A key lets admins pick that company's models above, and is what
// those models run on. The keys themselves are never sent back.

async function keyStatus() {
  return {
    anthropic: await teamKeyInfo("anthropic"),
    openai: await teamKeyInfo("openai"),
    ownKeyCount: await countOwnKeys(),
  };
}

/**
 * `expected` is the setAt the page showed (null if none was set in the app).
 * If another admin changed the key since, refuse, so nobody replaces or
 * removes someone else's key without seeing it.
 */
async function changedSince(provider: PaidProvider, expected: unknown): Promise<boolean> {
  const current = (await teamKeyInfo(provider)).setAt;
  return (expected ?? null) !== current;
}

// GET /api-key → { anthropic, openai, ownKeyCount }
app.get("/api-key", async (c) => c.json(await keyStatus()));

// PUT /api-key/:provider — { key, expected }
app.put("/api-key/:provider", async (c) => {
  const adminId = c.get("adminId");
  const provider = c.req.param("provider");
  if (!isPaidProvider(provider)) return c.json({ error: "Unknown company." }, 400);
  const name = PROVIDER_NAMES[provider];
  const body = await c.req
    .json<{ key?: unknown; expected?: unknown }>()
    .catch(() => ({}) as { key?: unknown; expected?: unknown });
  const cleaned = cleanKey(body.key);
  if (!cleaned.ok) return c.json({ error: cleaned.error }, 400);
  if (cleaned.provider !== provider) {
    return c.json({ error: `That's a ${PROVIDER_NAMES[cleaned.provider]} key. Paste it in the ${PROVIDER_NAMES[cleaned.provider]} box.` }, 400);
  }
  if (await changedSince(provider, body.expected)) {
    return c.json({ error: "Another admin changed the key while you were looking." }, 409);
  }

  const limit = await takeAttempt(`apikey:${adminId}`, 10, 15 * 60 * 1000);
  if (!limit.allowed) return c.json({ error: "Too many tries. Wait a few minutes and try again." }, 429);
  const check = await checkKey(provider, cleaned.key);
  if (!check.ok) return c.json({ error: check.error }, 400);

  const [admin] = await db.select({ name: users.name }).from(users).where(eq(users.id, adminId));
  await saveTeamKey(provider, cleaned.key, { id: adminId, name: admin?.name ?? "An admin" });
  clearModelCache();
  const status = await keyStatus();
  await logEvent({
    actorId: adminId,
    action: "settings.apiKey",
    target: `Team ${name} key`,
    summary: `Set the team ${name} key (ends in ${status[provider].hint?.slice(1)})`,
  });
  return c.json({ ok: true, ...status });
});

// DELETE /api-key/:provider?expected=… — remove it. Agents on that company's
// models go back to the free model.
app.delete("/api-key/:provider", async (c) => {
  const provider = c.req.param("provider");
  if (!isPaidProvider(provider)) return c.json({ error: "Unknown company." }, 400);
  const name = PROVIDER_NAMES[provider];
  const expected = c.req.query("expected") || null;
  const before = await teamKeyInfo(provider);
  if (before.source !== "settings") return c.json({ error: "There's no key set here to remove." }, 400);
  if (await changedSince(provider, expected)) {
    return c.json({ error: "Another admin changed the key while you were looking." }, 409);
  }
  const using: AgentRole[] = [];
  for (const role of ROLES) {
    if (providerOf(await modelIdFor(role, { fresh: true })) === provider) using.push(role);
  }
  await removeTeamKey(provider);
  // Unless the server setup has its own key, those agents can't run on it any more.
  if (!(await teamApiKey(provider))) {
    for (const role of using) await saveModel(role, FREE_MODEL);
  }
  clearModelCache();
  await logEvent({
    actorId: c.get("adminId"),
    action: "settings.apiKey",
    target: `Team ${name} key`,
    summary: `Removed the team ${name} key set by ${before.setByName} (ended in ${before.hint?.slice(1)})`,
  });
  return c.json({ ok: true, ...(await keyStatus()) });
});

export default app;
