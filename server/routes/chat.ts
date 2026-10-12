import { Hono } from "hono";
import { streamText, convertToModelMessages, stepCountIs, tool, type UIMessage } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/index.ts";
import { conversations, messages as messagesTable } from "../../db/schema.ts";
import { getAuth } from "../lib/require-auth.ts";
import { buildSystemPrompt } from "../lib/prompt.ts";
import { listDocs, readDoc } from "../lib/docs.ts";
import { inlineLocalImages } from "../lib/uploads.ts";
import { noteExchange } from "../lib/learn.ts";
import { CHAT_MODEL, MAX_DOC_READS_PER_TURN } from "../lib/config.ts";

const app = new Hono();

// Lets the AI open one reference doc from the library mid-answer. Defined
// once at module scope on purpose: the tool definition sits ahead of the
// system prompt in Anthropic's cache prefix, so it has to be byte-identical
// between requests or every turn would miss the prompt cache.
const readDocTool = tool({
  description:
    "Open one document from the team's reference library (the REFERENCE DOCS list " +
    "in your instructions). Use it when a question needs machine procedures, specs, " +
    "or safety details. Pass the exact filename from the list.",
  inputSchema: z.object({
    name: z.string().describe('Exact filename from the reference docs list, e.g. "vertical-mill.md"'),
  }),
  execute: async ({ name }) => {
    const doc = readDoc(name);
    if (doc) return doc;
    // A structured miss instead of a throw, so the model can pick the right
    // name on its next step rather than giving up.
    return { error: `No doc named "${name}".`, available: listDocs().map((d) => d.name) };
  },
});

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
    tools: { read_doc: readDocTool },
    // Without this, the SDK stops after the first step — a turn that starts
    // with a read_doc call would end there, doc in hand but no answer sent.
    stopWhen: stepCountIs(MAX_DOC_READS_PER_TURN + 1),
    onFinish: async (event) => {
      // `event.text` is only the LAST step's text. When the model read a doc
      // mid-answer there are several steps, and anything it said before the
      // tool call would be silently dropped — so join every step's text.
      const text = event.steps
        .map((step) => step.text)
        .filter(Boolean)
        .join("\n\n");
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

      // Just a wake-up nudge — the background sweep extracts facts from the
      // whole conversation once it goes quiet, one batched call per session.
      noteExchange(conversationId);
    },
  });

  return result.toUIMessageStreamResponse();
});

export default app;
