import { and, asc, desc, eq, lt, sql } from "drizzle-orm";
import { db } from "../../db/index.ts";
import {
  conversations,
  messageFeedback,
  messages,
  slackMessages,
  slackThreads,
  slackUsers,
  users,
} from "../../db/schema.ts";
import { isSchoolEmail } from "../lib/school-email.ts";
import { takeAttempt } from "../lib/limits.ts";
import { createTutor, describeTutorStep } from "../agents/tutor.ts";
import { historyToMessages, runAgentTurn, type StepImage } from "../ai/run-agent.ts";
import { modelFor } from "../ai/models.ts";
import { apiKeyFor } from "../ai/api-keys.ts";
import { botIdentity, postMessage, slackApiForm, updateMessage } from "./api.ts";
import { appUrl } from "./alerts.ts";
import { answerBlocks, clampText, escapeSlack, markdownToMrkdwn, slackToPlain } from "./format.ts";
import type { SlackJob } from "./events.ts";

// Chatting in Slack: the same tutor as the web app, answering @mentions in
// channels (in a thread) and direct messages. Every Slack chat is a normal
// app conversation too, so it shows up in the person's sidebar on the web.

type ChatJob = Extract<SlackJob, { kind: "chat" }>;
type ReactionJob = Extract<SlackJob, { kind: "reaction" }>;

/** Messages per person per hour, across Slack. */
const CHAT_LIMIT = 30;
const CHAT_WINDOW_MS = 60 * 60 * 1000;
/** A DM continues the same chat if the last message was this recent. */
const DM_CONTINUE_MS = 2 * 60 * 60 * 1000;

export const SLACK_TEXT = {
  thinking: "Thinking…",
  sorry: "Sorry — something went wrong. Try again.",
  schoolOnly: "I can only chat with school accounts — use the Slack account with your school email.",
  hello: "Hi! Ask me anything about the robot, the shop, or robotics.",
  noKey: "There's no AI key set up yet. Ask an admin, or add your own under API key in the web app's menu.",
};

/** First line of the first question, used as the sidebar label (same as the web chat). */
function titleFrom(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (oneLine.length <= 50) return oneLine || "New chat";
  return `${oneLine.slice(0, 50).replace(/\s+\S*$/, "")}…`;
}

/** Times from the database: ISO strings, or SQLite's "YYYY-MM-DD HH:MM:SS" (UTC). */
function dbTimeMs(value: string | null | undefined): number {
  if (!value) return NaN;
  return new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`).getTime();
}

// ─── who is this? ──────────────────────────────────────────────────────────

/**
 * Find the app account for a Slack person, matched by school email. Makes
 * a student account the first time if there isn't one. Null when their
 * Slack email isn't a school email.
 */
export async function linkSlackUser(slackUserId: string, teamId: string | null): Promise<number | null> {
  const [link] = await db
    .select({ userId: slackUsers.userId })
    .from(slackUsers)
    .where(eq(slackUsers.slackUserId, slackUserId));
  if (link) return link.userId;

  const info = await slackApiForm<{
    user: {
      is_bot?: boolean;
      deleted?: boolean;
      real_name?: string;
      name?: string;
      profile?: { email?: string; real_name?: string; display_name?: string };
    };
  }>("users.info", { user: slackUserId });
  const profile = info.user?.profile ?? {};
  const email = profile.email?.trim().toLowerCase() ?? "";
  if (info.user?.is_bot || info.user?.deleted || !isSchoolEmail(email)) return null;

  const findUser = async () =>
    (await db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${email}`))[0];

  let user = await findUser();
  if (!user) {
    const name =
      (profile.real_name || info.user.real_name || profile.display_name || email.split("@")[0]).trim().slice(0, 100);
    try {
      [user] = await db
        .insert(users)
        .values({ name, email, role: "student", emailVerifiedAt: sql`CURRENT_TIMESTAMP` })
        .returning({ id: users.id });
    } catch (err) {
      // Someone made the same account a moment ago.
      user = await findUser();
      if (!user) throw err;
    }
  }

  await db
    .insert(slackUsers)
    .values({ slackUserId, userId: user.id, slackTeamId: teamId })
    .onConflictDoNothing();
  return user.id;
}

// ─── which chat? ───────────────────────────────────────────────────────────

async function newConversation(userId: number, text: string): Promise<number> {
  const [row] = await db
    .insert(conversations)
    .values({ userId, title: titleFrom(text) })
    .returning({ id: conversations.id });
  return row.id;
}

