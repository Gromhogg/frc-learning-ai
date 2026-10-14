import { Hono } from "hono";
import { db } from "../../../db/index.ts";
import { settings } from "../../../db/schema.ts";
import { requireAdmin, type AdminEnv } from "../../lib/require-auth.ts";
import { logEvent } from "../../lib/events.ts";
import {
  MODEL_CHOICES,
  clearModelCache,
  isAllowedModel,
  modelIdFor,
  settingKey,
  type AgentRole,
} from "../../ai/models.ts";

// App settings admins can change. Right now: which Claude model each agent
// uses. Admins only.

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

function currentModels(): Record<AgentRole, string> {
  return { tutor: modelIdFor("tutor"), editor: modelIdFor("editor"), learn: modelIdFor("learn") };
}

// GET / — the models admins can pick from, and which one each agent uses now
app.get("/", (c) => c.json({ choices: MODEL_CHOICES, models: currentModels() }));

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

  const current = modelIdFor(role);
  if (current !== expected) {
    return c.json({ error: "Someone changed this while you were looking.", current }, 409);
  }
  if (model === current) return c.json({ ok: true, models: currentModels() });

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
  return c.json({ ok: true, models: currentModels() });
});

export default app;
