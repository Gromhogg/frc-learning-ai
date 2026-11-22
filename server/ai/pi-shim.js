// A slim stand-in for `@mariozechner/pi-ai`, used only when building for
// Cloudflare (see the alias in vite.config.ts).
//
// The real package's entry point loads every AI provider it supports
// (Google, Mistral, Bedrock…), and some of those can't run on Cloudflare
// Workers. This file loads only the three this app uses: Claude, OpenAI's
// GPT models, and the OpenAI-style one the free model (Gemma 4 on Workers
// AI) speaks. Types still come from the real package (TypeScript ignores
// the alias).

// The dev server keeps a copy of this file inside its pre-built copy of the
// Pi agent kit. After changing it, start the dev server with `npx vite --force`.

// Plain JavaScript on purpose: it imports plain-JS files from inside the
// package by path, which TypeScript can't type-check.
import { streamSimpleAnthropic } from "../../node_modules/@mariozechner/pi-ai/dist/providers/anthropic.js";
import { streamSimpleOpenAICompletions } from "../../node_modules/@mariozechner/pi-ai/dist/providers/openai-completions.js";
import { streamSimpleOpenAIResponses } from "../../node_modules/@mariozechner/pi-ai/dist/providers/openai-responses.js";

export { Type } from "typebox";
export {
  EventStream,
  AssistantMessageEventStream,
  createAssistantMessageEventStream,
} from "../../node_modules/@mariozechner/pi-ai/dist/utils/event-stream.js";
export { parseStreamingJson } from "../../node_modules/@mariozechner/pi-ai/dist/utils/json-parse.js";
export {
  validateToolArguments,
  validateToolCall,
} from "../../node_modules/@mariozechner/pi-ai/dist/utils/validation.js";

const STREAMERS = {
  "anthropic-messages": streamSimpleAnthropic,
  "openai-responses": streamSimpleOpenAIResponses,
  "openai-completions": streamSimpleOpenAICompletions,
};

/** Stream one reply, in the way the model's company wants. */
export function streamSimple(model, context, options) {
  const stream = STREAMERS[model.api];
  if (!stream) throw new Error(`This app can't talk to "${model.api}" models.`);
  return stream(model, context, options);
}

/** Get one whole reply. */
export async function completeSimple(model, context, options) {
  return streamSimple(model, context, options).result();
}
