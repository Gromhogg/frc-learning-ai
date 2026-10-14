import { Hono } from "hono";
import { requireAdmin, type AdminEnv } from "../../lib/require-auth.ts";
import { logEvent } from "../../lib/events.ts";
import { botIdentity, isSlackConfigured, listChannels, SlackApiError, type SlackChannel } from "../../slack/api.ts";
import { sendAdminAlert } from "../../slack/alerts.ts";
import {
  ALERT_CHANNEL_KEY,
  LEARN_CHANNELS_KEY,
  getAlertChannel,
  getLearnChannels,
  setSetting,
} from "../../slack/settings.ts";

// Slack settings for admins: where alerts go, and which channels the bot
// learns team facts from. Admins only.

const app = new Hono<AdminEnv>();
app.use("*", requireAdmin);

const NOT_IN_CHANNEL = "Invite @972 Chat Bot to that channel first.";

function slackProblem(err: unknown): string {
  const code = err instanceof SlackApiError ? err.code : "no_answer";
  if (code === "invalid_auth" || code === "not_authed" || code === "token_revoked" || code === "account_inactive") {
    return "Slack didn't accept the bot token. Check SLACK_BOT_TOKEN.";
  }
  if (code === "missing_scope") return "The Slack app is missing a permission. Re-create it from slack/manifest.yaml and reinstall it.";
  return `Slack didn't answer (${code}). Try again in a minute.`;
}

async function state(channels?: SlackChannel[]) {
  if (!isSlackConfigured()) return { configured: false as const };
  const [alertChannel, learnChannels] = await Promise.all([getAlertChannel(), getLearnChannels()]);
  try {
    const me = await botIdentity();
    const list = channels ?? (await listChannels());
    return {
      configured: true as const,
      team: me.team,
      botName: me.name,
      alertChannel,
      learnChannels,
      channels: list.map(({ id, name, isMember }) => ({ id, name, isMember })),
    };
  } catch (err) {
    console.error("[slack] settings lookup failed:", err);
    return { configured: true as const, error: slackProblem(err), alertChannel, learnChannels, channels: [] };
  }
}

// GET / — is Slack set up, which workspace, and the channel choices
app.get("/", async (c) => c.json(await state()));

// PUT / — { alertChannel: string | null, learnChannels: string[] }
app.put("/", async (c) => {
  if (!isSlackConfigured()) return c.json({ error: "Slack isn't set up yet." }, 400);
  const body = await c.req
    .json<{ alertChannel?: unknown; learnChannels?: unknown }>()
    .catch(() => ({}) as { alertChannel?: unknown; learnChannels?: unknown });

  const alertChannel = body.alertChannel === null || body.alertChannel === "" ? null : body.alertChannel;
  if (alertChannel !== null && typeof alertChannel !== "string") return c.json({ error: "Bad alerts channel." }, 400);
  if (!Array.isArray(body.learnChannels) || body.learnChannels.some((id) => typeof id !== "string")) {
    return c.json({ error: "Bad list of learning channels." }, 400);
  }
  const learnChannels = [...new Set(body.learnChannels as string[])];

  let channels: SlackChannel[];
  try {
    channels = await listChannels();
  } catch (err) {
    return c.json({ error: slackProblem(err) }, 502);
  }
  const byId = new Map(channels.map((ch) => [ch.id, ch]));

  // The bot can only post in, and read, channels it has been invited to.
  for (const id of [...(alertChannel ? [alertChannel] : []), ...learnChannels]) {
    const ch = byId.get(id);
    if (!ch) return c.json({ error: "One of those channels isn't in the list any more. Reload the page." }, 400);
    if (!ch.isMember) return c.json({ error: `#${ch.name}: ${NOT_IN_CHANNEL}` }, 400);
  }

  const [oldAlert, oldLearn] = await Promise.all([getAlertChannel(), getLearnChannels()]);
  await setSetting(ALERT_CHANNEL_KEY, alertChannel ?? "");
  await setSetting(LEARN_CHANNELS_KEY, JSON.stringify(learnChannels));

  const nameOf = (id: string) => `#${byId.get(id)?.name ?? id}`;
  const changes: string[] = [];
  if ((oldAlert ?? null) !== alertChannel) {
    changes.push(alertChannel ? `alerts go to ${nameOf(alertChannel)}` : "alerts turned off");
  }
  const sameLearn = oldLearn.length === learnChannels.length && oldLearn.every((id) => learnChannels.includes(id));
  if (!sameLearn) {
    changes.push(
      learnChannels.length ? `learning from ${learnChannels.map(nameOf).join(", ")}` : "learning from Slack turned off",
    );
  }
  if (changes.length > 0) {
    await logEvent({
      actorId: c.get("adminId"),
      action: "settings.slack",
      target: "Slack",
      summary: `Slack: ${changes.join("; ")}`,
    });
  }
  return c.json({ ok: true, ...(await state(channels)) });
});

// POST /test-alert — post a test message in the alerts channel
app.post("/test-alert", async (c) => {
  const result = await sendAdminAlert("✅ 972 Chat Bot alerts are working.");
  if (result.ok) return c.json({ ok: true });
  if (result.reason === "not-configured") return c.json({ error: "Slack isn't set up yet." }, 400);
  if (result.reason === "no-channel") return c.json({ error: "Pick an alerts channel and save first." }, 400);
  if (result.error === "not_in_channel") return c.json({ error: NOT_IN_CHANNEL }, 400);
  if (result.error === "channel_not_found") return c.json({ error: "Slack can't find that channel. Pick another one." }, 400);
  return c.json({ error: `Slack said no (${result.error ?? "unknown"}).` }, 502);
});

export default app;
