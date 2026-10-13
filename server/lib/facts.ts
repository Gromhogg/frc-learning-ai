import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import { db } from "../../db/index.ts";
import { teamFacts, users } from "../../db/schema.ts";
import {
  MAX_PENDING_FACTS,
  MAX_PENDING_PER_USER,
  MAX_REJECTED_KEPT,
  MAX_TEAM_FACTS,
} from "./config.ts";

// Every fact operation the review pipeline needs, shared between the
// background learner (learn.ts) and the admin's review routes (routes/admin/facts.ts).
//
// Lifecycle: extracted facts land as "pending"; only admin-approved facts
// reach the system prompt; rejected facts stick around as a blocklist so the
// same wrong fact is never proposed twice. Nothing here hard-deletes an
// approved fact — "remove" is a flip to rejected.

export type FactStatus = "pending" | "approved" | "rejected";

export interface FactRow {
  id: number;
  text: string;
  status: FactStatus;
  mentionCount: number;
  createdAt: string | null;
  /** Which student's chat surfaced this — null for facts that predate review. */
  sourceUserName: string | null;
}

/**
 * The comparison key for "is this the same fact worded the same way".
 * Deliberately cheap: whitespace, case, and a trailing period shouldn't make
 * two facts different. Anything subtler is the extraction model's job — it
 * sees the full fact list and is told to reinforce instead of restate.
 */
export function normalizeFact(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase().replace(/\.$/, "");
}

/** Everything the review UI shows: the queue plus the live list. */
export async function listFacts(): Promise<{ pending: FactRow[]; approved: FactRow[] }> {
  const rows = await db
    .select({
      id: teamFacts.id,
      text: teamFacts.text,
      status: teamFacts.status,
      mentionCount: teamFacts.mentionCount,
      createdAt: teamFacts.createdAt,
      sourceUserName: users.name,
    })
    .from(teamFacts)
    .leftJoin(users, eq(teamFacts.sourceUserId, users.id))
    .where(ne(teamFacts.status, "rejected"));

  const byMentions = (a: FactRow, b: FactRow) => b.mentionCount - a.mentionCount || b.id - a.id;
  return {
    // Newest first — the queue reads like an inbox.
    pending: rows.filter((r) => r.status === "pending").sort((a, b) => b.id - a.id),
    // Most-mentioned first — the order admins already know.
    approved: rows.filter((r) => r.status === "approved").sort(byMentions),
  };
}

/** Facts the extraction model should know about: everything not rejected. */
export async function listFactsForExtraction() {
  return db
    .select({ id: teamFacts.id, text: teamFacts.text, status: teamFacts.status })
    .from(teamFacts)
    .where(ne(teamFacts.status, "rejected"))
    .orderBy(asc(teamFacts.id));
}

/**
 * Queue a freshly extracted fact for review. Returns why it was skipped so
 * the learner can log it. Duplicate checks run against every status —
 * matching a rejected fact means an admin already said no.
 */
export async function insertPendingFact(input: {
  text: string;
  sourceUserId: number;
  sourceConversationId: number;
}): Promise<"inserted" | "duplicate" | "user-capped"> {
  const clean = input.text.trim().slice(0, 300);
  const key = normalizeFact(clean);
  if (!key) return "duplicate";

  const existing = await db.select({ text: teamFacts.text }).from(teamFacts);
  if (existing.some((f) => normalizeFact(f.text) === key)) return "duplicate";

  const [{ count: userPending }] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(teamFacts)
    .where(and(eq(teamFacts.status, "pending"), eq(teamFacts.sourceUserId, input.sourceUserId)));
  if (userPending >= MAX_PENDING_PER_USER) return "user-capped";

  await db.insert(teamFacts).values({
    text: clean,
    status: "pending",
    sourceUserId: input.sourceUserId,
    sourceConversationId: input.sourceConversationId,
    lastSeenAt: new Date().toISOString(),
  });
  return "inserted";
}

/** A conversation confirmed an existing fact — counters only, never text. */
export async function reinforceFact(id: number): Promise<void> {
  await db
    .update(teamFacts)
    .set({ mentionCount: sql`${teamFacts.mentionCount} + 1`, lastSeenAt: new Date().toISOString() })
    .where(and(eq(teamFacts.id, id), ne(teamFacts.status, "rejected")));
}

/**
 * Approve a pending fact — optionally with the admin's corrected wording —
 * which puts it into every future system prompt. Refused at the cap: curated
 * facts are never silently dropped to make room.
 */
export async function approveFact(
  id: number,
  reviewerId: number,
  editedText?: string,
): Promise<{ ok: true } | { ok: false; reason: "at-cap" | "missing" }> {
  const [fact] = await db.select().from(teamFacts).where(eq(teamFacts.id, id));
  if (!fact || fact.status === "rejected") return { ok: false, reason: "missing" };

  const [{ count: approved }] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(teamFacts)
    .where(and(eq(teamFacts.status, "approved"), ne(teamFacts.id, id)));
  if (approved >= MAX_TEAM_FACTS) return { ok: false, reason: "at-cap" };

  const text = editedText?.trim().slice(0, 300);
  await db
    .update(teamFacts)
    .set({
      status: "approved",
      ...(text ? { text } : {}),
      reviewedBy: reviewerId,
      reviewedAt: new Date().toISOString(),
    })
    .where(eq(teamFacts.id, id));
  return { ok: true };
}

/**
 * Reject a pending fact, or remove an approved one. Either way the row stays
 * as a blocklist entry so re-mentions don't put it back in the queue.
 */
export async function rejectFact(id: number, reviewerId: number): Promise<void> {
  await db
    .update(teamFacts)
    .set({ status: "rejected", reviewedBy: reviewerId, reviewedAt: new Date().toISOString() })
    .where(eq(teamFacts.id, id));
}

/** Fix a fact's wording (pending or approved). */
export async function editFact(id: number, text: string): Promise<void> {
  await db
    .update(teamFacts)
    .set({ text: text.trim().slice(0, 300) })
    .where(eq(teamFacts.id, id));
}

/**
 * Expire what nobody will ever look at: pending facts past the queue cap
 * (oldest first — the admin plainly isn't reviewing them) and the oldest
 * entries of an overgrown blocklist. Approved facts are never touched.
 */
export async function trimQueues(): Promise<void> {
  await trimStatus("pending", MAX_PENDING_FACTS);
  await trimStatus("rejected", MAX_REJECTED_KEPT);
}

async function trimStatus(status: FactStatus, cap: number): Promise<void> {
  const rows = await db
    .select({ id: teamFacts.id })
    .from(teamFacts)
    .where(eq(teamFacts.status, status))
    .orderBy(desc(teamFacts.id));
  for (const row of rows.slice(cap)) {
    await db.delete(teamFacts).where(eq(teamFacts.id, row.id));
  }
}
