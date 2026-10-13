import type { Model } from "@mariozechner/pi-ai";
import { EDITOR_MODEL, LEARN_MODEL, TUTOR_MODEL } from "../lib/config.ts";

// Pi ships a built-in model list, but it doesn't know the Claude 5.5 family
// yet, so we describe the models ourselves. Prices are $ per million tokens
// and only feed Pi's usage/cost numbers.
//
// `reasoning: false` is deliberate. When Pi thinks a model "reasons" it sends
// thinking settings these models reject (`disabled`, or a token budget).
// Leaving it off makes Pi send no thinking field at all, and `withThinking()`
// below adds the right one to each request.

type Effort = "low" | "medium" | "high" | "xhigh" | "max";

const PRICES: Record<string, Model<"anthropic-messages">["cost"]> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
};

function claude(id: string): Model<"anthropic-messages"> {
  return {
    id,
    name: id,
    api: "anthropic-messages",
    provider: "anthropic",
    baseUrl: "https://api.anthropic.com",
    reasoning: false,
    input: ["text", "image"],
    cost: PRICES[id] ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 1_000_000,
    maxTokens: 128_000,
  };
}

export const tutorModel = claude(TUTOR_MODEL);
export const editorModel = claude(EDITOR_MODEL);
export const learnModel = claude(LEARN_MODEL);

/**
 * A Pi `onPayload` hook that turns on adaptive thinking with readable
 * summaries, sets effort, and caps output length.
 *
 * "summarized" matters beyond looks: Pi replays thinking blocks between tool
 * calls, and skips any with empty text — which is what the default
 * ("omitted") returns. Summaries keep those blocks intact.
 */
export function withThinking(effort: Effort, maxTokens = 32_000) {
  return (payload: unknown) => {
    const p = payload as Record<string, unknown>;
    return {
      ...p,
      max_tokens: maxTokens,
      thinking: { type: "adaptive", display: "summarized" },
      output_config: { ...((p.output_config as object) ?? {}), effort },
    };
  };
}
