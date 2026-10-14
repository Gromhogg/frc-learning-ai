import { and, asc, eq, isNotNull, lte, sql } from "drizzle-orm";
import { db } from "../../db/index.ts";
import { slackChannelBuffer } from "../../db/schema.ts";
import { LEARN_DAILY_CALL_CAP } from "../lib/config.ts";
import { useDailyAllowance as takeDailyAllowance } from "../lib/limits.ts";
import { runExtraction } from "../lib/learn.ts";
import { teamApiKey } from "../ai/api-keys.ts";
import { insertPendingFact, listFactsForExtraction, reinforceFact, trimQueues } from "../lib/facts.ts";
import { channelName } from "./api.ts";
import { slackToPlain } from "./format.ts";
import { getLearnChannels } from "./settings.ts";
import type { SlackJob } from "./events.ts";

// Learning team facts from Slack channels admins picked. Messages wait in
// slack_channel_buffer until a channel goes quiet (30 minutes) or piles up
// 50 messages; then one AI call reads them, new facts go to the review queue
// (labelled "Slack #channel"), and the messages are deleted. Names are never
// sent to the AI — every speaker is just "Member".

type BufferJob = Extract<SlackJob, { kind: "buffer" }>;

/** Most messages kept per channel; older ones are dropped. */
export const MAX_BUFFERED_PER_CHANNEL = 200;
/** Learn once a channel has this many messages waiting... */
const BATCH_SIZE = 50;
/** ...or once it has been quiet this long. */
const QUIET_MINUTES = 30;
/** Keep one AI call a reasonable size. */
const MAX_CHARS_PER_MESSAGE = 1000;
const MAX_TRANSCRIPT_CHARS = 60_000;

/** Save one channel message for the next learning pass (only for learning channels). */
export async function bufferChannelMessage(job: BufferJob): Promise<void> {
  if (!(await getLearnChannels()).includes(job.channel)) return;
  const text = slackToPlain(job.text).slice(0, MAX_CHARS_PER_MESSAGE);
  if (text.length < 2) return;

  // The channel name, from an earlier message if we have one, else from Slack.
  const [known] = await db
    .select({ name: slackChannelBuffer.channelName })
    .from(slackChannelBuffer)
    .where(and(eq(slackChannelBuffer.channelId, job.channel), isNotNull(slackChannelBuffer.channelName)))
    .limit(1);
  const name = known?.name ?? (await channelName(job.channel));

  await db.insert(slackChannelBuffer).values({
    channelId: job.channel,
    channelName: name,
    ts: job.ts,
    slackUserId: job.user,
    text,
  });

  // Never keep more than the newest MAX_BUFFERED_PER_CHANNEL.
  await db.run(sql`
    DELETE FROM slack_channel_buffer
    WHERE channel_id = ${job.channel}
      AND id NOT IN (
        SELECT id FROM slack_channel_buffer WHERE channel_id = ${job.channel}
        ORDER BY id DESC LIMIT ${MAX_BUFFERED_PER_CHANNEL}
      )
  `);
}

/** Every 5 minutes: learn from each channel that's ready. */
export async function learnFromChannels(): Promise<void> {
  const groups = await db.all<{
    channel_id: string;
    channel_name: string | null;
    waiting: number;
    max_id: number;
    quiet: number;
  }>(sql`
    SELECT channel_id,
           MAX(channel_name) AS channel_name,
           COUNT(*) AS waiting,
           MAX(id) AS max_id,
           MAX(created_at) <= datetime('now', ${`-${QUIET_MINUTES} minutes`}) AS quiet
    FROM slack_channel_buffer
    GROUP BY channel_id
  `);
  if (groups.length === 0) return;

  const learnChannels = new Set(await getLearnChannels());
  for (const group of groups) {
    // No longer a learning channel: drop what it left behind, unread.
    if (!learnChannels.has(group.channel_id)) {
      await db.delete(slackChannelBuffer).where(eq(slackChannelBuffer.channelId, group.channel_id));
      continue;
    }
    if (group.waiting < BATCH_SIZE && !group.quiet) continue;
    if (!(await teamApiKey())) return;
    if (!(await takeDailyAllowance("learn:total", LEARN_DAILY_CALL_CAP))) {
      console.log("[slack] channel learning: daily AI call cap reached, trying again tomorrow.");
      return;
    }
    await learnFromChannel(group.channel_id, group.channel_name, group.max_id);
  }
}

/**
 * One AI call for one channel's waiting messages. The messages are deleted
 * BEFORE the call: if it fails, that batch is skipped rather than retried
 * (same rule as chat learning — a missed fact costs less than a stuck loop).
 */
async function learnFromChannel(channelId: string, knownName: string | null, maxId: number): Promise<void> {
  const rows = await db
    .select({ text: slackChannelBuffer.text })
    .from(slackChannelBuffer)
    .where(and(eq(slackChannelBuffer.channelId, channelId), lte(slackChannelBuffer.id, maxId)))
    .orderBy(asc(slackChannelBuffer.id));
  await db
    .delete(slackChannelBuffer)
    .where(and(eq(slackChannelBuffer.channelId, channelId), lte(slackChannelBuffer.id, maxId)));
  if (rows.length === 0) return;

  try {
    const name = knownName ?? (await channelName(channelId)) ?? channelId;
    const label = `Slack #${name}`;

    // Newest messages first until the size limit, then back in time order.
    const lines: string[] = [];
    let size = 0;
    for (const row of [...rows].reverse()) {
      const line = `Member: ${row.text}`;
      if (size + line.length > MAX_TRANSCRIPT_CHARS) break;
      lines.unshift(line);
      size += line.length + 2;
    }
    const transcript =
      "(These are messages from the team's Slack channel. Every speaker is a team member.)\n\n" + lines.join("\n\n");

    const existing = await listFactsForExtraction();
    const existingList = existing.length ? existing.map((f) => `  ${f.id}: ${f.text}`).join("\n") : "  (none yet)";

    const result = await runExtraction(existingList, transcript);
    if (!result.ok) {
      console.error(`[slack] learning from ${label} failed: ${result.error}`);
      return;
    }

    // Only team facts are used here; interests are per student and these are channel messages.
    const knownIds = new Set(existing.map((f) => f.id));
    for (const id of new Set(result.extraction.reinforce_ids ?? [])) {
      if (knownIds.has(id)) await reinforceFact(id);
    }
    let added = 0;
    for (const text of (result.extraction.new_facts ?? []).slice(0, 5)) {
      if (typeof text !== "string" || !text.trim()) continue;
      const outcome = await insertPendingFact({ text, sourceUserId: null, sourceConversationId: null, sourceLabel: label });
      if (outcome === "inserted") added++;
    }
    await trimQueues();
    console.log(`[slack] learned from ${label}: ${rows.length} message(s), ${added} new fact(s).`);
  } catch (err) {
    console.error(`[slack] learning from channel ${channelId} failed:`, err);
  }
}
