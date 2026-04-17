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
    maxSteps: 3,
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
            items: { type: 'array', items: { type: 'string' }, description: 'List of checklist items (maximum 5)', maxItems: 5 },
          },
          required: ['title', 'items'],
        }),
        execute: async () => ({ displayed: true }),
      }),
      showDragOrder: tool({
        description:
          'Display a drag-and-drop ordering exercise where the student arranges items in the correct sequence.',
        inputSchema: jsonSchema<{ instruction: string; items: string[] }>({
          type: 'object',
          properties: {
            instruction: { type: 'string', description: 'What the student should order (e.g. "Put these mill setup steps in the correct order")' },
            items: { type: 'array', items: { type: 'string' }, description: 'The items in their CORRECT order. The widget will shuffle them for display.' },
          },
          required: ['instruction', 'items'],
        }),
        execute: async () => ({ displayed: true }),
      }),
      showScenario: tool({
        description:
          'Display a multi-step diagnostic scenario where the student makes choices to walk through a troubleshooting or decision process.',
        inputSchema: jsonSchema<{
          title: string;
          scenario: string;
          steps: Array<{
            id: string;
            prompt: string;
            choices: Array<{
              text: string;
              nextStepId: string | null;
              feedback: string;
              isOptimal: boolean;
            }>;
          }>;
        }>({
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Short title for the scenario' },
            scenario: { type: 'string', description: 'Initial situation description presented to the student' },
            steps: {
              type: 'array',
              description: 'Decision tree steps. Every choice nextStepId must reference a valid step id, or null to end.',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  prompt: { type: 'string' },
                  choices: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        text: { type: 'string' },
                        nextStepId: { type: ['string', 'null'] },
                        feedback: { type: 'string' },
                        isOptimal: { type: 'boolean' },
                      },
                      required: ['text', 'nextStepId', 'feedback', 'isOptimal'],
                    },
                  },
                },
                required: ['id', 'prompt', 'choices'],
              },
            },
          },
          required: ['title', 'scenario', 'steps'],
        }),
        execute: async () => ({ displayed: true }),
      }),
      showCodeRunner: tool({
        description:
          'Display a code/procedure editor where the student writes or completes a snippet. Used for G-code, pseudo-code, or structured procedures.',
        inputSchema: jsonSchema<{
          prompt: string;
          language: string;
          starterCode: string;
          expectedPatterns: string[];
          solutionCode: string;
        }>({
          type: 'object',
          properties: {
            prompt: { type: 'string', description: 'What the student should write or complete' },
            language: { type: 'string', description: 'Language hint: gcode, pseudocode, or procedure' },
            starterCode: { type: 'string', description: 'Pre-filled template. Use ___ for fill-in blanks, or empty string for free-write.' },
            expectedPatterns: {
              type: 'array',
              items: { type: 'string' },
              description: 'Key terms the student answer should contain. Used for client-side scoring.',
            },
            solutionCode: { type: 'string', description: 'The complete correct answer, revealed on request after submission.' },
          },
          required: ['prompt', 'language', 'starterCode', 'expectedPatterns', 'solutionCode'],
        }),
        execute: async () => ({ displayed: true }),
      }),
      showLabeledDiagram: tool({
        description:
          'Display an interactive labeled diagram where the student matches part names to numbered hotspot positions.',
        inputSchema: jsonSchema<{
          title: string;
          description: string;
          parts: Array<{ id: string; label: string; hint: string; x: number; y: number }>;
        }>({
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Diagram title (e.g. "Vertical Milling Machine — Front View")' },
            description: { type: 'string', description: 'Brief text description to orient the student' },
            parts: {
              type: 'array',
              description: 'Hotspot parts. Place in logical spatial positions: spindle top, table middle, base bottom. x/y are percentages where 0,0 = top-left, 100,100 = bottom-right.',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  label: { type: 'string', description: 'Correct part name' },
                  hint: { type: 'string', description: 'Short hint shown after a wrong guess' },
                  x: { type: 'number', description: 'Horizontal position as percentage (0–100)' },
                  y: { type: 'number', description: 'Vertical position as percentage (0–100)' },
                },
                required: ['id', 'label', 'hint', 'x', 'y'],
              },
            },
          },
          required: ['title', 'description', 'parts'],
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
