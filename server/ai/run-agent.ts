import type { Agent, AgentMessage } from "@mariozechner/pi-agent-core";
import type { AssistantMessage, ImageContent, Message } from "@mariozechner/pi-ai";

// Shared plumbing for every Pi agent that talks to the browser: runs one
// turn, forwards what happens as small JSON events, and hands back what to
// save. The browser reads these events as Server-Sent Events.

/** One thing the agent did while answering, shown as a chip in the UI. */
/** A picture found by the tutor's picture search, shown under the answer. */
export interface StepImage {
  /** The picture itself (a thumbnail-sized link). */
  url: string;
  /** The page the picture comes from (opened on click). */
  pageUrl: string;
  title: string;
  /** Author / license / site, shown as a small credit line. */
  credit: string;
}

export interface Step {
  id: string;
  tool: string;
  label: string;
  status: "running" | "done" | "error";
  /** Set when the step created a prompt draft (editor and reviewer agents). */
  draftId?: number;
  /** Set when the step found pictures (the tutor's find_images tool). */
  images?: StepImage[];
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

/**
 * Send stream events in order, and let the caller wait until every one has
 * actually gone out. Cloudflare closes the stream as soon as the handler
 * returns, so un-awaited writes (like the final "done") would be lost.
 */
export function orderedSender(write: (data: string) => Promise<void>) {
  let chain = Promise.resolve();
  const send = (event: ClientEvent) => {
    chain = chain.then(() => write(JSON.stringify(event))).catch(() => {});
  };
  return { send, flushed: () => chain };
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
  /** `ownKey`: the turn runs on the person's own API key (changes the error hints). */
  opts: { ownKey?: boolean } = {},
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
          error = friendlyError(m, opts.ownKey ?? false);
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
        const details = event.result?.details as { draftId?: number; images?: StepImage[] } | undefined;
        if (details?.draftId) step.draftId = details.draftId;
        if (details?.images?.length) step.images = details.images;
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

function friendlyError(m: AssistantMessage, ownKey: boolean): string {
  if (m.stopReason === "aborted") return "Stopped.";
  const raw = m.errorMessage ?? "";
  if (!raw) return "The AI declined to answer that one. Try asking another way.";
  if (/authentication_error|invalid x-api-key|no api key|\b401\b/i.test(raw)) {
    return ownKey
      ? "Your API key didn't work. Check it, or switch back to the team key under API key in the menu."
      : "The team's AI key isn't working. Let an admin know, or add your own key under API key in the menu.";
  }
  if (/credit balance/i.test(raw)) {
    return ownKey
      ? "Your API key is out of credit. Add credit in the Claude Console, or switch back to the team key under API key in the menu."
      : "The team's AI key is out of credit. Let an admin know, or add your own key under API key in the menu.";
  }
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
