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
          content: `The following is a JSON-encoded chat log from a robotics team knowledge assessment session. Your job is to calculate the student's score.

Rules:
- Score = round((sum of per-answer scores ÷ questions answered) × 100).
- For each question the mentor asked, assign the student's answer a score from 0.0 to 1.0: 1.0 fully correct, 0.0 fully wrong, partial values (e.g. 0.25, 0.5, 0.75) for partially correct answers.
- For multiple-choice quiz widgets, use the correctIndex as ground truth but still allow partial credit if the answer shows partial understanding.
- If an explicit "Score: X/100" line appears at the end of the chat, trust that value directly instead of re-calculating.
- Return ONLY a single integer between 0 and 100 — nothing else, no explanation.
- If the chat is empty or no questions were answered, return 0.

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

// PATCH /api/assessments/:id/score — manually override a score
app.patch("/:id/score", async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{ score: number }>();
  const score = Math.max(0, Math.min(100, Math.round(body.score)));
  const [updated] = await db
    .update(assessments)
    .set({ score })
    .where(eq(assessments.id, id))
    .returning();
  if (!updated) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true, score: updated.score });
});

// DELETE /api/assessments/:id — delete a single assessment
app.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  await db.delete(assessments).where(eq(assessments.id, id));
  return c.json({ ok: true });
});

export default app;
