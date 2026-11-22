import { waitUntil } from "cloudflare:workers";
import { Hono } from "hono";
import { getAuth } from "../lib/require-auth.ts";
import { clearInterests, getInterests, saveDescribedInterests } from "../lib/interests.ts";
import { describeInterests, MAX_DESCRIBE_CHARS } from "../lib/describe-interests.ts";
import { rebuild } from "../lib/suggestions.ts";
import { takeAttempt } from "../lib/limits.ts";
import { checkKey, cleanKey, ownKeyInfo, removeOwnKey, saveOwnKey, setOwnModel } from "../ai/api-keys.ts";
import { DEFAULT_OWN_MODEL, MODEL_CHOICES, labelOf, providerOf } from "../ai/models.ts";
import { teamAi, whyNot } from "../ai/pick.ts";
import { freeBackAt } from "../ai/free-model.ts";

// Things about the signed-in person, for that person only. Interests are
// private: no admin route shows them.
const app = new Hono();

// GET /interests → { topics: [{ topic, strong }], statedFocus }
app.get("/interests", async (c) => {
  const auth = await getAuth(c);
  if (!auth) return c.json({ error: "Not signed in." }, 401);
  return c.json(await getInterests(auth.userId));
});

// POST /interests/describe { text } — the person says what they're into, in
// their own words; the AI turns it into topics. Returns the new interests.
app.post("/interests/describe", async (c) => {
  const auth = await getAuth(c);
  if (!auth) return c.json({ error: "Not signed in." }, 401);

  const body = await c.req.json<{ text?: unknown }>().catch(() => ({ text: "" }));
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return c.json({ error: "Write or say a little about what you're into first." }, 400);
  if (text.length > MAX_DESCRIBE_CHARS) {
    return c.json({ error: `Keep it under ${MAX_DESCRIBE_CHARS} characters.` }, 400);
  }

  const tries = await takeAttempt(`describe:${auth.userId}`, 10, 60 * 60_000);
  if (!tries.allowed) return c.json({ error: "That's a lot of changes. Try again in an hour." }, 429);

  const described = await describeInterests(text);
  if ("error" in described) return c.json({ error: described.error }, 502);
  if (described.topics.length === 0 && !described.focus) {
    return c.json({ error: "The AI didn't find any robotics topics in that. Try naming what you work on or want to learn." }, 400);
  }

  await saveDescribedInterests(auth.userId, described);
  waitUntil(rebuild(auth.userId, auth.role));
  return c.json(await getInterests(auth.userId));
});

// DELETE /interests — forget what the AI learned, and the personal suggestions.
app.delete("/interests", async (c) => {
  const auth = await getAuth(c);
  if (!auth) return c.json({ error: "Not signed in." }, 401);
  await clearInterests(auth.userId);
  return c.json({ ok: true });
});

// ─── your own API key ──────────────────────────────────────────────────────
// Anyone can run their chats on their own Claude or OpenAI key, with a model
// they pick, instead of the team's AI. The key itself never comes back out —
// only its last 4 characters.

/** Key checks per person, so this can't be used to test stolen keys in bulk. */
const KEY_CHECKS = 10;
const KEY_CHECK_WINDOW_MS = 15 * 60 * 1000;

/** The paid models someone can pick for their own key. */
const OWN_CHOICES = MODEL_CHOICES.filter((m) => m.provider !== "free");

// GET /api-key → { own: { hint, model, addedAt } | null, team: {…}, choices }
app.get("/api-key", async (c) => {
  const auth = await getAuth(c);
  if (!auth) return c.json({ error: "Not signed in." }, 401);
  const ai = await teamAi("tutor");
  return c.json({
    own: await ownKeyInfo(auth.userId),
    team: {
      model: labelOf(ai.model.id),
      free: ai.provider === "free",
      usedUp: (await whyNot(ai)) !== null,
      backAt: freeBackAt(),
    },
    choices: OWN_CHOICES,
  });
});

// PUT /api-key — { key, model? }. Checked with its company before it's saved.
app.put("/api-key", async (c) => {
  const auth = await getAuth(c);
  if (!auth) return c.json({ error: "Not signed in." }, 401);
  const body = await c.req.json<{ key?: unknown; model?: unknown }>().catch(() => ({}) as { key?: unknown; model?: unknown });
  const cleaned = cleanKey(body.key);
  if (!cleaned.ok) return c.json({ error: cleaned.error }, 400);
  const model =
    typeof body.model === "string" && OWN_CHOICES.some((m) => m.id === body.model && m.provider === cleaned.provider)
      ? body.model
      : DEFAULT_OWN_MODEL[cleaned.provider];

  const limit = await takeAttempt(`apikey:${auth.userId}`, KEY_CHECKS, KEY_CHECK_WINDOW_MS);
  if (!limit.allowed) return c.json({ error: "Too many tries. Wait a few minutes and try again." }, 429);
  const check = await checkKey(cleaned.provider, cleaned.key);
  if (!check.ok) return c.json({ error: check.error }, 400);

  await saveOwnKey(auth.userId, cleaned.key, model);
  return c.json({ ok: true, own: await ownKeyInfo(auth.userId) });
});

// PUT /api-key/model — { model }: pick another model from the same company as your key.
app.put("/api-key/model", async (c) => {
  const auth = await getAuth(c);
  if (!auth) return c.json({ error: "Not signed in." }, 401);
  const own = await ownKeyInfo(auth.userId);
  if (!own) return c.json({ error: "Add your own key first." }, 400);
  const body = await c.req.json<{ model?: unknown }>().catch(() => ({}) as { model?: unknown });
  const model = typeof body.model === "string" ? body.model : "";
  if (!OWN_CHOICES.some((m) => m.id === model && m.provider === providerOf(own.model))) {
    return c.json({ error: "Your key can't use that model." }, 400);
  }
  await setOwnModel(auth.userId, model);
  return c.json({ ok: true, own: await ownKeyInfo(auth.userId) });
});

// DELETE /api-key — forget your key and go back to the team's AI.
app.delete("/api-key", async (c) => {
  const auth = await getAuth(c);
  if (!auth) return c.json({ error: "Not signed in." }, 401);
  await removeOwnKey(auth.userId);
  return c.json({ ok: true });
});

export default app;
