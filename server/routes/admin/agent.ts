import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import { db } from "../../../db/index.ts";
import { agentChats, agentMessages, conversations, messageFeedback, promptDrafts, users } from "../../../db/schema.ts";
import { requireAdmin, type AdminEnv } from "../../lib/require-auth.ts";
import { createPromptEditor } from "../../agents/prompt-editor.ts";
import { describePromptStep } from "../../agents/prompt-tools.ts";
import { historyToMessages, orderedSender, runAgentTurn } from "../../ai/run-agent.ts";
import { modelFor } from "../../ai/models.ts";
import { NO_KEY, apiKeyFor } from "../../ai/api-keys.ts";
import { lastReview } from "../../agents/reviewer.ts";

// Admin chats with the prompt-editor agent. Each admin sees only their own.

const app = new Hono<AdminEnv>();
app.use("*", requireAdmin);

async function ownChat(id: number, adminId: number) {
  const [chat] = await db
    .select()
    .from(agentChats)
    .where(and(eq(agentChats.id, id), eq(agentChats.userId, adminId)));
  return chat ?? null;
}

app.get("/", async (c) => {
  const rows = await db
    .select()
    .from(agentChats)
    .where(eq(agentChats.userId, c.get("adminId")))
    .orderBy(desc(agentChats.updatedAt));
  return c.json(rows);
});

app.post("/", async (c) => {
  const [created] = await db.insert(agentChats).values({ userId: c.get("adminId") }).returning();
  return c.json(created, 201);
});

// ─── "Try asking" ideas ────────────────────────────────────────────────────
//
// Starter ideas for the prompt assistant, picked from simple counts — no AI
// call: this week's 👎 answers, words that keep coming up in student chat
// titles, and how long since the last review. Topped up with the usual ideas.

const STATIC_IDEAS = [
  "Make answers shorter for beginners",
  "Ask a follow-up question to check understanding",
  "Look at recent chats — what's going wrong?",
  "Add a rule: always mention safety glasses for the mill",
];

// Words too common to count as a topic.
const COMMON_WORDS = new Set(
  (
    "the and for with from about into are was were been does did doing done can could should would will " +
    "might must our you your its this that these those there here what whats when where which who why how " +
    "much many more most some any all not yes get got make making use using used need want help explain tell " +
    "show give know work works working difference between best way ways good new just like also than really " +
    "very thing things robot robots frc team please hey hello question chat set setup don didn doesn isn " +
    "won aren wasn haven"
  ).split(" "),
);

