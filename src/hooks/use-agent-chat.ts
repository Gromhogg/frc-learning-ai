import { useCallback, useRef, useState } from "react";
import { postStream, type Step } from "../lib/stream";
import { errorMessage } from "../lib/api";

// Chat state for any of the app's agents (the tutor students use, and the
// prompt assistant admins use). Sends a message, reads the streamed reply,
// and keeps the list of messages on screen in sync.

export interface ChatMessage {
  /** Stable React key — the saved id isn't known until the reply finishes. */
  key: string;
  id?: number;
  role: "user" | "assistant";
  text: string;
  images?: string[];
  steps: Step[];
  rating?: "up" | "down" | null;
  status?: "streaming" | "done" | "error";
  /** True while the model is thinking and hasn't written anything yet. */
  thinking?: boolean;
  error?: string;
}

let keyCounter = 0;
export const newKey = () => `m${Date.now()}-${keyCounter++}`;

export function useAgentChat(path: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(
    async (body: Record<string, unknown>, userMessage: ChatMessage | null, pathOverride?: string) => {
      const target = pathOverride ?? path;
      if (!target) return;
      const assistantKey = newKey();
      const controller = new AbortController();
      abortRef.current = controller;
      setBusy(true);

      setMessages((prev) => [
        ...prev,
        ...(userMessage ? [userMessage] : []),
        { key: assistantKey, role: "assistant", text: "", steps: [], status: "streaming", thinking: true },
      ]);

      const update = (fn: (m: ChatMessage) => ChatMessage) =>
        setMessages((prev) => prev.map((m) => (m.key === assistantKey ? fn(m) : m)));

      try {
        await postStream(
          target,
          body,
          (event) => {
            switch (event.type) {
              case "text":
                update((m) => ({ ...m, text: m.text + event.delta, thinking: false }));
                break;
              case "thinking":
                update((m) => ({ ...m, thinking: m.text === "" }));
                break;
              case "step":
                update((m) => {
                  const known = m.steps.some((s) => s.id === event.step.id);
                  const steps = known
                    ? m.steps.map((s) => (s.id === event.step.id ? event.step : s))
                    : [...m.steps, event.step];
                  return { ...m, steps, thinking: false };
                });
                break;
              case "error":
                update((m) => ({ ...m, error: event.message }));
                break;
              case "done":
                setMessages((prev) =>
                  prev.map((m) => {
                    if (m.key === assistantKey) {
                      return { ...m, id: event.messageId || undefined, status: m.error ? "error" : "done", thinking: false };
                    }
                    if (userMessage && m.key === userMessage.key && event.userMessageId) {
                      return { ...m, id: event.userMessageId };
                    }
                    return m;
                  }),
                );
                break;
            }
          },
          controller.signal,
        );
      } catch (err) {
        if (controller.signal.aborted) {
          update((m) => ({ ...m, status: "done", thinking: false }));
        } else {
          update((m) => ({ ...m, status: "error", thinking: false, error: errorMessage(err, "Couldn't reach the server.") }));
        }
      } finally {
        // Anything still marked streaming (e.g. the connection closed early)
        // is finished now.
        update((m) => (m.status === "streaming" ? { ...m, status: "done", thinking: false } : m));
        abortRef.current = null;
        setBusy(false);
      }
    },
    [path],
  );

  const send = useCallback(
    (text: string, images: string[] = [], extraBody: Record<string, unknown> = {}, pathOverride?: string) => {
      const userMessage: ChatMessage = { key: newKey(), role: "user", text, images, steps: [] };
      return run({ ...extraBody, text, images }, userMessage, pathOverride);
    },
    [run],
  );

  /** Re-answer the last question (drops the last reply first). */
  const retry = useCallback(
    (extraBody: Record<string, unknown> = {}) => {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        return last?.role === "assistant" ? prev.slice(0, -1) : prev;
      });
      return run({ ...extraBody, retry: true }, null);
    },
    [run],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

  return { messages, setMessages, busy, send, retry, stop };
}
