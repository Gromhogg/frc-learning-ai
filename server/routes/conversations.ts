import { Hono } from "hono";
import { eq, desc, and } from "drizzle-orm";
import { db } from "../../db/index.ts";
import { conversations, messages } from "../../db/schema.ts";
import { getAuth } from "../lib/require-auth.ts";

const app = new Hono();

// GET / — the sidebar list for whoever is signed in
app.get("/", async (c) => {
  const auth = await getAuth(c);
  if (!auth) return c.json({ error: "Not signed in." }, 401);

  const rows = await db
    .select()
    .from(conversations)
    .where(eq(conversations.userId, auth.userId))
    .orderBy(desc(conversations.updatedAt));

  return c.json(rows);
});

// GET /:id — one conversation with its messages
app.get("/:id", async (c) => {
  const auth = await getAuth(c);
  if (!auth) return c.json({ error: "Not signed in." }, 401);

  const id = Number(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid id" }, 400);

  // Matching on BOTH id and userId is what stops someone reading another
  // student's chat by guessing the number in the URL.
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.userId, auth.userId)));

  if (!conversation) return c.json({ error: "Not found" }, 404);

  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(messages.id);

  return c.json({
    ...conversation,
    messages: rows.map((m) => ({ ...m, images: JSON.parse(m.images) as string[] })),
  });
});

// POST / — start a new chat
app.post("/", async (c) => {
  const auth = await getAuth(c);
  if (!auth) return c.json({ error: "Not signed in." }, 401);

  const [created] = await db
    .insert(conversations)
    .values({ userId: auth.userId })
    .returning();

  return c.json(created, 201);
});

// DELETE /:id — remove a chat and everything in it
app.delete("/:id", async (c) => {
  const auth = await getAuth(c);
  if (!auth) return c.json({ error: "Not signed in." }, 401);

  const id = Number(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid id" }, 400);

  const [conversation] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.userId, auth.userId)));

  if (!conversation) return c.json({ error: "Not found" }, 404);

  // Messages first — they reference the conversation.
  await db.delete(messages).where(eq(messages.conversationId, id));
  await db.delete(conversations).where(eq(conversations.id, id));

  return c.json({ ok: true });
});

export default app;
