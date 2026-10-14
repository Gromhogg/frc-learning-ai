import { bufferChannelMessage } from "./channel-learning.ts";
import { handleChat, handleReaction } from "./chat.ts";
import type { SlackJob } from "./events.ts";

// Background Slack work, sent here by POST /slack/events through the queue
// (so Slack gets its fast "OK" right away): answering messages, saving 👍/👎,
// and saving channel messages for learning.

async function handleJob(job: SlackJob): Promise<void> {
  switch (job.kind) {
    case "chat":
      return handleChat(job);
    case "reaction":
      return handleReaction(job);
    case "buffer":
      return bufferChannelMessage(job);
  }
}

export async function handleSlackQueue(batch: MessageBatch<unknown>): Promise<void> {
  for (const message of batch.messages) {
    try {
      await handleJob(message.body as SlackJob);
      message.ack();
    } catch (err) {
      // Try again a little later (the queue gives up after a few tries).
      console.error("[slack] queue job failed:", err);
      message.retry({ delaySeconds: 10 });
    }
  }
}
