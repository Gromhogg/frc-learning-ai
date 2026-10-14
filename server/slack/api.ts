// Talking to Slack's Web API with plain fetch (no Slack library).
//
// Secrets: SLACK_BOT_TOKEN (the "xoxb-..." bot token) and SLACK_SIGNING_SECRET.
// SLACK_API_BASE can point at a fake Slack for local testing.

/** True when the bot token is set, so the app can talk to Slack at all. */
export function isSlackConfigured(): boolean {
  return Boolean(process.env.SLACK_BOT_TOKEN);
}

function apiBase(): string {
  return (process.env.SLACK_API_BASE || "https://slack.com/api").replace(/\/+$/, "");
}

/** Slack said no (its reply had ok: false), or the request itself failed. */
export class SlackApiError extends Error {
  code: string;
  constructor(method: string, code: string) {
    super(`Slack ${method} failed: ${code}`);
    this.name = "SlackApiError";
    this.code = code;
  }
}

/**
 * Call one Slack Web API method, e.g. slackApi("chat.postMessage", {...}).
 * Throws SlackApiError when Slack answers ok: false.
 */
export async function slackApi<T extends object = Record<string, unknown>>(
  method: string,
  body: Record<string, unknown> = {},
): Promise<T & { ok: true }> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) throw new SlackApiError(method, "not_configured");

  const res = await fetch(`${apiBase()}/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as ({ ok?: boolean; error?: string } & T) | null;
  if (!data) throw new SlackApiError(method, `http_${res.status}`);
  if (!data.ok) throw new SlackApiError(method, data.error ?? "unknown_error");
  return data as T & { ok: true };
}

/** Some Slack methods only take form fields, not JSON (e.g. users.info). */
export async function slackApiForm<T extends object = Record<string, unknown>>(
  method: string,
  fields: Record<string, string>,
): Promise<T & { ok: true }> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) throw new SlackApiError(method, "not_configured");

  const res = await fetch(`${apiBase()}/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(fields).toString(),
  });
  const data = (await res.json().catch(() => null)) as ({ ok?: boolean; error?: string } & T) | null;
  if (!data) throw new SlackApiError(method, `http_${res.status}`);
  if (!data.ok) throw new SlackApiError(method, data.error ?? "unknown_error");
  return data as T & { ok: true };
}

export interface BotIdentity {
  /** The bot's own Slack user id, e.g. "U012ABC". */
  userId: string;
  /** The bot's name in Slack. */
  name: string;
  team: string;
  teamId: string;
}

// Kept only for the life of this server copy — just saves a call.
let identity: BotIdentity | null = null;

/** Who the bot is (auth.test). */
export async function botIdentity(): Promise<BotIdentity> {
  if (identity) return identity;
  const data = await slackApi<{ user_id: string; user: string; team: string; team_id: string }>("auth.test");
  identity = { userId: data.user_id, name: data.user, team: data.team, teamId: data.team_id };
  return identity;
}

/** Post a new message. Returns its timestamp id ("ts"). */
export async function postMessage(input: {
  channel: string;
  text: string;
  threadTs?: string;
  blocks?: unknown[];
}): Promise<string> {
  const data = await slackApi<{ ts: string }>("chat.postMessage", {
    channel: input.channel,
    text: input.text,
    ...(input.threadTs ? { thread_ts: input.threadTs } : {}),
    ...(input.blocks ? { blocks: input.blocks } : {}),
    unfurl_links: false,
    unfurl_media: false,
  });
  return data.ts;
}

/** Replace the text (and blocks) of a message the bot posted. */
export async function updateMessage(input: {
  channel: string;
  ts: string;
  text: string;
  blocks?: unknown[];
}): Promise<void> {
  await slackApi("chat.update", {
    channel: input.channel,
    ts: input.ts,
    text: input.text,
    // An empty list clears blocks left over from an earlier version.
    blocks: input.blocks ?? [],
  });
}

export interface SlackChannel {
  id: string;
  name: string;
  isMember: boolean;
  isPrivate: boolean;
}

/** Every channel the bot can see (public, plus private ones it's in). Not archived. */
export async function listChannels(): Promise<SlackChannel[]> {
  const out: SlackChannel[] = [];
  let cursor = "";
  // A few pages is plenty for one team's workspace.
  for (let page = 0; page < 10; page++) {
    const fields: Record<string, string> = {
      types: "public_channel,private_channel",
      exclude_archived: "true",
      limit: "1000",
    };
    if (cursor) fields.cursor = cursor;
    const data = await slackApiForm<{
      channels: { id: string; name: string; is_member?: boolean; is_private?: boolean }[];
      response_metadata?: { next_cursor?: string };
    }>("conversations.list", fields);
    for (const ch of data.channels ?? []) {
      out.push({ id: ch.id, name: ch.name, isMember: Boolean(ch.is_member), isPrivate: Boolean(ch.is_private) });
    }
    cursor = data.response_metadata?.next_cursor ?? "";
    if (!cursor) break;
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** One channel's name, e.g. "build-team" (no #). Null if Slack won't say. */
export async function channelName(channelId: string): Promise<string | null> {
  try {
    const data = await slackApiForm<{ channel: { name?: string } }>("conversations.info", { channel: channelId });
    return data.channel?.name ?? null;
  } catch (err) {
    console.error(`[slack] conversations.info ${channelId} failed:`, err);
    return null;
  }
}
