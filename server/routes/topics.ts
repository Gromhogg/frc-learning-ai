import { Hono } from "hono";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "fs";
import { join } from "path";
import { db } from "../../db/index.ts";
import { topics } from "../../db/schema.ts";
import { eq } from "drizzle-orm";

const app = new Hono();

// GET /api/topics — list all topics
app.get("/", async (c) => {
  const allTopics = await db.select().from(topics);
  return c.json(allTopics);
});

// GET /api/topics/:id/content — read a knowledge file
app.get("/:id/content", async (c) => {
  const id = Number(c.req.param("id"));
  const [topic] = await db.select().from(topics).where(eq(topics.id, id));
  if (!topic) return c.json({ error: "Topic not found" }, 404);

  const absPath = join(process.cwd(), topic.filePath);
  if (!existsSync(absPath)) return c.json({ error: "File not found" }, 404);

  const content = readFileSync(absPath, "utf-8");
  return c.json({ content });
});

// PUT /api/topics/:id/content — overwrite a knowledge file
app.put("/:id/content", async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{ content: string }>();

  const [topic] = await db.select().from(topics).where(eq(topics.id, id));
  if (!topic) return c.json({ error: "Topic not found" }, 404);

  if (!topic.filePath.startsWith("knowledge/")) {
    return c.json({ error: "Invalid file path" }, 400);
  }

  const absPath = join(process.cwd(), topic.filePath);
  writeFileSync(absPath, body.content, "utf-8");
  return c.json({ ok: true });
});

// POST /api/topics — create a new topic + knowledge file
app.post("/", async (c) => {
  const body = await c.req.json<{ name: string; content?: string }>();

  const slug = body.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const filePath = `knowledge/${slug}.txt`;
  const absPath = join(process.cwd(), filePath);

  const initialContent =
    body.content?.trim() ||
    `# ${body.name}\n\nAdd your knowledge base content here. Describe what team members should know about this topic, including safety requirements, procedures, and best practices.`;

  writeFileSync(absPath, initialContent, "utf-8");

  const [newTopic] = await db
    .insert(topics)
    .values({ name: body.name, slug, filePath })
    .returning();

  return c.json(newTopic, 201);
});

// DELETE /api/topics/:id — delete a topic and its file
app.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const [topic] = await db.select().from(topics).where(eq(topics.id, id));
  if (!topic) return c.json({ error: "Topic not found" }, 404);

  if (topic.filePath.startsWith("knowledge/")) {
    const absPath = join(process.cwd(), topic.filePath);
    if (existsSync(absPath)) unlinkSync(absPath);
  }

  await db.delete(topics).where(eq(topics.id, id));
  return c.json({ ok: true });
});

export default app;
