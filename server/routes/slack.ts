import { Hono } from "hono";
import { env, waitUntil } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.ts";
import { slackEventsSeen } from "../../db/schema.ts";
import { verifySlackSignature } from "../slack/verify.ts";
import { eventToJob, type SlackEnvelope } from "../slack/events.ts";
import { getLearnChannels } from "../slack/settings.ts";
import { forgetOldSlackEvents } from "../slack/jobs.ts";

// Slack sends its events here (POST /slack/events). Slack wants an answer
// within 3 seconds, so this only checks the request and hands the work to
// the queue (see server/slack/queue.ts).

const app = new Hono();

/** Remember an event id. False if we've already seen it (a Slack retry). */
async function firstTimeSeen(eventId: string): Promise<boolean> {
  const rows = await db
    .insert(slackEventsSeen)
    .values({ eventId })
    .onConflictDoNothing()
    .returning({ eventId: slackEventsSeen.eventId });
  return rows.length > 0;
}

app.post("/events", async (c) => {
  const secret = process.env.SLACK_SIGNING_SECRET;
  if (!secret) return c.json({ error: "Slack isn't set up on this server." }, 503);

  // The signature covers the exact bytes Slack sent, so read the body once, as text.
  const rawBody = await c.req.text();
  const signed = await verifySlackSignature({
    secret,
    timestamp: c.req.header("X-Slack-Request-Timestamp"),
    signature: c.req.header("X-Slack-Signature"),
    rawBody,
  });
  if (!signed) return c.json({ error: "Bad signature." }, 401);

  let envelope: SlackEnvelope;
  try {
    envelope = JSON.parse(rawBody) as SlackEnvelope;
  } catch {
    return c.json({ error: "Bad request." }, 400);
  }

  // Slack checks the address when the app is set up.
  if (envelope.type === "url_verification") return c.json({ challenge: envelope.challenge ?? "" });

  const job = eventToJob(envelope);
  if (!job) return c.body(null, 200);
  // Channel messages only matter in channels the bot learns from.
  if (job.kind === "buffer" && !(await getLearnChannels()).includes(job.channel)) return c.body(null, 200);

  // Slack retries events it thinks we missed — act on each one once.
  const eventId = envelope.event_id;
  if (eventId && !(await firstTimeSeen(eventId))) return c.body(null, 200);

  try {
    await env.SLACK_QUEUE.send(job);
  } catch (err) {
    console.error("[slack] couldn't queue an event:", err);
    // Let Slack's retry through next time.
    if (eventId) await db.delete(slackEventsSeen).where(eq(slackEventsSeen.eventId, eventId));
    return c.json({ error: "Try again." }, 500);
  }

  // Now and then, forget old event ids (the hourly job does this too).
  if (Math.random() < 0.02) waitUntil(forgetOldSlackEvents().catch(() => {}));
  return c.body(null, 200);
});

export default app;
