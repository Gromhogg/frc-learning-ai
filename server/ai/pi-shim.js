// A slim stand-in for `@mariozechner/pi-ai`, used only when building for
// Cloudflare (see the alias in vite.config.ts).
//
// The real package's entry point loads every AI provider it supports
// (OpenAI, Google, Mistral, Bedrock…), and some of those can't run on
// Cloudflare Workers. We only use Claude, so this file exports just the
// pieces the Pi agent kit and our code need, wired to the Anthropic provider.
// Types still come from the real package (TypeScript ignores the alias).

// Plain JavaScript on purpose: it imports plain-JS files from inside the
// package by path, which TypeScript can't type-check.
import { streamSimpleAnthropic } from "../../node_modules/@mariozechner/pi-ai/dist/providers/anthropic.js";

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

/** Stream one reply (every model this app uses is a Claude model). */
export function streamSimple(model, context, options) {
  return streamSimpleAnthropic(model, context, options);
}

/** Get one whole reply. */
export async function completeSimple(model, context, options) {
  return streamSimple(model, context, options).result();
}
