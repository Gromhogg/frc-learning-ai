import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.ts";
import { teamFacts } from "../../db/schema.ts";
import { getTeacher } from "../lib/require-auth.ts";
import { getBasePrompt, saveBasePrompt, getTeamFacts } from "../lib/prompt.ts";

const app = new Hono();

// Everything here is teachers-only.
app.use("*", async (c, next) => {
  const teacher = await getTeacher(c);
  if (!teacher) return c.json({ error: "Teachers only." }, 403);
  await next();
});

// GET / — the prompt plus everything the app has learned about the team
app.get("/", async (c) => {
  return c.json({ prompt: await getBasePrompt(), facts: await getTeamFacts() });
});

// PUT / — save edited instructions
app.put("/", async (c) => {
  const { prompt } = await c.req.json<{ prompt: string }>();
  if (typeof prompt !== "string" || !prompt.trim()) {
    return c.json({ error: "The prompt can't be empty." }, 400);
  }
  await saveBasePrompt(prompt);
  return c.json({ ok: true });
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