async function conversationOwner(id: number): Promise<number | null> {
  const [row] = await db.select({ userId: conversations.userId }).from(conversations).where(eq(conversations.id, id));
  return row?.userId ?? null;
}

/**
 * The app conversation for this Slack message.
 * - Channel threads: one conversation per thread. Everyone who @mentions the
 *   bot in that thread adds to it; it belongs to whoever started it.
 * - DMs: keep going in the last DM chat if it was active in the last 2 hours,
 *   otherwise start a new one.
 */
async function conversationFor(job: ChatJob, userId: number, text: string): Promise<{ id: number; threadRowId: number }> {
  if (job.source === "mention") {
    const threadTs = job.replyThreadTs ?? job.ts;
    const find = async () =>
      (
        await db
          .select()
          .from(slackThreads)
          .where(and(eq(slackThreads.channelId, job.channel), eq(slackThreads.threadTs, threadTs)))
      )[0];

    const existing = await find();
    if (existing && (await conversationOwner(existing.conversationId)) !== null) {
      return { id: existing.conversationId, threadRowId: existing.id };
    }
    const id = await newConversation(userId, text);
    if (existing) {
      await db.update(slackThreads).set({ conversationId: id }).where(eq(slackThreads.id, existing.id));
      return { id, threadRowId: existing.id };
    }
    await db.insert(slackThreads).values({ channelId: job.channel, threadTs, conversationId: id }).onConflictDoNothing();
    // If two messages raced, use whichever row won.
    const row = (await find())!;
    return { id: row.conversationId, threadRowId: row.id };
  }

  const [last] = await db
    .select()
    .from(slackThreads)
    .where(eq(slackThreads.channelId, job.channel))
    .orderBy(desc(slackThreads.id))
    .limit(1);
  if (last && Date.now() - dbTimeMs(last.lastActivityAt) < DM_CONTINUE_MS) {
    if ((await conversationOwner(last.conversationId)) === userId) {
      return { id: last.conversationId, threadRowId: last.id };
    }
  }
  const id = await newConversation(userId, text);
  const [row] = await db
    .insert(slackThreads)
    .values({ channelId: job.channel, threadTs: job.ts, conversationId: id })
    .onConflictDoUpdate({
      target: [slackThreads.channelId, slackThreads.threadTs],
      set: { conversationId: id },
    })
    .returning({ id: slackThreads.id });
  return { id, threadRowId: row.id };
}

// ─── answering ─────────────────────────────────────────────────────────────

/**
 * Save the question, run the tutor on the saved history (same flow as the
 * web chat), and save the answer. Returns what to show in Slack.
 */
async function runTutor(conversationId: number, text: string, apiKey: { key: string | undefined; own: boolean }) {
  const [question] = await db
    .insert(messages)
    .values({ conversationId, role: "user", text, images: "[]" })
    .returning({ id: messages.id });

  // Everything before this question. Slack chats are text only.
  const rows = await db
    .select({ role: messages.role, text: messages.text })
    .from(messages)
    .where(and(eq(messages.conversationId, conversationId), lt(messages.id, question.id)))
    .orderBy(asc(messages.id));

  const agent = await createTutor(historyToMessages(rows, await modelFor("tutor")), apiKey.key);
  const result = await runAgentTurn(agent, { text }, () => {}, describeTutorStep, { ownKey: apiKey.own });

  let messageId = 0;
  if (result.text || result.steps.length > 0) {
    const [saved] = await db
      .insert(messages)
      .values({
        conversationId,
        role: "assistant",
        text: result.text,
        steps: JSON.stringify(
          result.steps.map(({ id, tool, label, images }) => ({ id, tool, label, status: "done", images })),
        ),
      })
      .returning({ id: messages.id });
    messageId = saved.id;
  }
  await db
    .update(conversations)
    .set({ updatedAt: new Date().toISOString() })
    .where(eq(conversations.id, conversationId));

  const images: StepImage[] = result.steps.flatMap((s) => s.images ?? []);
  return { text: result.text, error: result.error, images, messageId };
}

