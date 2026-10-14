import { sql } from "drizzle-orm";
import { db } from "../../db/index.ts";
import { learnFromChannels } from "./channel-learning.ts";
import { maybeSendDigest } from "./digest.ts";

// Slack's timed work, called from server/jobs.ts with the cron string:
// - every 5 minutes: learn team facts from quiet Slack channels
// - every hour: the daily digest for admins (sent once, after 4 pm) and cleanup

/** Forget Slack event ids older than a day (they only guard against retries). */
export async function forgetOldSlackEvents(): Promise<void> {
  await db.run(sql`DELETE FROM slack_events_seen WHERE seen_at < datetime('now', '-1 day')`);
}

async function safely(name: string, job: () => Promise<void>): Promise<void> {
  try {
    await job();
  } catch (err) {
    console.error(`[slack] ${name} failed:`, err);
  }
}

export async function runSlackJobs(cron: string): Promise<void> {
  if (cron === "*/5 * * * *") {
    await safely("channel learning", learnFromChannels);
  }
  if (cron === "0 * * * *") {
    await safely("daily digest", () => maybeSendDigest());
    await safely("event cleanup", forgetOldSlackEvents);
  }
}
