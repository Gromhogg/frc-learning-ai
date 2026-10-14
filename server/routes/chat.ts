import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "../../db/index.ts";
import { conversations, messageFeedback, messages, slackMessages } from "../../db/schema.ts";
import { getAuth } from "../lib/require-auth.ts";
import { readImageForModel, MAX_IMAGES_PER_MESSAGE } from "../lib/uploads.ts";
import { createTutor, describeTutorStep } from "../agents/tutor.ts";
import { historyToMessages, orderedSender, runAgentTurn } from "../ai/run-agent.ts";
import { modelFor } from "../ai/models.ts";
import { NO_KEY, apiKeyFor } from "../ai/api-keys.ts";
import type { ImageContent } from "@mariozechner/pi-ai";

const app = new Hono();

/** First line of the first question, used as the sidebar label. */
function titleFrom(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (oneLine.length <= 50) return oneLine || "New chat";
  return `${oneLine.slice(0, 50).replace(/\s+\S*$/, "")}…`;
}

async function imagesFor(paths: string[]): Promise<ImageContent[]> {
  const images = await Promise.all(paths.map(readImageForModel));
  return images.filter((i): i is ImageContent => i !== null);
}

// POST / — send a message (or retry the last answer) and stream the reply.
//
// Body: { conversationId, text, images? }  or  { conversationId, retry: true }
//
// The server owns the history: it loads saved messages from the database
// rather than trusting whatever the browser sends.
app.post("/", async (c) => {
  const auth = await getAuth(c);
  if (!auth) return c.json({ error: "Not signed in." }, 401);

  const body = await c.req.json<{
    conversationId: number;
    text?: string;
    images?: string[];
    retry?: boolean;
  }>();
  const conversationId = Number(body.conversationId);

  const [conversation] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.userId, auth.userId)));
  if (!conversation) return c.json({ error: "Conversation not found." }, 404);

  // Checked before anything is saved, so a missing key doesn't leave a
  // question with no answer.
  const apiKey = await apiKeyFor(auth.userId);
  if (!apiKey.key) return c.json({ error: NO_KEY }, 503);

  let userText: string;
  let userImages: string[];
  let userMessageId: number | undefined;

  if (body.retry) {
    // Drop the last answer (and any thumbs on it), then re-answer the last
    // question as-is.
    const [last] = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(desc(messages.id))
      .limit(1);
    if (last?.role === "assistant") {
      // Children first (the database enforces links): thumbs, the Slack
      // copy of the reply (if it came from Slack), then the reply itself.
      await db.delete(messageFeedback).where(eq(messageFeedback.messageId, last.id));
      await db.delete(slackMessages).where(eq(slackMessages.messageId, last.id));
      await db.delete(messages).where(eq(messages.id, last.id));
    }
    const [question] = await db
      .select()
      .from(messages)
      .where(and(eq(messages.conversationId, conversationId), eq(messages.role, "user")))
      .orderBy(desc(messages.id))
      .limit(1);
    if (!question) return c.json({ error: "Nothing to retry." }, 400);
    userText = question.text;
    userImages = JSON.parse(question.images) as string[];
  } else {
    userText = (body.text ?? "").trim();
    userImages = (body.images ?? [])
      .filter((p) => typeof p === "string" && p.startsWith("/uploads/"))
      .slice(0, MAX_IMAGES_PER_MESSAGE);
    if (!userText && userImages.length === 0) return c.json({ error: "Empty message." }, 400);

    // Save the question right away, so nothing is lost if the stream drops.
    const [saved] = await db
      .insert(messages)
      .values({ conversationId, role: "user", text: userText, images: JSON.stringify(userImages) })
      .returning({ id: messages.id });
    userMessageId = saved.id;

    if (conversation.title === "New chat" && userText) {
      await db
        .update(conversations)
        .set({ title: titleFrom(userText) })
        .where(eq(conversations.id, conversationId));
    }
  }

  // Everything before the question being answered.
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.id));
  const prior = await Promise.all(
    rows.slice(0, -1).map(async (m) => ({
      role: m.role,
      text: m.text,
      images: m.role === "user" ? await imagesFor(JSON.parse(m.images) as string[]) : undefined,
    })),
  );

  const agent = await createTutor(historyToMessages(prior, await modelFor("tutor")), apiKey.key);

  return streamSSE(c, async (stream) => {
    stream.onAbort(() => agent.abort());
    const { send, flushed } = orderedSender((data) => stream.writeSSE({ data }));

    const result = await runAgentTurn(
      agent,
      { text: userText, images: await imagesFor(userImages) },
      send,
      describeTutorStep,
      { ownKey: apiKey.own },
    );

    // Save whatever was written, even after a stop or an error, so the
    // thread on screen matches the thread on disk.
    let messageId = 0;
    if (result.text || result.steps.length > 0) {
      const [saved] = await db
        .insert(messages)
        .values({
          conversationId,
          role: "assistant",
          text: result.text,
          steps: JSON.stringify(result.steps.map(({ id, tool, label, images }) => ({ id, tool, label, status: "done", images }))),
        })
        .returning({ id: messages.id });
      messageId = saved.id;
    }
    await db
      .update(conversations)
      .set({ updatedAt: new Date().toISOString() })
      .where(eq(conversations.id, conversationId));

    if (result.error && result.error !== "Stopped.") send({ type: "error", message: result.error });
    send({ type: "done", messageId, userMessageId });
    await flushed();
  });
});

// POST /feedback — thumbs up/down on one answer: { messageId, rating, comment? }
// Sending the same rating again clears it.
app.post("/feedback", async (c) => {
  const auth = await getAuth(c);
  if (!auth) return c.json({ error: "Not signed in." }, 401);

  const { messageId, rating, comment } = await c.req.json<{
    messageId: number;
    rating: "up" | "down" | null;
    comment?: string;
  }>();

  // Only your own conversations' answers can be rated.
  const [owned] = await db
    .select({ id: messages.id })
    .from(messages)
    .innerJoin(conversations, eq(messages.conversationId, conversations.id))
    .where(
      and(
        eq(messages.id, Number(messageId)),
        eq(messages.role, "assistant"),
        eq(conversations.userId, auth.userId),
      ),
    );
  if (!owned) return c.json({ error: "Message not found." }, 404);

  await db
    .delete(messageFeedback)
    .where(and(eq(messageFeedback.messageId, owned.id), eq(messageFeedback.userId, auth.userId)));
  if (rating === "up" || rating === "down") {
    await db.insert(messageFeedback).values({
      messageId: owned.id,
      userId: auth.userId,
      rating,
      comment: comment?.trim().slice(0, 500) || null,
    });
  }
  return c.json({ ok: true });
});

export default app;

/** Feedback for a set of messages, for showing the thumbs state on load. */
export async function feedbackFor(messageIds: number[], userId: number) {
  if (messageIds.length === 0) return new Map<number, "up" | "down">();
  const rows = await db
    .select({ messageId: messageFeedback.messageId, rating: messageFeedback.rating })
    .from(messageFeedback)
    .where(and(inArray(messageFeedback.messageId, messageIds), eq(messageFeedback.userId, userId)));
  return new Map(rows.map((r) => [r.messageId, r.rating]));
}
