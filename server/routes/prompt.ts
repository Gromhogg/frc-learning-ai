import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.ts";
import { teamFacts } from "../../db/schema.ts";
import { getTeacher } from "../lib/require-auth.ts";
import {
  currentVersion,
  getTeamFacts,
  getVersion,
  listVersions,
  rollbackTo,
  savePromptVersion,
  type PromptVersion,
} from "../lib/prompt.ts";

const app = new Hono<{ Variables: { teacherId: number } }>();

// Everything here is teachers-only.
app.use("*", async (c, next) => {
  const teacher = await getTeacher(c);
  if (!teacher) return c.json({ error: "Teachers only." }, 403);
  // Handlers need this to record who wrote each version.
  c.set("teacherId", teacher.userId);
  await next();
});

/** What the editor needs to show the prompt and to save it back safely. */
function live(v: PromptVersion) {
  return {
    prompt: v.text,
    version: v.version,
    authorName: v.authorName,
    updatedAt: v.createdAt,
    note: v.note,
  };
}

// GET / — the prompt plus everything the app has learned about the team
app.get("/", async (c) => {
  const [version, facts] = await Promise.all([currentVersion(), getTeamFacts()]);
  return c.json({ ...live(version), facts });
});

// PUT / — save edited instructions as a new version.
//
// `baseVersion` is what the editor loaded. If it's stale we refuse and hand
// back what's live, so two teachers editing at once can see both texts instead
// of one of them silently losing their work.
app.put("/", async (c) => {
  const { prompt, baseVersion, note } = await c.req.json<{
    prompt: string;
    baseVersion: number;
    note?: string;
  }>();

  if (typeof prompt !== "string" || !prompt.trim()) {
    return c.json({ error: "The prompt can't be empty." }, 400);
  }
  if (!Number.isInteger(baseVersion)) {
    return c.json({ error: "Missing baseVersion — reload the page and try again." }, 400);
  }

  const result = await savePromptVersion({
    text: prompt,
    baseVersion,
    authorId: c.get("teacherId"),
    note: note?.trim() || null,
  });

  if (!result.ok) {
    return c.json(
      {
        error: `${result.conflict.authorName} saved a newer version while you were editing.`,
        current: live(result.conflict),
      },
      409,
    );
  }

  return c.json({ ok: true, ...live(result.version) });
});

// GET /history — every version, newest first, without the text bodies
app.get("/history", async (c) => {
  return c.json({ versions: await listVersions() });
});

// GET /history/:version — one full version, for previewing or diffing
app.get("/history/:version", async (c) => {
  const version = Number(c.req.param("version"));
  if (!Number.isInteger(version)) return c.json({ error: "Invalid version" }, 400);

  const found = await getVersion(version);
  if (!found) return c.json({ error: "No such version." }, 404);
  return c.json(live(found));
});

// POST /rollback — re-apply an old version as a new one on top
app.post("/rollback", async (c) => {
  const { version } = await c.req.json<{ version: number }>();
  if (!Number.isInteger(version)) return c.json({ error: "Invalid version" }, 400);

  const result = await rollbackTo(version, c.get("teacherId"));

  if ("missing" in result) return c.json({ error: "No such version." }, 404);
  if (!result.ok) {
    return c.json(
      {
        error: `${result.conflict.authorName} saved while you were reverting. Try again.`,
        current: live(result.conflict),
      },
      409,
    );
  }

  return c.json({ ok: true, ...live(result.version) });
});

// PATCH /facts/:id — fix a learned fact that came out slightly wrong
app.patch("/facts/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const { text } = await c.req.json<{ text: string }>();
  if (!id) return c.json({ error: "Invalid id" }, 400);
  if (typeof text !== "string" || !text.trim()) {
    return c.json({ error: "Fact text can't be empty." }, 400);
  }
  await db.update(teamFacts).set({ text: text.trim() }).where(eq(teamFacts.id, id));
  return c.json({ ok: true });
});

// DELETE /facts/:id — drop a fact that's wrong or no longer true
app.delete("/facts/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid id" }, 400);
  await db.delete(teamFacts).where(eq(teamFacts.id, id));
  return c.json({ ok: true });
});

export default app;
