import { Hono } from 'hono';
import { streamText, tool, jsonSchema, convertToModelMessages } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { topics } from '../../db/schema.ts';
import { loadKnowledgeFile } from '../lib/knowledge.ts';
import { buildSystemPrompt } from '../lib/ai.ts';

const app = new Hono();

app.post('/', async (c) => {
  const body = await c.req.json<{
    messages: unknown[];
    topicId: number;
    userId: number;
  }>();

  const { topicId } = body;

  // DefaultChatTransport sends UIMessage[] (with parts), convert to ModelMessage[]
  const modelMessages = await convertToModelMessages(body.messages);

  // Load topic from DB
  const [topic] = await db
    .select()
    .from(topics)
    .where(eq(topics.id, topicId))
    .limit(1);

  if (!topic) {
    return c.json({ error: `Topic with id ${topicId} not found` }, 404);
  }

  // Load knowledge file content
  let knowledgeContent: string;
  try {
    knowledgeContent = loadKnowledgeFile(topic.filePath);
  } catch (err) {
    return c.json(
      { error: (err as Error).message },
      500
    );
  }

  // Build system prompt
  const systemPrompt = buildSystemPrompt(topic.name, knowledgeContent);

  // Create an Anthropic client that reads ANTHROPIC_API_KEY from process.env
  const anthropic = createAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  // Stream the response
  const result = streamText({
    model: anthropic('claude-haiku-4-5-20251001'),
    system: systemPrompt,
    messages: modelMessages,
    maxSteps: 1,
    tools: {
      showQuiz: tool({
        description:
          'Display a multiple-choice quiz question to the student to check factual recall.',
        inputSchema: jsonSchema<{ question: string; options: string[]; correctIndex: number }>({
          type: 'object',
          properties: {
            question: { type: 'string', description: 'The quiz question to ask' },
            options: { type: 'array', items: { type: 'string' }, description: 'List of answer choices' },
            correctIndex: { type: 'number', description: 'Zero-based index of the correct answer in the options array' },
          },
          required: ['question', 'options', 'correctIndex'],
        }),
        execute: async () => ({ displayed: true }),
      }),
      showChecklist: tool({
        description:
          'Display a checklist to the student to assess procedural knowledge.',
        inputSchema: jsonSchema<{ title: string; items: string[] }>({
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Title of the checklist' },
            items: { type: 'array', items: { type: 'string' }, description: 'List of checklist items' },
          },
          required: ['title', 'items'],
        }),
        execute: async () => ({ displayed: true }),
      }),
    },
  });

  // Return the AI SDK UI message stream so the DefaultChatTransport on the
  // client can parse the JSON event protocol correctly (v6 requirement).
  return result.toUIMessageStreamResponse();
});

export default app;
