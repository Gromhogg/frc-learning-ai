import { asc, desc, eq, sql } from "drizzle-orm";
import { db } from "../../db/index.ts";
import { promptVersions, settings, teamFacts, users } from "../../db/schema.ts";
import { DEFAULT_SYSTEM_PROMPT } from "./default-prompt.ts";

export const PROMPT_KEY = "system_prompt";

export interface PromptVersion {
  version: number;
  text: string;
  authorId: number | null;
  authorName: string;
  note: string | null;
  createdAt: string | null;
}

/** History-list entry — same as a version, minus the (potentially large) text. */
export type PromptVersionMeta = Omit<PromptVersion, "text"> & { size: number };

export type SaveResult =
  | { ok: true; version: PromptVersion }
  /**
   * Somebody else saved while this editor was open. We hand back what's now
   * live so the caller can show both texts rather than picking a winner.
   */
  | { ok: false; conflict: PromptVersion };

/**
 * Pull the whole history, newest first. Text is left out — a long prompt
 * across fifty versions is a lot of bytes to send just to draw a list.
 */
export async function listVersions(): Promise<PromptVersionMeta[]> {
  await ensureSeeded();
  const rows = await db
    .select({
      version: promptVersions.version,
      authorId: promptVersions.authorId,
      authorName: promptVersions.authorName,
      note: promptVersions.note,
      createdAt: promptVersions.createdAt,
      size: sql<number>`length(${promptVersions.text})`,
    })
    .from(promptVersions)
    .orderBy(desc(promptVersions.version));
  return rows;
}

export async function getVersion(version: number): Promise<PromptVersion | null> {
  const [row] = await db
    .select()
    .from(promptVersions)
    .where(eq(promptVersions.version, version));
  return row ? toVersion(row) : null;
}

/** The live instructions: whichever version is highest. */
export async function currentVersion(): Promise<PromptVersion> {
  const seeded = await ensureSeeded();
  if (seeded) return seeded;

  const [row] = await db
    .select()
    .from(promptVersions)
    .orderBy(desc(promptVersions.version))
    .limit(1);

  // ensureSeeded() guarantees a row exists, so this is unreachable in practice.
  if (!row) throw new Error("prompt_versions is empty after seeding");
  return toVersion(row);
}

/** The teacher-editable instructions, as plain text. */
export async function getBasePrompt(): Promise<string> {
  return (await currentVersion()).text;
}

/**
 * Append a new version.
 *
 * `baseVersion` is the version the editor was working from. If it isn't the
 * live one any more, somebody else saved first and we refuse rather than
 * overwrite them — that silent overwrite is the whole reason this table exists.
 */
export async function savePromptVersion(input: {
  text: string;
  baseVersion: number;
  authorId: number;
  note?: string | null;
}): Promise<SaveResult> {
  const current = await currentVersion();
  if (input.baseVersion !== current.version) return { ok: false, conflict: current };

  const next = current.version + 1;
  const authorName = await nameOf(input.authorId);

  // The WHERE clause re-checks the version inside the INSERT itself, so this
  // is safe without a transaction — which matters because D1 has none. Two
  // simultaneous saves both compute the same `next`; the UNIQUE index on
  // `version` lets exactly one of them land.
  let inserted: unknown[];
  try {
    inserted = await db.all(sql`
      INSERT INTO prompt_versions (version, text, author_id, author_name, note)
      SELECT ${next}, ${input.text}, ${input.authorId}, ${authorName}, ${input.note ?? null}
      WHERE ${next} = (SELECT COALESCE(MAX(version), 0) + 1 FROM prompt_versions)
      RETURNING version
    `);
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, conflict: await currentVersion() };
    throw err;
  }

  // No row came back: the guard failed, so someone beat us to `next`.
  if (inserted.length === 0) return { ok: false, conflict: await currentVersion() };

  return { ok: true, version: await currentVersion() };
}

/**
 * Restore an older version by appending it again as the newest one.
 *
 * Deliberately not a delete: the history should record that someone reverted,
 * and the versions being stepped over stay readable.
 */
export async function rollbackTo(
  version: number,
  authorId: number,
): Promise<SaveResult | { ok: false; missing: true }> {
  const target = await getVersion(version);
  if (!target) return { ok: false, missing: true };

  const current = await currentVersion();
  return savePromptVersion({
    text: target.text,
    baseVersion: current.version,
    authorId,
    note: `Reverted to v${version}`,
  });
}

/** Learned team facts, most-mentioned first — the order teachers see. */
export async function getTeamFacts() {
  return db
    .select()
    .from(teamFacts)
    .orderBy(desc(teamFacts.mentionCount), desc(teamFacts.lastSeenAt));
}

/**
 * The full system prompt sent to Claude: the teacher's instructions plus
 * whatever the app has learned about this specific team's hardware.
 *
 * The team-context block is what makes "what motor is on the intake?"
 * answerable — without it the AI has no idea which motor anyone means.
 */
export async function buildSystemPrompt(): Promise<string> {
  const base = await getBasePrompt();

  // Ordered by id, not by mention count. Anthropic's prompt cache is a prefix
  // match, and learnFromExchange() bumps mentionCount/lastSeenAt after nearly
  // every exchange — ranking here would reshuffle this block constantly and
  // throw away the cache on the next turn. Insertion order never changes.
  const facts = await db.select().from(teamFacts).orderBy(asc(teamFacts.id));

  if (facts.length === 0) return base;

  const lines = facts.map((f) => `  - ${f.text}`).join("\n");

  return `${base}

━━━ TEAM CONTEXT (learned from this team's own chats) ━━━
Specifics about THIS team's robot, shop, and parts. When someone refers to
something vaguely ("the motor", "our router"), assume they mean these unless
they say otherwise.
${lines}`;
}

// ─── internals ────────────────────────────────────────────────────────────

function toVersion(row: typeof promptVersions.$inferSelect): PromptVersion {
  return {
    version: row.version,
    text: row.text,
    authorId: row.authorId,
    authorName: row.authorName,
    note: row.note,
    createdAt: row.createdAt,
  };
}

/**
 * Create version 1 on first use, carrying over whatever the old single-row
 * `settings` prompt held so nobody's existing edits are lost in the upgrade.
 * Returns the seeded version, or null if the table already had rows.
 */
async function ensureSeeded(): Promise<PromptVersion | null> {
  const [existing] = await db
    .select({ version: promptVersions.version })
    .from(promptVersions)
    .limit(1);
  if (existing) return null;

  const [legacy] = await db.select().from(settings).where(eq(settings.key, PROMPT_KEY));

  const rows = await db.all<{ version: number }>(sql`
    INSERT INTO prompt_versions (version, text, author_id, author_name, note)
    SELECT 1, ${legacy?.value ?? DEFAULT_SYSTEM_PROMPT}, NULL, ${"Original"}, ${
      legacy ? "Carried over from before versioning" : "Default instructions"
    }
    WHERE NOT EXISTS (SELECT 1 FROM prompt_versions)
    RETURNING version
  `);

  // Lost a race to seed — the winner's row is fine, fall through to read it.
  if (rows.length === 0) return null;
  return getVersion(1);
}

async function nameOf(userId: number): Promise<string> {
  const [user] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, userId));
  return user?.name ?? "Unknown";
}

function isUniqueViolation(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /UNIQUE constraint failed/i.test(message);
}