/** Answer one @mention or DM. Errors after "Thinking…" is posted are shown there, not thrown. */
export async function handleChat(job: ChatJob): Promise<void> {
  const threadTs = job.replyThreadTs ?? undefined;
  const reply = (text: string) => postMessage({ channel: job.channel, text, threadTs });

  const userId = await linkSlackUser(job.user, job.teamId);
  if (userId === null) {
    await reply(SLACK_TEXT.schoolOnly);
    return;
  }

  const limit = await takeAttempt(`slack-chat:${userId}`, CHAT_LIMIT, CHAT_WINDOW_MS);
  if (!limit.allowed) {
    const minutes = Math.max(1, Math.ceil(limit.retryAfterMs / 60_000));
    await reply(
      `You've sent a lot of messages this hour. Take a short break and try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.`,
    );
    return;
  }

  const botUserId = job.botUserId ?? (await botIdentity()).userId;
  const text = slackToPlain(job.text, botUserId).slice(0, 8000);
  if (!text) {
    const web = appUrl();
    await reply(
      job.hasFiles
        ? `I can't see photos sent in Slack yet. Tell me about it in words${web ? `, or send the photo in the web app: ${web}` : "."}`
        : SLACK_TEXT.hello,
    );
    return;
  }

  const apiKey = await apiKeyFor(userId);
  if (!apiKey.key) {
    await reply(SLACK_TEXT.noKey);
    return;
  }

  const conversation = await conversationFor(job, userId, text);
  const placeholderTs = await reply(SLACK_TEXT.thinking);

  try {
    const answer = await runTutor(conversation.id, text, apiKey);
    if (answer.messageId) {
      await db
        .insert(slackMessages)
        .values({ channelId: job.channel, ts: placeholderTs, messageId: answer.messageId })
        .onConflictDoNothing();
    }
    await db
      .update(slackThreads)
      .set({ lastActivityAt: new Date().toISOString() })
      .where(eq(slackThreads.id, conversation.threadRowId));

    if (!answer.text.trim()) {
      await updateMessage({ channel: job.channel, ts: placeholderTs, text: escapeSlack(answer.error ?? SLACK_TEXT.sorry) });
      return;
    }

    let mrkdwn = markdownToMrkdwn(answer.text);
    if (answer.error && answer.error !== "Stopped.") mrkdwn += `\n\n_${escapeSlack(answer.error)}_`;
    const fallback = clampText(mrkdwn);

    if (answer.images.length === 0) {
      await updateMessage({ channel: job.channel, ts: placeholderTs, text: fallback });
      return;
    }
    try {
      await updateMessage({ channel: job.channel, ts: placeholderTs, text: fallback, blocks: answerBlocks(mrkdwn, answer.images) });
    } catch (err) {
      // Slack couldn't load a picture: send the answer with picture links only.
      console.error("[slack] answer with pictures failed, sending links only:", err);
      await updateMessage({
        channel: job.channel,
        ts: placeholderTs,
        text: fallback,
        blocks: answerBlocks(mrkdwn, answer.images, false),
      });
    }
  } catch (err) {
    console.error(`[slack] answering in ${job.channel} failed:`, err);
    await updateMessage({ channel: job.channel, ts: placeholderTs, text: SLACK_TEXT.sorry }).catch((e) =>
      console.error("[slack] couldn't show the error message:", e),
    );
  }
}

// ─── 👍 / 👎 ───────────────────────────────────────────────────────────────

/**
 * A 👍 or 👎 on one of the bot's answers counts as feedback — same rules as
 * the web app: only the person whose chat it is, one rating per answer.
 */
export async function handleReaction(job: ReactionJob): Promise<void> {
  const [answer] = await db
    .select({ messageId: slackMessages.messageId, role: messages.role, ownerId: conversations.userId })
    .from(slackMessages)
    .innerJoin(messages, eq(slackMessages.messageId, messages.id))
    .innerJoin(conversations, eq(messages.conversationId, conversations.id))
    .where(and(eq(slackMessages.channelId, job.channel), eq(slackMessages.ts, job.ts)));
  if (!answer || answer.role !== "assistant") return;

  const [link] = await db
    .select({ userId: slackUsers.userId })
    .from(slackUsers)
    .where(eq(slackUsers.slackUserId, job.user));
  if (!link || link.userId !== answer.ownerId) return;

  const mine = and(eq(messageFeedback.messageId, answer.messageId), eq(messageFeedback.userId, link.userId));
  if (job.added) {
    // A new thumb replaces the old one.
    await db.delete(messageFeedback).where(mine);
    await db.insert(messageFeedback).values({ messageId: answer.messageId, userId: link.userId, rating: job.rating });
  } else {
    // Taking a 👍 away only clears a 👍 (not a 👎 added since).
    await db.delete(messageFeedback).where(and(mine, eq(messageFeedback.rating, job.rating)));
  }
}
