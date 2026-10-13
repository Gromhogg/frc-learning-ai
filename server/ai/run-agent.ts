import type { Agent, AgentMessage } from "@mariozechner/pi-agent-core";
import type { AssistantMessage, ImageContent, Message } from "@mariozechner/pi-ai";

// Shared plumbing for every Pi agent that talks to the browser: runs one
// turn, forwards what happens as small JSON events, and hands back what to
// save. The browser reads these events as Server-Sent Events.

/** One thing the agent did while answering, shown as a chip in the UI. */
export interface Step {
  id: string;
  tool: string;
  label: string;
  status: "running" | "done" | "error";
  /** Set when the step created a prompt draft (editor and reviewer agents). */
  draftId?: number;
}

export type ClientEvent =
  | { type: "text"; delta: string }
  | { type: "thinking" }
  | { type: "step"; step: Step }
  | { type: "done"; messageId: number; userMessageId?: number }
  | { type: "error"; message: string };

export interface RunResult {
  text: string;
  steps: Step[];
  error: string | null;
}

/** How a tool call looks in the UI, e.g. read_doc → "Reading vertical-mill.md". */
export type DescribeStep = (tool: string, args: Record<string, unknown>) => string;

/**
 * Run one user turn through a Pi agent, streaming events to `send`.
 *
 * Text from every assistant message in the turn is kept — when the model
 * reads a doc mid-answer, anything it said before the tool call would
 * otherwise be lost.
 */
export async function runAgentTurn(
  agent: Agent,
  input: { text: string; images?: ImageContent[] },
  send: (event: ClientEvent) => void,
  describe: DescribeStep,
): Promise<RunResult> {
  const parts: string[] = [];
  const steps = new Map<string, Step>();
  let current = "";
  let error: string | null = null;

  const unsubscribe = agent.subscribe((event) => {
    switch (event.type) {
      case "message_update": {
        const e = event.assistantMessageEvent;
        if (e.type === "text_delta") {
          // A second assistant message in the same turn (after a tool call)
          // starts a new paragraph.
          if (current === "" && parts.length > 0) send({ type: "text", delta: "\n\n" });
          current += e.delta;
          send({ type: "text", delta: e.delta });
        } else if (e.type === "thinking_start") {
          send({ type: "thinking" });
        }
        break;
      }
      case "message_end": {
        const m = event.message as Message;
        if (m.role !== "assistant") break;
        if (current.trim()) parts.push(current.trim());
        current = "";
        if (m.stopReason === "error" || m.stopReason === "aborted") {
          error = friendlyError(m);
        }
        break;
      }
      case "tool_execution_start": {
        const step: Step = {
          id: event.toolCallId,
          tool: event.toolName,
          label: describe(event.toolName, (event.args ?? {}) as Record<string, unknown>),
          status: "running",
        };
        steps.set(step.id, step);
        send({ type: "step", step });
        break;
      }
      case "tool_execution_end": {
        const step = steps.get(event.toolCallId);
        if (!step) break;
        step.status = event.isError ? "error" : "done";
        const draftId = (event.result?.details as { draftId?: number } | undefined)?.draftId;
        if (draftId) step.draftId = draftId;
        send({ type: "step", step: { ...step } });
        break;
      }
    }
  });

  try {
    if (input.images && input.images.length > 0) {
      await agent.prompt(input.text || "(see attached photo)", input.images);
    } else {
      await agent.prompt(input.text);
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  } finally {
    unsubscribe();
  }

  if (current.trim()) parts.push(current.trim());
  return { text: parts.join("\n\n"), steps: [...steps.values()], error };
}

function friendlyError(m: AssistantMessage): string {
  if (m.stopReason === "aborted") return "Stopped.";
  const raw = m.errorMessage ?? "";
  if (!raw) return "The AI declined to answer that one. Try asking another way.";
  if (/rate.?limit|429|overloaded|529/i.test(raw)) {
    return "The AI is busy right now. Wait a moment and try again.";
  }
  console.error("Agent error:", raw);
  return "Something went wrong while answering. Try again.";
}

// ─── rebuilding history ────────────────────────────────────────────────────

/**
 * Turn saved text back into Pi messages. Only text (and photos) are replayed
 * — never the old thinking blocks — so a changed system prompt or a deleted
 * reply can't trip the API's check on edited history.
 */
export function historyToMessages(
  rows: { role: "user" | "assistant"; text: string; images?: ImageContent[] }[],
  model: { api: string; provider: string; id: string },
): AgentMessage[] {
  const out: AgentMessage[] = [];
  for (const row of rows) {
    if (row.role === "user") {
      const content =
        row.images && row.images.length > 0
          ? [{ type: "text" as const, text: row.text || "(see attached photo)" }, ...row.images]
          : row.text;
      if (!row.text && !row.images?.length) continue;
      out.push({ role: "user", content, timestamp: 0 });
    } else {
      if (!row.text.trim()) continue;
      out.push({
        role: "assistant",
        content: [{ type: "text", text: row.text }],
        api: model.api,
        provider: model.provider,
        model: model.id,
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: "stop",
        timestamp: 0,
      });
    }
  }
  return out;
}
