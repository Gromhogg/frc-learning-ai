import { Hono } from "hono";
import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { db } from "../../db/index.ts";
import { assessments, users, topics } from "../../db/schema.ts";
import { eq, desc } from "drizzle-orm";

const app = new Hono();

// POST /api/admin/member-summary
// Reads a member's assessment chat logs and asks Claude to write a natural-language
// summary of what they know and assign a holistic score.
app.post("/member-summary", async (c) => {
  const { userId } = await c.req.json<{ userId: number }>();

  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) return c.json({ error: "User not found" }, 404);

  const rows = await db
    .select({
      score: assessments.score,
      chatLog: assessments.chatLog,
      topicName: topics.name,
      createdAt: assessments.createdAt,
    })
    .from(assessments)
    .leftJoin(topics, eq(assessments.topicId, topics.id))
    .where(eq(assessments.userId, userId))
    .orderBy(desc(assessments.createdAt))
    .limit(4); // use the 4 most recent sessions

  if (rows.length === 0) {
    return c.json({ summary: "No assessments on record yet.", score: null });
  }

  // Extract readable text from each chat log, truncated to keep prompts short
  const sections = rows.map((row, i) => {
    const lines: string[] = [];
    try {
      const messages = JSON.parse(row.chatLog ?? "[]") as Record<string, unknown>[];
      for (const msg of messages) {
        const role = (msg.role as string) === "user" ? "Student" : "AI Tutor";
        if (Array.isArray(msg.parts)) {
          for (const part of msg.parts as Record<string, unknown>[]) {
            if (part.type === "text" && typeof part.text === "string" && (part.text as string).trim()) {
              lines.push(`${role}: ${(part.text as string).trim()}`);
            }
          }
        } else if (typeof msg.content === "string" && (msg.content as string).trim()) {
          lines.push(`${role}: ${(msg.content as string).trim()}`);
        }
      }
    } catch {
      // skip unparseable log
    }

    const transcript = lines.join("\n").slice(0, 2500); // cap each transcript
    return `Session ${i + 1} — ${row.topicName ?? "Unknown Topic"} (raw score: ${row.score}/100)\n${transcript}`;
  });

  const prompt = `You are reviewing the knowledge assessment history for a robotics team member named ${user.name}.

${sections.join("\n\n---\n\n")}

Based on the actual content of these conversations, write a concise 1-2 sentence summary of what ${user.name} genuinely understands and where their knowledge gaps are. Be specific — mention topics, concepts, or skills by name where possible. Then assign a single overall competency score from 0 to 100 that reflects your honest holistic read of their understanding (not just an average of the raw scores).

Respond with valid JSON only, no markdown fences:
{"summary": "...", "score": <integer 0-100>}`;

  try {
    const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const { text } = await generateText({
      model: anthropic("claude-haiku-4-5-20251001"),
      messages: [{ role: "user", content: prompt }],
    });

    // Strip markdown fences if Claude wrapped the JSON in them
    let cleaned = text.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    }

    try {
      const parsed = JSON.parse(cleaned) as { summary?: string; score?: number };
      const summary = typeof parsed.summary === "string" ? parsed.summary : cleaned;
      const score = typeof parsed.score === "number" ? Math.max(0, Math.min(100, Math.round(parsed.score))) : null;
      return c.json({ summary, score });
    } catch {
      // JSON didn't parse — return the raw text as the summary
      return c.json({ summary: cleaned || "No summary available.", score: null });
    }
  } catch (err) {
    console.error("member-summary error:", err);
    return c.json({ summary: "Could not reach AI. Check ANTHROPIC_API_KEY.", score: null }, 500);
  }
});

export default app;
