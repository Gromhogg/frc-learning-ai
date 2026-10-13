import { Agent, type AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@mariozechner/pi-ai";
import { listDocs, readDoc } from "../lib/docs.ts";
import { buildSystemPrompt } from "../lib/prompt.ts";
import { MAX_DOC_READS_PER_TURN } from "../lib/config.ts";
import { tutorModel, withThinking } from "../ai/models.ts";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { DescribeStep } from "../ai/run-agent.ts";

// The agent students chat with. One Pi Agent per request: it gets the live
// system prompt, the saved history, and one tool for opening reference docs.

// Defined once at module level on purpose: tools sit ahead of the system
// prompt in Anthropic's cache prefix, so the definition has to be
// byte-identical between requests or every turn would miss the prompt cache.
export const readDocTool: AgentTool = {
  name: "read_doc",
  label: "Read doc",
  description:
    "Open one document from the team's reference library (the REFERENCE DOCS list " +
    "in your instructions). Use it when a question needs machine procedures, specs, " +
    "or safety details. Pass the exact filename from the list.",
  parameters: Type.Object({
    name: Type.String({
      description: 'Exact filename from the reference docs list, e.g. "vertical-mill.md"',
    }),
  }),
  execute: async (_id, params) => {
    const { name } = params as { name: string };
    const doc = readDoc(name);
    if (doc) {
      return { content: [{ type: "text", text: doc.content }], details: { name: doc.name } };
    }
    // A clear miss instead of a throw, so the model can pick the right name
    // on its next step rather than giving up.
    const available = listDocs().map((d) => d.name).join(", ");
    return {
      content: [{ type: "text", text: `No doc named "${name}". Available: ${available}` }],
      details: { name, missing: true },
    };
  },
};

export const describeTutorStep: DescribeStep = (tool, args) =>
  tool === "read_doc" ? `Reading ${String(args.name ?? "a doc")}` : tool;

export async function createTutor(history: AgentMessage[]): Promise<Agent> {
  let docReads = 0;
  return new Agent({
    initialState: {
      systemPrompt: await buildSystemPrompt(),
      model: tutorModel,
      thinkingLevel: "off",
      tools: [readDocTool],
      messages: history,
    },
    // Chat answers don't need deep thinking; low effort keeps replies quick.
    onPayload: withThinking("low", 16_000),
    toolExecution: "sequential",
    // Bound the cost of one answer: past the limit, the model is told to
    // answer with what it has.
    beforeToolCall: async () => {
      docReads += 1;
      if (docReads > MAX_DOC_READS_PER_TURN) {
        return { block: true, reason: "Doc limit reached for this answer. Answer with what you have." };
      }
      return undefined;
    },
  });
}
