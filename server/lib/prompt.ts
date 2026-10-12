import { asc, desc, eq, sql } from "drizzle-orm";
import { db } from "../../db/index.ts";
import { promptVersions, settings, teamFacts, users } from "../../db/schema.ts";
import { DEFAULT_SYSTEM_PROMPT } from "./default-prompt.ts";
import { buildDocIndex, ensureDocsSeeded } from "./docs.ts";
import {
  assembleDoc,
  parseDoc,
  serializeDoc,
  SECTIONS_FORMAT,
  type PromptFormat,
  type PromptSection,
} from "./prompt-sections.ts";

export const PROMPT_KEY = "system_prompt";

export interface PromptVersion {
  version: number;
  /** Raw stored payload — the prompt itself, or a sections JSON document. */
  text: string;
  format: PromptFormat;
  authorId: number | null;
  authorName: string;
  note: string | null;
  createdAt: string | null;
}

/** History-list entry — same as a version, minus the (potentially large) text. */
export type PromptVersionMeta = Omit<PromptVersion, "text" | "format"> & { size: number };

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

/**
 * A version's assembled prompt text, whatever its storage format. Identity
 * for plain-text versions — pre-sections rows keep producing the exact bytes
 * they always did, so the prompt cache survives the format transition.
 */
export function assembledTextOf(v: PromptVersion): string {
  return v.format === "text" ? v.text : assembleDoc(parseDoc(v.text, v.format));
}

/** A version's editable sections — legacy text becomes one big section. */
export function sectionsOf(v: PromptVersion): PromptSection[] {
  return parseDoc(v.text, v.format).sections;
}

/** The teacher-editable instructions, as plain text. */
export async function getBasePrompt(): Promise<string> {
  return assembledTextOf(await currentVersion());
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
  format?: PromptFormat;
  baseVersion: number;
  authorId: number;
  note?: string | null;
}): Promise<SaveResult> {
  const current = await currentVersion();
  if (input.baseVersion !== current.version) return { ok: false, conflict: current };

  const next = current.version + 1;
  const authorName = await nameOf(input.authorId);

  const landed = await insertVersion(
    next,
    input.text,
    input.format ?? "text",
    input.authorId,
    authorName,
    input.note ?? null,
  );
  if (!landed) return { ok: false, conflict: await currentVersion() };

  return { ok: true, version: await currentVersion() };
}

/** Save a teacher's edited sections as the next version. */
export async function saveSections(input: {
  sections: PromptSection[];
  baseVersion: number;
  authorId: number;
  note?: string | null;
}): Promise<SaveResult> {
  return savePromptVersion({
    text: serializeDoc({ sections: input.sections }),
    format: SECTIONS_FORMAT,
    baseVersion: input.baseVersion,
    authorId: input.authorId,
    note: input.note,
  });
}

/**
 * Append a version written by the app itself rather than a person — used by
 * the one-time docs migration. Same append-only rules as a teacher save; a
 * lost race just means recomputing `next` and trying again.
 */
export async function appendSystemVersion(
  text: string,
  note: string,
  format: PromptFormat = "text",
): Promise<PromptVersion> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await currentVersion();
    const landed = await insertVersion(current.version + 1, text, format, null, "System", note);
    if (landed) return currentVersion();
  }
  throw new Error("Could not append a system prompt version — too much write contention.");
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
    format: target.format,
    baseVersion: current.version,
    authorId,
    note: `Reverted to v${version}`,
  });
}

/**
 * The full system prompt sent to Claude: the teacher's instructions, the
 * index of reference docs the AI can open with read_doc, and whatever the
 * app has learned about this specific team's hardware.
 *
 * The team-context block is what makes "what motor is on the intake?"
 * answerable — without it the AI has no idea which motor anyone means.
 *
 * Every block here keeps a stable order between requests. Anthropic's prompt
 * cache is a prefix match: the doc index sorts by filename (it only changes
 * when a teacher edits the library), and the facts block holds only APPROVED
 * facts ordered by id — so its bytes change only when a teacher acts on the
 * review queue, never behind anyone's back. Reinforcements bump counters
 * that this block deliberately doesn't print.
 */
export async function buildSystemPrompt(): Promise<string> {
  ensureDocsSeeded();
  const base = await getBasePrompt();
  const docIndex = buildDocIndex();
  const facts = await db
    .select()
    .from(teamFacts)
    .where(eq(teamFacts.status, "approved"))
    .orderBy(asc(teamFacts.id));

  const parts = [base];
  if (docIndex) parts.push(docIndex);

  if (facts.length > 0) {
    const lines = facts.map((f) => `  - ${f.text}`).join("\n");
    parts.push(`━━━ TEAM CONTEXT (learned from this team's own chats) ━━━
Specifics about THIS team's robot, shop, and parts. When someone refers to
something vaguely ("the motor", "our router"), assume they mean these unless
they say otherwise.
${lines}`);
  }

  return parts.join("\n\n");
}

// ─── internals ────────────────────────────────────────────────────────────

/**
 * The one guarded INSERT every append goes through. The WHERE clause
 * re-checks the version inside the INSERT itself, so this is safe without a
 * transaction — which matters because D1 has none. Two simultaneous saves
 * both compute the same `next`; the UNIQUE index on `version` lets exactly
 * one of them land. Returns false when this one lost.
 */
async function insertVersion(
  next: number,
  text: string,
  format: PromptFormat,
  authorId: number | null,
  authorName: string,
  note: string | null,
): Promise<boolean> {
  let inserted: unknown[];
  try {
    inserted = await db.all(sql`
      INSERT INTO prompt_versions (version, text, format, author_id, author_name, note)
      SELECT ${next}, ${text}, ${format}, ${authorId}, ${authorName}, ${note}
      WHERE ${next} = (SELECT COALESCE(MAX(version), 0) + 1 FROM prompt_versions)
      RETURNING version
    `);
  } catch (err) {
    if (isUniqueViolation(err)) return false;
    throw err;
  }
  return inserted.length > 0;
}

function toVersion(row: typeof promptVersions.$inferSelect): PromptVersion {
  return {
    version: row.version,
    text: row.text,
    format: row.format,
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
