// Sorting Slack events into the few kinds of work the app does. Pure — no
// database, no network — so it is easy to test.

/** The outer wrapper Slack sends to POST /slack/events. */
export interface SlackEnvelope {
  type: string;
  challenge?: string;
  event_id?: string;
  team_id?: string;
  event?: SlackEvent;
  /** Who the app is in this workspace; the bot's user id is here. */
  authorizations?: { user_id?: string; is_bot?: boolean; team_id?: string }[];
}

export interface SlackEvent {
  type: string;
  subtype?: string;
  user?: string;
  bot_id?: string;
  text?: string;
  ts?: string;
  thread_ts?: string;
  channel?: string;
  channel_type?: string;
  team?: string;
  files?: unknown[];
  reaction?: string;
  item?: { type?: string; channel?: string; ts?: string };
}

/** Work for the background queue. */
export type SlackJob =
  /** Someone @mentioned the bot in a channel, or sent it a direct message. */
  | {
      kind: "chat";
      source: "mention" | "dm";
      channel: string;
      user: string;
      /** Slack-formatted text, as sent. */
      text: string;
      ts: string;
      /** Where to reply: the thread (channels), or null for the main DM. */
      replyThreadTs: string | null;
      botUserId: string | null;
      teamId: string | null;
      hasFiles: boolean;
    }
  /** A 👍 or 👎 was added to or removed from a message. */
  | { kind: "reaction"; added: boolean; rating: "up" | "down"; user: string; channel: string; ts: string }
  /** A message in a channel the bot might learn from. */
  | { kind: "buffer"; channel: string; user: string; text: string; ts: string };

// Message kinds worth reading. Edits, deletes, joins and the like are skipped.
const READABLE_SUBTYPES = new Set(["file_share", "thread_broadcast"]);

/** 👍 / 👎 by any skin tone → "up" / "down"; anything else → null. */
export function ratingFromReaction(reaction: string | undefined): "up" | "down" | null {
  const base = (reaction ?? "").replace(/::skin-tone-\d$/, "");
  if (base === "+1" || base === "thumbsup") return "up";
  if (base === "-1" || base === "thumbsdown") return "down";
  return null;
}

/** The bot's own Slack user id, from the event wrapper. */
export function botUserIdOf(envelope: SlackEnvelope): string | null {
  const auths = envelope.authorizations ?? [];
  return auths.find((a) => a.is_bot)?.user_id ?? auths[0]?.user_id ?? null;
}

/**
 * What to do with one event, or null to ignore it. Ignored: anything from a
 * bot (including this one), edits and other message changes, reactions that
 * aren't 👍/👎, and channel messages that @mention the bot (the matching
 * app_mention event handles those).
 */
export function eventToJob(envelope: SlackEnvelope): SlackJob | null {
  const ev = envelope.event;
  if (envelope.type !== "event_callback" || !ev) return null;
  const botUserId = botUserIdOf(envelope);
  const teamId = envelope.team_id ?? ev.team ?? null;

  if (ev.type === "reaction_added" || ev.type === "reaction_removed") {
    const rating = ratingFromReaction(ev.reaction);
    if (!rating || !ev.user || ev.user === botUserId) return null;
    if (ev.item?.type !== "message" || !ev.item.channel || !ev.item.ts) return null;
    return { kind: "reaction", added: ev.type === "reaction_added", rating, user: ev.user, channel: ev.item.channel, ts: ev.item.ts };
  }

  if (ev.type !== "app_mention" && ev.type !== "message") return null;
  if (ev.bot_id || ev.subtype === "bot_message") return null;
  if (ev.subtype && !READABLE_SUBTYPES.has(ev.subtype)) return null;
  if (!ev.user || ev.user === botUserId || !ev.channel || !ev.ts) return null;
  const text = ev.text ?? "";
  const hasFiles = Array.isArray(ev.files) && ev.files.length > 0;

  if (ev.type === "app_mention") {
    return {
      kind: "chat",
      source: "mention",
      channel: ev.channel,
      user: ev.user,
      text,
      ts: ev.ts,
      replyThreadTs: ev.thread_ts ?? ev.ts,
      botUserId,
      teamId,
      hasFiles,
    };
  }

  if (ev.channel_type === "im") {
    return {
      kind: "chat",
      source: "dm",
      channel: ev.channel,
      user: ev.user,
      text,
      ts: ev.ts,
      // Answer in the main DM, unless they wrote inside a thread there.
      replyThreadTs: ev.thread_ts ?? null,
      botUserId,
      teamId,
      hasFiles,
    };
  }

  if (ev.channel_type === "channel" || ev.channel_type === "group") {
    if (!text.trim()) return null;
    if (botUserId && text.includes(`<@${botUserId}`)) return null;
    return { kind: "buffer", channel: ev.channel, user: ev.user, text, ts: ev.ts };
  }

  return null;
}
