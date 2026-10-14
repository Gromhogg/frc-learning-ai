import { eq } from "drizzle-orm";
import { db } from "../../db/index.ts";
import { userProfiles } from "../../db/schema.ts";

// What the AI has picked up about one person's interests, from their own
// chats. Only that person ever sees it — it feeds their starter suggestions.
//
// Topics come from the same background call that learns team facts
// (learn.ts), so this costs no extra AI calls. Each topic keeps a score that
// fades a little every time something new is recorded, plus the last few
// chats it came up in.
//
// A topic only counts as "strong" (and shapes suggestions) once it shows up
// in 2+ different chats, or matches what the person firmly said they focus
// on. That way one long message or one long voice dictation full of topics
// can't flood their suggestions.

export interface Interest {
  topic: string;
  score: number;
  /** The last few distinct conversation ids this topic came up in. */
  chats: number[];
  lastSeen: string;
}

export type Profile = typeof userProfiles.$inferSelect;

const FADE = 0.8; // every score is multiplied by this on each new batch
const MAX_TOPICS = 8; // keep only the top topics
const MIN_SCORE = 0.15; // below this a topic is dropped
const MAX_CHATS_PER_TOPIC = 10;
const STRONG_MIN_CHATS = 2;
const MAX_TOPIC_CHARS = 40;
const MAX_TOPICS_PER_BATCH = 5;

/** Lowercase, plain spacing, no odd symbols, at most 40 characters. "" if nothing is left. */
export function normalizeTopic(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9 +#./&-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[.\-/&]+|[.\-/&]+$/g, "")
    .slice(0, MAX_TOPIC_CHARS)
    .trim();
}

/** True when a topic and the stated focus are about the same thing ("wiring" vs "wiring"). */
function matchesFocus(topic: string, focus: string | null): boolean {
  if (!focus) return false;
  const padded = (s: string) => ` ${s} `;
  return topic === focus || padded(focus).includes(padded(topic)) || padded(topic).includes(padded(focus));
}

function isStrong(interest: Interest, focus: string | null): boolean {
  return interest.chats.length >= STRONG_MIN_CHATS || matchesFocus(interest.topic, focus);
}

/** Read the interests JSON, skipping anything that doesn't look right. */
export function parseInterests(json: string | null | undefined): Interest[] {
  try {
    const list = JSON.parse(json ?? "[]") as unknown;
    if (!Array.isArray(list)) return [];
    return list.filter(
      (i): i is Interest =>
        !!i &&
        typeof i === "object" &&
        typeof (i as Interest).topic === "string" &&
        typeof (i as Interest).score === "number" &&
        Array.isArray((i as Interest).chats),
    );
  } catch {
    return [];
  }
}

/** The strong topics and stated focus — what suggestions are built from. */
export function strongSignals(profile: Pick<Profile, "interests" | "statedFocus">): {
  topics: string[];
  focus: string | null;
} {
  const focus = profile.statedFocus || null;
  return {
    topics: parseInterests(profile.interests)
      .filter((i) => isStrong(i, focus))
      .map((i) => i.topic),
    focus,
  };
}

/** A short text key for "the strong topics + focus", to spot when they change. */
export function signalKey(profile: Pick<Profile, "interests" | "statedFocus">): string {
  const { topics, focus } = strongSignals(profile);
  return JSON.stringify([[...topics].sort(), focus ?? ""]);
}

/** The person's profile row, or null if nothing has been learned yet. */
export async function findProfile(userId: number): Promise<Profile | null> {
  const [row] = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId));
  return row ?? null;
}

/** The person's profile row, made empty first if it doesn't exist yet. */
export async function getProfile(userId: number): Promise<Profile> {
  const found = await findProfile(userId);
  if (found) return found;
  await db.insert(userProfiles).values({ userId }).onConflictDoNothing();
  return (await findProfile(userId))!;
}

/**
 * Add what one batch of a chat showed about the person: up to 5 topics, and
 * a stated focus if they firmly said one ("I only do wiring"). Marks the
 * suggestions out of date only when the strong topics or focus change.
 */
export async function recordInterests(
  userId: number,
  conversationId: number,
  topics: string[],
  statedFocus: string,
): Promise<void> {
  const cleanTopics = [...new Set(topics.map((t) => (typeof t === "string" ? normalizeTopic(t) : "")))]
    .filter(Boolean)
    .slice(0, MAX_TOPICS_PER_BATCH);
  const cleanFocus = typeof statedFocus === "string" ? normalizeTopic(statedFocus) : "";
  // Small talk with no robotics topics changes nothing.
  if (cleanTopics.length === 0 && !cleanFocus) return;

  const profile = await getProfile(userId);
  const before = signalKey(profile);
  const now = new Date().toISOString();

  const list = parseInterests(profile.interests).map((i) => ({ ...i, score: i.score * FADE }));
  for (const topic of cleanTopics) {
    const found = list.find((i) => i.topic === topic);
    if (found) {
      found.score += 1;
      found.chats = [...found.chats.filter((id) => id !== conversationId), conversationId].slice(-MAX_CHATS_PER_TOPIC);
      found.lastSeen = now;
    } else {
      list.push({ topic, score: 1, chats: [conversationId], lastSeen: now });
    }
  }
  // A new firm statement replaces the old one; otherwise keep it.
  const focus = cleanFocus || profile.statedFocus;
  // Keep the top topics by score, but a strong topic keeps its spot over
  // one-offs until it fades out on its own — a burst of new topics can't
  // push out a real interest.
  const kept = list
    .filter((i) => i.score >= MIN_SCORE)
    .sort((a, b) => Number(isStrong(b, focus)) - Number(isStrong(a, focus)) || b.score - a.score)
    .slice(0, MAX_TOPICS)
    .sort((a, b) => b.score - a.score)
    .map((i) => ({ ...i, score: Math.round(i.score * 1000) / 1000 }));

  const next = { interests: JSON.stringify(kept), statedFocus: focus };
  const changed = signalKey(next) !== before;

  await db
    .update(userProfiles)
    .set({ ...next, suggestionsDirty: profile.suggestionsDirty || changed, updatedAt: now })
    .where(eq(userProfiles.userId, userId));
}

/** What the person can see about themself: topics (strong ones flagged) and their stated focus. */
export async function getInterests(userId: number): Promise<{
  topics: { topic: string; strong: boolean }[];
  statedFocus: string | null;
}> {
  const profile = await findProfile(userId);
  if (!profile) return { topics: [], statedFocus: null };
  const focus = profile.statedFocus || null;
  return {
    topics: parseInterests(profile.interests).map((i) => ({ topic: i.topic, strong: isStrong(i, focus) })),
    statedFocus: focus,
  };
}

/** Forget everything learned about the person, and their personal suggestions. */
export async function clearInterests(userId: number): Promise<void> {
  await db
    .update(userProfiles)
    .set({
      interests: "[]",
      statedFocus: null,
      suggestions: "[]",
      suggestionsGeneratedAt: null,
      suggestionsDirty: true,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(userProfiles.userId, userId));
}
