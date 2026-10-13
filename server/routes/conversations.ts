import { Hono } from "hono";
import { eq, desc, and, inArray } from "drizzle-orm";
import { db } from "../../db/index.ts";
import { conversations, messageFeedback, messages, teamFacts } from "../../db/schema.ts";
import { getAuth } from "../lib/require-auth.ts";
import { feedbackFor } from "./chat.ts";

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

  const ratings = await feedbackFor(
    rows.filter((m) => m.role === "assistant").map((m) => m.id),
    auth.userId,
  );

  return c.json({
    ...conversation,
    messages: rows.map((m) => ({
      ...m,
      images: JSON.parse(m.images) as string[],
      steps: JSON.parse(m.steps) as unknown[],
      rating: ratings.get(m.id) ?? null,
    })),
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

  // Children first — feedback references messages, messages reference the
  // conversation.
  const ids = (
    await db.select({ id: messages.id }).from(messages).where(eq(messages.conversationId, id))
  ).map((m) => m.id);
  if (ids.length > 0) await db.delete(messageFeedback).where(inArray(messageFeedback.messageId, ids));
  await db.delete(messages).where(eq(messages.conversationId, id));
  // Learned facts outlive the chat they came from — just unlink them.
  await db
    .update(teamFacts)
    .set({ sourceConversationId: null })
    .where(eq(teamFacts.sourceConversationId, id));
  await db.delete(conversations).where(eq(conversations.id, id));

  return c.json({ ok: true });
});

export default app;
