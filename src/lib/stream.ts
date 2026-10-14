import { API_BASE, ApiError, getToken } from "./api";

// Reads the server's streamed replies. The server sends Server-Sent Events:
// lines of `data: {...json...}` separated by blank lines.

/** A picture found by the tutor's picture search, shown under the answer. */
export interface StepImage {
  url: string;
  pageUrl: string;
  title: string;
  credit: string;
}

export interface Step {
  id: string;
  tool: string;
  label: string;
  status: "running" | "done" | "error";
  draftId?: number;
  images?: StepImage[];
}

export type StreamEvent =
  | { type: "text"; delta: string }
  | { type: "thinking" }
  | { type: "step"; step: Step }
  | { type: "done"; messageId: number; userMessageId?: number }
  | { type: "error"; message: string };

export async function postStream(
  path: string,
  body: unknown,
  onEvent: (event: StreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => null);
    const message = (data as { error?: string } | null)?.error;
    throw new ApiError(message ?? `Request failed (${res.status})`, res.status, data);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let split: number;
    while ((split = buffer.indexOf("\n\n")) !== -1) {
      const chunk = buffer.slice(0, split);
      buffer = buffer.slice(split + 2);
      const data = chunk
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (!data) continue;
      try {
        onEvent(JSON.parse(data) as StreamEvent);
      } catch {
        // Ignore a malformed chunk rather than dropping the whole reply.
      }
    }
  }
}