/** The word that shows up in the most recent student chat titles, if it's common enough. */
async function topTitleWord(): Promise<string | null> {
  const rows = await db
    .select({ title: conversations.title })
    .from(conversations)
    .innerJoin(users, eq(conversations.userId, users.id))
    .where(
      and(
        eq(users.role, "student"),
        ne(conversations.title, "New chat"),
        sql`${conversations.createdAt} >= datetime('now', '-14 days')`,
      ),
    )
    .orderBy(desc(conversations.id))
    .limit(300);

  // Count each word once per title; fold a plain plural ("motors") into "motor".
  const counts = new Map<string, { count: number; shown: string }>();
  for (const { title } of rows) {
    const words = new Set(title.toLowerCase().match(/[a-z0-9][a-z0-9+#]*/g) ?? []);
    for (const word of words) {
      if (word.length < 3 || COMMON_WORDS.has(word) || !/[a-z]/.test(word)) continue;
      const key = word.length > 4 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word;
      const entry = counts.get(key) ?? { count: 0, shown: key };
      entry.count += 1;
      counts.set(key, entry);
    }
  }
  const best = [...counts.values()].sort((a, b) => b.count - a.count)[0];
  return best && best.count >= 3 ? best.shown : null;
}

app.get("/ideas", async (c) => {
  const ideas: string[] = [];

  const [{ downs }] = await db
    .select({ downs: sql<number>`COUNT(*)` })
    .from(messageFeedback)
    .where(and(eq(messageFeedback.rating, "down"), sql`${messageFeedback.createdAt} >= datetime('now', '-7 days')`));
  if (downs === 1) ideas.push("Look at this week's 👎 answer — what went wrong?");
  else if (downs > 1) ideas.push(`Look at this week's ${downs} 👎 answers — what went wrong?`);

  const word = await topTitleWord();
  if (word) ideas.push(`Students keep asking about ${word} — should the prompt cover it better?`);

  // No review in a few days: reading recent chats is the most useful ask.
  const last = await lastReview();
  // `at` is SQLite-style "YYYY-MM-DD HH:MM:SS" in UTC, no marker.
  const lastMs = last ? new Date(`${last.at.replace(" ", "T")}Z`).getTime() : NaN;
  const daysSince = (Date.now() - lastMs) / 86_400_000;
  if (!(daysSince < 3)) ideas.push(STATIC_IDEAS[2]);

  for (const idea of STATIC_IDEAS) if (!ideas.includes(idea)) ideas.push(idea);
  return c.json({ ideas: ideas.slice(0, 4) });
});

app.get("/:id", async (c) => {
  const chat = await ownChat(Number(c.req.param("id")), c.get("adminId"));
  if (!chat) return c.json({ error: "Not found" }, 404);
  const rows = await db
    .select()
    .from(agentMessages)
    .where(eq(agentMessages.chatId, chat.id))
    .orderBy(asc(agentMessages.id));
  return c.json({
    ...chat,
    messages: rows.map((m) => ({ ...m, steps: JSON.parse(m.steps) as unknown[] })),
  });
});

app.delete("/:id", async (c) => {
  const chat = await ownChat(Number(c.req.param("id")), c.get("adminId"));
  if (!chat) return c.json({ error: "Not found" }, 404);
  // Drafts outlive the chat that made them — just unlink them.
  await db.update(promptDrafts).set({ agentChatId: null }).where(eq(promptDrafts.agentChatId, chat.id));
  await db.delete(agentMessages).where(eq(agentMessages.chatId, chat.id));
  await db.delete(agentChats).where(eq(agentChats.id, chat.id));
  return c.json({ ok: true });
});

// POST /:id/messages — { text } → streamed reply (Server-Sent Events)
app.post("/:id/messages", async (c) => {
  const adminId = c.get("adminId");
  const chat = await ownChat(Number(c.req.param("id")), adminId);
  if (!chat) return c.json({ error: "Not found" }, 404);

  const { text: raw } = await c.req.json<{ text: string }>();
  const text = (raw ?? "").trim();
  if (!text) return c.json({ error: "Empty message." }, 400);

  const apiKey = await apiKeyFor(adminId);
  if (!apiKey.key) return c.json({ error: NO_KEY }, 503);

  const prior = await db
    .select()
    .from(agentMessages)
    .where(eq(agentMessages.chatId, chat.id))
    .orderBy(asc(agentMessages.id));

  const [userRow] = await db
    .insert(agentMessages)
    .values({ chatId: chat.id, role: "user", text })
    .returning({ id: agentMessages.id });
  if (chat.title === "New chat") {
    const title = text.replace(/\s+/g, " ").slice(0, 50);
    await db.update(agentChats).set({ title }).where(eq(agentChats.id, chat.id));
  }

  const agent = await createPromptEditor({
    history: historyToMessages(prior, await modelFor("editor")),
    adminId,
    chatId: chat.id,
    apiKey: apiKey.key,
  });

  return streamSSE(c, async (stream) => {
    stream.onAbort(() => agent.abort());
    const { send, flushed } = orderedSender((data) => stream.writeSSE({ data }));

    const result = await runAgentTurn(agent, { text }, send, describePromptStep, { ownKey: apiKey.own });

    let messageId = 0;
    if (result.text || result.steps.length > 0) {
      const [saved] = await db
        .insert(agentMessages)
        .values({
          chatId: chat.id,
          role: "assistant",
          text: result.text,
          steps: JSON.stringify(result.steps.map((s) => ({ ...s, status: s.status === "running" ? "done" : s.status }))),
        })
        .returning({ id: agentMessages.id });
      messageId = saved.id;
    }
    await db
      .update(agentChats)
      .set({ updatedAt: new Date().toISOString() })
      .where(eq(agentChats.id, chat.id));

    if (result.error && result.error !== "Stopped.") send({ type: "error", message: result.error });
    send({ type: "done", messageId, userMessageId: userRow.id });
    await flushed();
  });
});

export default app;
