import type { Api, Model } from "@mariozechner/pi-ai";
import type { ThinkingLevel } from "@mariozechner/pi-agent-core";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.ts";
import { settings } from "../../db/schema.ts";
import { EDITOR_MODEL, FREE_MODEL, LEARN_MODEL, TUTOR_MODEL } from "../lib/config.ts";
import { teamApiKey } from "./api-keys.ts";
import { FREE_AI_URL } from "./free-model.ts";

// Every model the app can use, and which one each agent uses right now.
//
//   free       Gemma 4 on Cloudflare Workers AI. No key; daily limit.
//   anthropic  Claude models. Needs a Claude API key.
//   openai     GPT models. Needs an OpenAI API key.
//
// Admins pick a model per agent on the Settings page. A paid model can only
// be picked once the team has that company's key. A person who adds their
// own key (menu → API key) picks a model for their own chats.

export type Provider = "free" | "anthropic" | "openai";
export type PaidProvider = Exclude<Provider, "free">;

export interface ModelChoice {
  id: string;
  provider: Provider;
  label: string;
  tier: string;
  price: string;
}

/** The models to choose from: the free one, then each company's, cheapest first. */
export const MODEL_CHOICES: readonly ModelChoice[] = [
  { id: FREE_MODEL, provider: "free", label: "Gemma 4 (Google)", tier: "Free, fast", price: "Free up to a daily limit" },
  { id: "claude-haiku-5-5", provider: "anthropic", label: "Claude Haiku 5.5", tier: "Fastest, cheapest Claude", price: "$0.10 / $0.50 per million tokens" },
  { id: "claude-sonnet-5-5", provider: "anthropic", label: "Claude Sonnet 5.5", tier: "Balanced", price: "$2 / $10 per million tokens" },
  { id: "claude-opus-5-5", provider: "anthropic", label: "Claude Opus 5.5", tier: "Smartest Claude", price: "$4 / $20 per million tokens" },
  { id: "gpt-5.4-nano", provider: "openai", label: "GPT-5.4 nano", tier: "Cheapest GPT", price: "$0.20 / $1.25 per million tokens" },
  { id: "gpt-5.4-mini", provider: "openai", label: "GPT-5.4 mini", tier: "Balanced", price: "$0.75 / $4.50 per million tokens" },
  { id: "gpt-5.5", provider: "openai", label: "GPT-5.5", tier: "Smartest GPT", price: "$5 / $30 per million tokens" },
];

/** The model someone's own key starts on, before they pick another. */
export const DEFAULT_OWN_MODEL: Record<PaidProvider, string> = {
  anthropic: "claude-sonnet-5-5",
  openai: "gpt-5.4-mini",
};

export const PROVIDER_NAMES: Record<Provider, string> = {
  free: "free",
  anthropic: "Claude",
  openai: "OpenAI",
};

export function findChoice(id: string): ModelChoice | undefined {
  return MODEL_CHOICES.find((m) => m.id === id);
}

export function providerOf(id: string): Provider {
  return findChoice(id)?.provider ?? "free";
}

export function labelOf(id: string): string {
  return findChoice(id)?.label ?? id;
}

// ─── the Pi model objects ──────────────────────────────────────────────────
//
// Prices are $ per million tokens and only feed Pi's usage numbers.

type Cost = Model<Api>["cost"];

const PRICES: Record<string, Cost> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  "gpt-5.4-nano": { input: 0.2, output: 1.25, cacheRead: 0.02, cacheWrite: 0 },
  "gpt-5.4-mini": { input: 0.75, output: 4.5, cacheRead: 0.075, cacheWrite: 0 },
  "gpt-5.5": { input: 5, output: 30, cacheRead: 0.5, cacheWrite: 0 },
};

const NO_COST: Cost = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

// `reasoning: false` is deliberate for Claude. When Pi thinks a Claude model
// "reasons" it sends thinking settings these models reject. Left off, Pi
// sends none, and agentSettings() below adds the right one to each request.
function claude(id: string): Model<"anthropic-messages"> {
  return {
    id,
    name: id,
    api: "anthropic-messages",
    provider: "anthropic",
    baseUrl: "https://api.anthropic.com",
    reasoning: false,
    input: ["text", "image"],
    cost: PRICES[id] ?? NO_COST,
    contextWindow: 1_000_000,
    maxTokens: 128_000,
  };
}

// Same settings as Pi's own list of OpenAI models. Pi handles GPT thinking.
function gpt(id: string): Model<"openai-responses"> {
  return {
    id,
    name: id,
    api: "openai-responses",
    provider: "openai",
    baseUrl: "https://api.openai.com/v1",
    reasoning: true,
    thinkingLevelMap: { off: null, xhigh: "xhigh" },
    input: ["text", "image"],
    cost: PRICES[id] ?? NO_COST,
    contextWindow: 272_000,
    maxTokens: 128_000,
  };
}

