import app from "./app.ts";
import { runScheduled } from "./jobs.ts";
import { handleSlackQueue } from "./slack/queue.ts";

// The Cloudflare Worker entry point.
// - fetch: every web request (the API; the React app is served as static files).
// - scheduled: the timed jobs from wrangler.jsonc ("triggers.crons").
// - queue: Slack work, done in the background so Slack gets a fast reply.
export default {
  fetch: app.fetch,

  async scheduled(controller, _env, ctx) {
    ctx.waitUntil(runScheduled(controller.cron));
  },

  async queue(batch) {
    await handleSlackQueue(batch);
  },
} satisfies ExportedHandler<Env>;
