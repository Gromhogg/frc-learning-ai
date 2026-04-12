import { Hono } from "hono";
import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { db } from "../../db/index.ts";
import { assessments, users, topics } from "../../db/schema.ts";
import { eq, desc } from "drizzle-orm";

const app = new Hono();

// GET /api/assessments — all assessments joined with user and topic names
app.get("/", async (c) => {
  const results = await db
    .select({
      id: assessments.id,
      userId: assessments.userId,
      topicId: assessments.topicId,
      score: assessments.score,
      chatLog: assessments.chatLog,
      createdAt: assessments.createdAt,
      userName: users.name,
      topicName: topics.name,
    })
    .from(assessments)
    .leftJoin(users, eq(assessments.userId, users.id))
    .leftJoin(topics, eq(assessments.topicId, topics.id))
    .orderBy(desc(assessments.createdAt));

  return c.json(results);
});

// GET /api/assessments/:userId — assessments for a specific user
app.get("/:userId", async (c) => {
  const userId = Number(c.req.param("userId"));

  const results = await db
    .select({
      id: assessments.id,
      userId: assessments.userId,
      topicId: assessments.topicId,
      score: assessments.score,
      chatLog: assessments.chatLog,
      createdAt: assessments.createdAt,
      userName: users.name,
      topicName: topics.name,
    })
    .from(assessments)
    .leftJoin(users, eq(assessments.userId, users.id))
    .leftJoin(topics, eq(assessments.topicId, topics.id))
    .where(eq(assessments.userId, userId))
    .orderBy(desc(assessments.createdAt));

  return c.json(results);
});

// POST /api/assessments/extract-score — ask Claude to extract a 0-100 score from a chat log
app.post("/extract-score", async (c) => {
  const body = await c.req.json<{ chatLog: string }>();

  try {
    const anthropic = createAnthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const { text } = await generateText({
      model: anthropic("claude-haiku-4-5-20251001"),
      messages: [
        {
          role: "user",
          content: `The following is a JSON-encoded chat log from a robotics team knowledge assessment session. Your job is to extract the final score the mentor assigned to the student.

Rules:
- Return ONLY a single integer between 0 and 100 — nothing else, no explanation.
- If no explicit score is mentioned, estimate one based on the quality of the student's answers.
- If the chat is empty or you cannot determine any score at all, return 0.

Chat log:
${body.chatLog}`,
        },
      ],
    });

    const parsed = parseInt(text.trim(), 10);
    const score = Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : 0;

    return c.json({ score });
  } catch (err) {
    console.error("extract-score error:", err);
    return c.json({ score: 0 });
  }
});

// POST /api/assessments — save a new assessment
app.post("/", async (c) => {
  const body = await c.req.json<{
    userId: number;
    topicId: number;
    score: number;
    chatLog: string;
  }>();

  const [newAssessment] = await db
    .insert(assessments)
    .values({
      userId: body.userId,
      topicId: body.topicId,
      score: body.score,
      chatLog: body.chatLog,
    })
    .returning();

  return c.json(newAssessment, 201);
});

// DELETE /api/assessments/:id — delete a single assessment
app.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  await db.delete(assessments).where(eq(assessments.id, id));
  return c.json({ ok: true });
});

export default app;
