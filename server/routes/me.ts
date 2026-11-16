import { waitUntil } from "cloudflare:workers";
import { Hono } from "hono";
import { getAuth } from "../lib/require-auth.ts";
import { clearInterests, getInterests, saveDescribedInterests } from "../lib/interests.ts";
import { describeInterests, MAX_DESCRIBE_CHARS } from "../lib/describe-interests.ts";
import { rebuild } from "../lib/suggestions.ts";
import { takeAttempt } from "../lib/limits.ts";
import {
  apiKeyFor,
  checkKey,
  cleanKey,
  NO_KEY,
  ownKeyInfo,
  removeOwnKey,
  saveOwnKey,
  teamApiKey,
} from "../ai/api-keys.ts";

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

  const { key } = await apiKeyFor(auth.userId);
  if (!key) return c.json({ error: NO_KEY }, 503);

  const described = await describeInterests(text, key);
  if (!described) return c.json({ error: "The AI couldn't read that right now. Try again in a minute." }, 502);
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
// Anyone can run their chats on their own Claude key instead of the team's.
// The key itself never comes back out — only its last 4 characters.

/** Key checks per person, so this can't be used to test stolen keys in bulk. */
const KEY_CHECKS = 10;
const KEY_CHECK_WINDOW_MS = 15 * 60 * 1000;

// GET /api-key → { own: { hint, addedAt } | null, teamKey: boolean }
app.get("/api-key", async (c) => {
  const auth = await getAuth(c);
  if (!auth) return c.json({ error: "Not signed in." }, 401);
  return c.json({ own: await ownKeyInfo(auth.userId), teamKey: Boolean(await teamApiKey()) });
});

// PUT /api-key — { key }. Checked with Anthropic before it's saved.
app.put("/api-key", async (c) => {
  const auth = await getAuth(c);
  if (!auth) return c.json({ error: "Not signed in." }, 401);
  const body = await c.req.json<{ key?: unknown }>().catch(() => ({}) as { key?: unknown });
  const cleaned = cleanKey(body.key);
  if (!cleaned.ok) return c.json({ error: cleaned.error }, 400);

  const limit = await takeAttempt(`apikey:${auth.userId}`, KEY_CHECKS, KEY_CHECK_WINDOW_MS);
  if (!limit.allowed) return c.json({ error: "Too many tries. Wait a few minutes and try again." }, 429);
  const check = await checkKey(cleaned.key);
  if (!check.ok) return c.json({ error: check.error }, 400);

  await saveOwnKey(auth.userId, cleaned.key);
  return c.json({ ok: true, own: await ownKeyInfo(auth.userId) });
});

// DELETE /api-key — forget your key and go back to the team key.
app.delete("/api-key", async (c) => {
  const auth = await getAuth(c);
  if (!auth) return c.json({ error: "Not signed in." }, 401);
  await removeOwnKey(auth.userId);
  return c.json({ ok: true });
});

export default app;
