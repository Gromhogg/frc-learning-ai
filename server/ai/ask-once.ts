import { completeSimple } from "@mariozechner/pi-ai";
import { FREE_USE_HEADER, isFreeUsedUp, type FreeUse } from "./free-model.ts";
import { GEMMA_NO_THINKING, type AgentRole } from "./models.ts";
import { teamAi, whyNot } from "./pick.ts";

// One small AI call with no tools: learning facts, summing up interests,
// starter suggestions, review notes. Runs on the team's model for `role`.
//
// With `schema`, the answer is JSON. Each company asks for that differently:
// Claude and GPT take the schema directly. Gemma's strict schema mode is
// broken (it stops early and pads with spaces), so it gets plain JSON mode
// and the schema in its instructions.

export interface OneJob {
  instructions: string;
  input: string;
  maxTokens: number;
  schema?: object;
  /** "background" stops sooner on the free model, leaving room for chats. */
  use: FreeUse;
}

export async function askOnce(
  role: AgentRole,
  job: OneJob,
): Promise<{ ok: true; text: string } | { ok: false; error: string; usedUp: boolean }> {
  const ai = await teamAi(role);
  const blocked = await whyNot(ai, job.use);
  if (blocked) return { ok: false, error: blocked, usedUp: true };
  const failed = (error: string) => ({ ok: false as const, error, usedUp: isFreeUsedUp(error) });

  const { schema, maxTokens } = job;
  const systemPrompt =
    schema && ai.provider === "free"
      ? `${job.instructions}\n\nReply with only a JSON object, no other text, that fits this JSON Schema:\n${JSON.stringify(schema)}`
      : job.instructions;

  const onPayload = (payload: unknown) => {
    const p = payload as Record<string, unknown>;
    switch (ai.provider) {
      case "anthropic":
        return {
          ...p,
          max_tokens: maxTokens,
          output_config: { effort: "low", ...(schema ? { format: { type: "json_schema", schema } } : {}) },
        };
      case "openai":
        // GPT's thinking counts toward the limit, so leave it extra room.
        return {
          ...p,
          max_output_tokens: maxTokens + 4_000,
          ...(schema ? { text: { format: { type: "json_schema", name: "reply", schema, strict: false } } } : {}),
        };
      default:
        return {
          ...p,
          ...GEMMA_NO_THINKING,
          max_tokens: maxTokens,
          ...(schema ? { response_format: { type: "json_object" } } : {}),
        };
    }
  };

  try {
    const reply = await completeSimple(
      ai.model,
      { systemPrompt, messages: [{ role: "user", content: job.input, timestamp: Date.now() }] },
      {
        apiKey: ai.apiKey,
        reasoning: ai.provider === "openai" ? "low" : undefined,
        headers: ai.provider === "free" ? { [FREE_USE_HEADER]: job.use } : undefined,
        onPayload,
      },
    );
    if (reply.stopReason !== "stop") return failed(reply.errorMessage ?? reply.stopReason);
    const text = reply.content
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("")
      .trim();
    return { ok: true, text };
  } catch (err) {
    return failed(err instanceof Error ? err.message : String(err));
  }
}

/** Read a JSON answer, even if the model wrapped it in a code block. */
export function parseJsonReply<T>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end <= start) throw new Error("The answer wasn't JSON.");
    return JSON.parse(text.slice(start, end + 1)) as T;
  }
}
