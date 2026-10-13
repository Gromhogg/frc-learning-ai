import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "../../../db/index.ts";
import { agentChats, agentMessages, promptDrafts } from "../../../db/schema.ts";
import { requireAdmin, type AdminEnv } from "../../lib/require-auth.ts";
import { createPromptEditor } from "../../agents/prompt-editor.ts";
import { describePromptStep } from "../../agents/prompt-tools.ts";
import { historyToMessages, runAgentTurn, type ClientEvent } from "../../ai/run-agent.ts";
import { editorModel } from "../../ai/models.ts";

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

  const agent = createPromptEditor({
    history: historyToMessages(prior, editorModel),
    adminId,
    chatId: chat.id,
  });

  return streamSSE(c, async (stream) => {
    stream.onAbort(() => agent.abort());
    const send = (event: ClientEvent) => void stream.writeSSE({ data: JSON.stringify(event) });

    const result = await runAgentTurn(agent, { text }, send, describePromptStep);

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
  });
});

export default app;
