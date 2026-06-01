import { Hono } from "hono";
import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { db } from "../../db/index.ts";
import { assessments, users, topics } from "../../db/schema.ts";
import { eq, desc } from "drizzle-orm";
import { verifyToken } from "../lib/jwt.ts";

const app = new Hono();

// POST /api/admin/member-summary
// Computes an objective score from stored assessment data, then asks Claude
// to write a natural-language summary of the member's strengths and gaps.
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
    .limit(4);

  if (rows.length === 0) {
    return c.json({ summary: "No assessments on record yet.", score: null });
  }

  // Objective score: average of stored per-session scores (which are quiz-based)
  const storedScores = rows.map((r) => r.score).filter((s): s is number => s !== null);
  const score = storedScores.length > 0
    ? Math.round(storedScores.reduce((a, b) => a + b, 0) / storedScores.length)
    : null;

  // Build transcripts for the AI narrative (text only, no score responsibility)
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
    const transcript = lines.join("\n").slice(0, 2500);
    return `Session ${i + 1} — ${row.topicName ?? "Unknown Topic"} (score: ${row.score ?? "?"}%)\n${transcript}`;
  });

  const prompt = `You are reviewing the knowledge assessment history for a robotics team member named ${user.name}.

${sections.join("\n\n---\n\n")}

Write a concise 1-2 sentence summary of what ${user.name} genuinely understands and where their knowledge gaps are. Be specific — mention topics, concepts, or skills by name. Do NOT include a score — scoring is handled separately.

Respond with the summary text only, no JSON, no headers.`;

  try {
    const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const { text } = await generateText({
      model: anthropic("claude-haiku-4-5-20251001"),
      messages: [{ role: "user", content: prompt }],
    });
    return c.json({ summary: text.trim() || "No summary available.", score });
  } catch (err) {
    console.error("member-summary error:", err);
    return c.json({ summary: "Could not reach AI. Check ANTHROPIC_API_KEY.", score });
  }
});

// DELETE /api/admin/users/:id/assessments — clear all sessions for a student
app.delete("/users/:id/assessments", async (c) => {
  const id = Number(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid user id" }, 400);
  await db.delete(assessments).where(eq(assessments.userId, id));
  return c.json({ ok: true });
});

// ── User access management ────────────────────────────────────────────────────

const safeUserColumns = {
  id: users.id,
  name: users.name,
  email: users.email,
  googleId: users.googleId,
  avatarUrl: users.avatarUrl,
  status: users.status,
  role: users.role,
  createdAt: users.createdAt,
};

// GET /api/admin/pending-users
app.get("/pending-users", async (c) => {
  const pending = await db.select(safeUserColumns).from(users).where(eq(users.status, "pending"));
  return c.json(pending);
});

// GET /api/admin/all-users
app.get("/all-users", async (c) => {
  const all = await db.select(safeUserColumns).from(users);
  return c.json(all);
});

// POST /api/admin/users/:id/approve
app.post("/users/:id/approve", async (c) => {
  const id = Number(c.req.param("id"));
  await db.update(users).set({ status: "approved" }).where(eq(users.id, id));
  return c.json({ ok: true });
});

// POST /api/admin/users/:id/reject
app.post("/users/:id/reject", async (c) => {
  const id = Number(c.req.param("id"));
  await db.update(users).set({ status: "rejected" }).where(eq(users.id, id));
  return c.json({ ok: true });
});

// POST /api/admin/users/:id/remove
app.post("/users/:id/remove", async (c) => {
  const id = Number(c.req.param("id"));
  // Remove dependent assessments first — they FK-reference users.id
  await db.delete(assessments).where(eq(assessments.userId, id));
  await db.delete(users).where(eq(users.id, id));
  return c.json({ ok: true });
});

// POST /api/admin/users/:id/reset-password — clears the hash so the user can set a new one on next login
app.post("/users/:id/reset-password", async (c) => {
  const id = Number(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid user id" }, 400);
  await db.update(users).set({ passwordHash: null }).where(eq(users.id, id));
  return c.json({ ok: true });
});

// POST /api/admin/users/:id/set-role  (manager only)
app.post("/users/:id/set-role", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return c.json({ error: "Unauthorized" }, 401);
  const payload = await verifyToken(authHeader.slice(7));
  if (!payload || payload.role !== "manager") return c.json({ error: "Only managers can change roles" }, 403);

  const id = Number(c.req.param("id"));
  const { role } = await c.req.json<{ role: string }>();
  if (role !== "student" && role !== "admin" && role !== "manager") return c.json({ error: "Invalid role" }, 400);

  const updates: { role: "student" | "admin" | "manager"; status?: "approved" } = { role: role as "student" | "admin" | "manager" };
  if (role === "admin" || role === "manager") updates.status = "approved";
  await db.update(users).set(updates).where(eq(users.id, id));
  return c.json({ ok: true });
});

export default app;
