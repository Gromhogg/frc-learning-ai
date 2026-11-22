import { env, waitUntil } from "cloudflare:workers";
import { FREE_BACKGROUND_NEURONS, FREE_DAILY_NEURONS } from "../lib/config.ts";
import { addToday, countToday } from "../lib/limits.ts";

// The free model (Gemma 4) runs on Cloudflare Workers AI through the app's
// own `AI` connection (wrangler.jsonc), so it needs no key and no extra setup.
//
// The Pi AI kit can only reach OpenAI-style models over the web. So the free
// model is given a made-up web address (FREE_AI_URL), and any request to
// that address is handed to the `AI` connection here instead of going out.
// Workers AI answers in the same OpenAI style, so Pi reads it as usual.
//
// Cloudflare counts Workers AI use in "neurons". The free allowance is
// 10,000 a day, starting over at midnight UTC. Every answer's count is added
// up in the database, and the free model stops before the allowance runs
// out (limits in config.ts).

export const FREE_AI_URL = "https://workers-ai.binding/v1";

/** Pi wants some key text. The AI connection itself needs none. */
export const FREE_AI_KEY = "no-key-needed";

/** Header that marks a background job, which stops sooner than chats. */
export const FREE_USE_HEADER = "x-free-use";

export type FreeUse = "chat" | "background";

const COUNTER = "free-ai:neurons";

/** In the error text when our own daily limit stops a request. */
const USED_UP = "free-ai-used-up";

export async function freeNeuronsToday(): Promise<number> {
  return countToday(COUNTER);
}

/** Is there free allowance left today for this kind of use? */
export async function freeRoomLeft(use: FreeUse): Promise<boolean> {
  const cap = use === "chat" ? FREE_DAILY_NEURONS : FREE_BACKGROUND_NEURONS;
  return (await freeNeuronsToday()) < cap;
}

/** When the free allowance starts over (midnight UTC), in Los Gatos time, e.g. "4 PM". */
export function freeBackAt(): string {
  const next = new Date();
  next.setUTCHours(24, 0, 0, 0);
  return next.toLocaleTimeString("en-US", { timeZone: "America/Los_Angeles", hour: "numeric" });
}

export function freeUsedUpMessage(): string {
  return `The team's free AI is used up for today. It's back at ${freeBackAt()}. To keep going now, add your own Claude or OpenAI key under API key in the menu.`;
}

/** Does this error mean the free allowance ran out (ours, or Cloudflare's own limit)? */
export function isFreeUsedUp(errorText: string): boolean {
  return errorText.includes(USED_UP) || /\b4006\b|daily free allocation/i.test(errorText);
}

// ─── the made-up address → the AI connection ───────────────────────────────

const webFetch = globalThis.fetch;

globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = input instanceof Request ? input.url : String(input);
  return url.startsWith(FREE_AI_URL) ? runFree(new Request(input, init)) : webFetch(input, init);
}) as typeof fetch;

function errorReply(status: number, message: string): Response {
  return Response.json({ error: { message } }, { status });
}

async function runFree(request: Request): Promise<Response> {
  const { model, ...inputs } = (await request.json()) as { model: string } & Record<string, unknown>;
  const use: FreeUse = request.headers.get(FREE_USE_HEADER) === "background" ? "background" : "chat";
  // 403, not 429: the OpenAI library retries 429s, and waiting won't help.
  if (!(await freeRoomLeft(use))) return errorReply(403, USED_UP);
  if (Array.isArray(inputs.messages)) inputs.messages = toolResultsAsMessages(inputs.messages as ChatMessage[]);

  // The model list in Cloudflare's types lags behind; this is the raw form of run().
  const run = env.AI.run.bind(env.AI) as unknown as (
    model: string,
    inputs: unknown,
    options: { returnRawResponse: true },
  ) => Promise<Response>;
  let reply: Response;
  try {
    reply = await run(model, inputs, { returnRawResponse: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errorReply(isFreeUsedUp(message) ? 403 : 502, message);
  }
  if (!reply.ok || !reply.body) return reply;
  return new Response(reply.body.pipeThrough(countNeurons()), reply);
}

interface ChatMessage {
  role: string;
  content?: unknown;
  tool_call_id?: string;
  tool_calls?: { id: string; function: { name: string } }[];
}

/**
 * Hand tool results (like a doc the bot opened) back to Gemma as an ordinary
 * message. Sent the normal way, Gemma's own chat format often makes the
 * answer that follows start with bits of its hidden thinking ("<|channel>…")
 * — about 4 times in 10 in testing, and never when sent like this.
 */
function toolResultsAsMessages(messages: ChatMessage[]): ChatMessage[] {
  const toolNames = new Map<string, string>();
  const out: ChatMessage[] = [];
  let results: { role: "user"; content: string } | null = null;
  for (const m of messages) {
    for (const call of m.tool_calls ?? []) toolNames.set(call.id, call.function.name);
    if (m.role !== "tool") {
      out.push(m);
      results = null;
      continue;
    }
    const name = toolNames.get(m.tool_call_id ?? "") ?? "the tool";
    const text = `Result of ${name}:\n${typeof m.content === "string" ? m.content : JSON.stringify(m.content)}`;
    // Several results in a row become one message.
    if (results) {
      results.content += `\n\n${text}`;
    } else {
      results = { role: "user", content: text };
      out.push(results);
    }
  }
  return out;
}

/**
 * Pass the streamed answer through untouched, reading the neurons it used
 * on the way. Each piece carries its own count, and a last summary piece
 * (no "choices") carries the total.
 */
function countNeurons(): TransformStream<Uint8Array, Uint8Array> {
  const decoder = new TextDecoder();
  let pending = "";
  let pieces = 0;
  let total: number | null = null;

  const read = (line: string) => {
    if (!line.startsWith("data: {")) return;
    try {
      const data = JSON.parse(line.slice(6)) as { choices?: unknown; usage?: { neurons?: unknown } };
      const neurons = data.usage?.neurons;
      if (typeof neurons !== "number") return;
      if (data.choices) pieces += neurons;
      else total = neurons;
    } catch {
      // Not a piece we can read; the answer itself is unaffected.
    }
  };

  return new TransformStream({
    transform(chunk, controller) {
      controller.enqueue(chunk);
      pending += decoder.decode(chunk, { stream: true });
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      lines.forEach(read);
    },
    flush() {
      read(pending);
      const used = Math.ceil(total ?? pieces);
      if (used > 0) {
        waitUntil(addToday(COUNTER, used).catch((err) => console.error("Counting free AI use failed:", err)));
      }
    },
  });
}
