import { Hono } from 'hono';
import { streamText, convertToModelMessages } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { db } from '../../db/index.ts';
import { topics } from '../../db/schema.ts';
import { loadKnowledgeFile } from '../lib/knowledge.ts';

const app = new Hono();

let cachedKnowledge: { text: string; builtAt: number } | null = null;
const CACHE_TTL_MS = 60_000;

async function buildCombinedKnowledge(): Promise<string> {
  if (cachedKnowledge && Date.now() - cachedKnowledge.builtAt < CACHE_TTL_MS) {
    return cachedKnowledge.text;
  }

  const allTopics = await db.select().from(topics);
  const sections: string[] = [];

  for (const t of allTopics) {
    try {
      const content = loadKnowledgeFile(t.filePath);
      sections.push(`━━━ TOPIC: ${t.name} ━━━\n${content}`);
    } catch {
      // Skip topics whose knowledge files are missing
    }
  }

  const text = sections.join('\n\n');
  cachedKnowledge = { text, builtAt: Date.now() };
  return text;
}

app.post('/', async (c) => {
  const body = await c.req.json<{ messages: unknown[] }>();
  const modelMessages = await convertToModelMessages(body.messages);

  const combined = await buildCombinedKnowledge();

  const systemPrompt = `You are a helpful robotics team knowledge assistant.

Your role: answer the user's questions using the knowledge base below. You are NOT a teacher, mentor, or assessor — you do NOT quiz them back, test them, or run a structured session. You are a reference tool: they ask, you answer.

Rules:
- Answer the question directly and concisely. Get to the point.
- Pull facts only from the knowledge base below. Cite the topic name when helpful (e.g. "According to Mill Safety...").
- If the answer isn't in the knowledge base, say so plainly — don't make things up.
- No quiz questions, no "now you try", no follow-up checks. Just answers.
- Use short paragraphs or bullet lists when appropriate. Plain text only — no widgets or tools.

━━━ KNOWLEDGE BASE ━━━
${combined || '(No knowledge available yet.)'}`;

  const anthropic = createAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const result = streamText({
    model: anthropic('claude-haiku-4-5-20251001'),
    system: systemPrompt,
    messages: modelMessages,
  });

  return result.toUIMessageStreamResponse();
});

export default app;