// `reasoning: true` with Gemma's own setting style makes Pi send
// enable_thinking: false, which keeps answers quick (see free-model.ts for
// the address).
function gemma(): Model<"openai-completions"> {
  return {
    id: FREE_MODEL,
    name: "Gemma 4",
    api: "openai-completions",
    provider: "cloudflare-workers-ai",
    baseUrl: FREE_AI_URL,
    reasoning: true,
    input: ["text", "image"],
    cost: NO_COST,
    contextWindow: 256_000,
    maxTokens: 16_000,
    compat: {
      thinkingFormat: "qwen-chat-template",
      maxTokensField: "max_tokens",
      supportsStore: false,
      supportsDeveloperRole: false,
      supportsStrictMode: false,
    },
  };
}

/** The Pi model object for a model id (the free model if it's unknown). */
export function modelObject(id: string): Model<Api> {
  switch (providerOf(id)) {
    case "anthropic":
      return claude(id);
    case "openai":
      return gpt(id);
    default:
      return gemma();
  }
}

// ─── which model each agent uses ───────────────────────────────────────────
//
// Stored in the `settings` table as model.tutor / model.editor / model.learn.
// config.ts holds the defaults. Read on every request, so a change applies
// to the next message.

export type AgentRole = "tutor" | "editor" | "learn";

const DEFAULTS: Record<AgentRole, string> = {
  tutor: TUTOR_MODEL,
  editor: EDITOR_MODEL,
  learn: LEARN_MODEL,
};

const cache = new Map<AgentRole, { id: string; until: number }>();

export function settingKey(role: AgentRole): string {
  return `model.${role}`;
}

export function isAllowedModel(id: string): boolean {
  return findChoice(id) !== undefined;
}

// Each server copy remembers the choice for a short time, so a change made on
// the Settings page reaches every copy within a minute.
const CACHE_MS = 60_000;

/**
 * The model id an agent should use right now. A paid model whose team key
 * is gone falls back to the free model. `fresh` skips the short cache — the
 * Settings page uses it so its "did someone change this?" check is exact.
 */
export async function modelIdFor(role: AgentRole, opts: { fresh?: boolean } = {}): Promise<string> {
  const cached = cache.get(role);
  if (!opts.fresh && cached && cached.until > Date.now()) return cached.id;
  const [row] = await db.select().from(settings).where(eq(settings.key, settingKey(role)));
  let id = row && isAllowedModel(row.value) ? row.value : DEFAULTS[role];
  const provider = providerOf(id);
  if (provider !== "free" && !(await teamApiKey(provider))) id = FREE_MODEL;
  cache.set(role, { id, until: Date.now() + CACHE_MS });
  return id;
}

/** Forget cached choices — call after the settings or team keys change. */
export function clearModelCache(): void {
  cache.clear();
}

// ─── request settings ──────────────────────────────────────────────────────

/** Gemma's "thinking off" switch. Pi also sends preserve_thinking, which made stray thinking text more likely. */
export const GEMMA_NO_THINKING = { chat_template_kwargs: { enable_thinking: false } };

type Effort = "low" | "medium" | "high";

/**
 * Thinking and answer length for an agent, in the form each company wants.
 *
 * Claude: adaptive thinking with readable summaries. "summarized" matters
 * beyond looks: Pi replays thinking blocks between tool calls, and skips any
 * with empty text — which is what the default ("omitted") returns.
 *
 * GPT: Pi turns the thinking level into OpenAI's reasoning setting.
 *
 * Gemma: thinking stays off. In testing it made answers 5–20 times slower
 * and often used up all the room before the answer.
 */
export function agentSettings(
  model: Model<Api>,
  effort: Effort,
  maxTokens = 32_000,
): { thinkingLevel: ThinkingLevel; onPayload: (payload: unknown) => unknown } {
  switch (model.api) {
    case "anthropic-messages":
      return {
        thinkingLevel: "off",
        onPayload: (payload) => {
          const p = payload as Record<string, unknown>;
          return {
            ...p,
            max_tokens: maxTokens,
            thinking: { type: "adaptive", display: "summarized" },
            output_config: { ...((p.output_config as object) ?? {}), effort },
          };
        },
      };
    case "openai-responses":
      return {
        thinkingLevel: effort,
        onPayload: (payload) => ({ ...(payload as object), max_output_tokens: maxTokens }),
      };
    default:
      return {
        thinkingLevel: "off",
        onPayload: (payload) => ({ ...(payload as object), ...GEMMA_NO_THINKING, max_tokens: Math.min(maxTokens, model.maxTokens) }),
      };
  }
}
