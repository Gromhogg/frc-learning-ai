import { runDailyReviewIfDue } from "./agents/reviewer.ts";
import { runLearnSweep } from "./lib/learn.ts";
import { runSlackJobs } from "./slack/jobs.ts";

// The timed jobs. `cron` is the schedule string from wrangler.jsonc:
// - "*/5 * * * *" (every 5 minutes): learn from quiet chats, then Slack.
// - "0 * * * *" (hourly): the daily reviewer check, then Slack.
// Each job runs on its own, so one failing never stops the others.
export async function runScheduled(cron: string): Promise<void> {
  if (cron === "*/5 * * * *") {
    await runJob(cron, "learn", async () => `learned from ${await runLearnSweep()} chat(s)`);
  } else if (cron === "0 * * * *") {
    await runJob(cron, "review", runDailyReviewIfDue);
  } else {
    console.log(`[jobs] ${cron}: unknown schedule, nothing to do`);
    return;
  }
  await runJob(cron, "slack", async () => {
    await runSlackJobs(cron);
    return "done";
  });
}

/** Run one job and log one short line, whether it worked or not. */
async function runJob(cron: string, name: string, job: () => Promise<string>): Promise<void> {
  try {
    console.log(`[jobs] ${cron} ${name}: ${await job()}`);
  } catch (err) {
    console.error(`[jobs] ${cron} ${name} failed:`, err);
  }
}
