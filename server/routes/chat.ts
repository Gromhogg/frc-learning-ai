import { Hono } from "hono";
import { streamText, convertToModelMessages, type UIMessage } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { eq, and } from "drizzle-orm";
import { db } from "../../db/index.ts";
import { conversations, messages as messagesTable } from "../../db/schema.ts";
import { getAuth } from "../lib/require-auth.ts";
import { buildSystemPrompt } from "../lib/prompt.ts";
import { inlineLocalImages } from "../lib/uploads.ts";
import { learnFromExchange } from "../lib/learn.ts";
import { CHAT_MODEL } from "../lib/config.ts";

const app = new Hono();

/** Pull the plain text out of a UIMessage's parts. */
function textOf(message: UIMessage): string {
  return message.parts
    .filter((p) => p.type === "text")
    .map((p) => (p as { text: string }).text)
    .join("")
    .trim();
}

/** Pull attached image URLs out of a UIMessage's parts. */
function imagesOf(message: UIMessage): string[] {
  return message.parts
    .filter((p) => p.type === "file" && (p as { mediaType?: string }).mediaType?.startsWith("image/"))
    .map((p) => (p as { url: string }).url);
}

/** First line of the first question, used as the sidebar label. */
function titleFrom(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (oneLine.length <= 50) return oneLine || "New chat";
  return `${oneLine.slice(0, 50).replace(/\s+\S*$/, "")}…`;
}

app.post("/", async (c) => {
  const auth = await getAuth(c);
  if (!auth) return c.json({ error: "Not signed in." }, 401);

  const body = await c.req.json<{ messages: UIMessage[]; conversationId: number }>();
  const conversationId = Number(body.conversationId);

  const [conversation] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.userId, auth.userId)));

  if (!conversation) return c.json({ error: "Conversation not found." }, 404);

  const lastUserMessage = [...body.messages].reverse().find((m) => m.role === "user");
  const userText = lastUserMessage ? textOf(lastUserMessage) : "";
  const userImages = lastUserMessage ? imagesOf(lastUserMessage) : [];

  // Save the student's message right away, so nothing is lost if the
  // stream drops halfway through.
  if (lastUserMessage) {
    await db.insert(messagesTable).values({
      conversationId,
      role: "user",
      text: userText,
      images: JSON.stringify(userImages),
    });

    if (conversation.title === "New chat" && userText) {
      await db
        .update(conversations)
        .set({ title: titleFrom(userText) })
        .where(eq(conversations.id, conversationId));
    }
  }

  const systemPrompt = await buildSystemPrompt();
  const modelMessages = inlineLocalImages(await convertToModelMessages(body.messages));

  const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const result = streamText({
    model: anthropic(CHAT_MODEL),
    messages: [
      {
        role: "system",
        content: systemPrompt,
        // The prompt barely changes between messages, so caching it is a
        // straight cost saving on every single turn.
        providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
      },
      ...modelMessages,
    ],
    onFinish: async ({ text }) => {
      try {
        await db.insert(messagesTable).values({
          conversationId,
          role: "assistant",
          text,
        });
        await db
          .update(conversations)
          .set({ updatedAt: new Date().toISOString() })
          .where(eq(conversations.id, conversationId));
      } catch (err) {
        console.error("Failed to save assistant message:", err);
      }

      // Deliberately not awaited — the student already has their answer and
      // shouldn't wait on background bookkeeping.
      void learnFromExchange(userText, text, userImages.length > 0);
    },
  });

  return result.toUIMessageStreamResponse();
});

export default app;
