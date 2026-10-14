import { and, asc, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { db } from "../../db/index.ts";
import { teamFacts, users } from "../../db/schema.ts";
import { logEvent } from "./events.ts";
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
// approved fact — "remove" is a flip to rejected, and an admin can restore it.
//
// Every text or status change bumps `version`. Admin edits and approvals say
// which version they saw; if someone else changed the fact since, the change
// is refused and both versions go back to the page, so nobody's work is
// silently overwritten.

export type FactStatus = "pending" | "approved" | "rejected";

export interface FactRow {
  id: number;
  text: string;
  status: FactStatus;
  mentionCount: number;
  version: number;
  createdAt: string | null;
  /** Which student's chat surfaced this — null for facts that predate review. */
  sourceUserName: string | null;
  /** Who last approved, rejected, or restored it, and when. */
  reviewedByName: string | null;
  reviewedAt: string | null;
}

/** What a fact looks like right now — sent back when a change is refused. */
export interface FactSnapshot {
  id: number;
  text: string;
  version: number;
  status: FactStatus;
}

export type FactChangeResult =
  | { ok: true }
  | { ok: false; reason: "missing" }
  | { ok: false; reason: "at-cap" }
  /** Someone else changed it since this admin loaded it. */
  | { ok: false; reason: "conflict"; current: FactSnapshot };

/** How many removed facts the review page shows. */
const REMOVED_SHOWN = 100;

/**
 * The comparison key for "is this the same fact worded the same way".
 * Deliberately cheap: whitespace, case, and a trailing period shouldn't make
 * two facts different. Anything subtler is the extraction model's job — it
 * sees the full fact list and is told to reinforce instead of restate.
 */
export function normalizeFact(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase().replace(/\.$/, "");
}

/** Everything the review UI shows: the queue, the live list, and what was removed. */
export async function listFacts(): Promise<{ pending: FactRow[]; approved: FactRow[]; removed: FactRow[] }> {
  const reviewer = alias(users, "reviewer");
  const columns = {
    id: teamFacts.id,
    text: teamFacts.text,
    status: teamFacts.status,
    mentionCount: teamFacts.mentionCount,
    version: teamFacts.version,
    createdAt: teamFacts.createdAt,
    sourceUserName: users.name,
    reviewedByName: reviewer.name,
    reviewedAt: teamFacts.reviewedAt,
  };

  const rows = await db
    .select(columns)
    .from(teamFacts)
    .leftJoin(users, eq(teamFacts.sourceUserId, users.id))
    .leftJoin(reviewer, eq(teamFacts.reviewedBy, reviewer.id))
    .where(ne(teamFacts.status, "rejected"));

  // Most recently removed first.
  const removed = await db
    .select(columns)
    .from(teamFacts)
    .leftJoin(users, eq(teamFacts.sourceUserId, users.id))
    .leftJoin(reviewer, eq(teamFacts.reviewedBy, reviewer.id))
    .where(eq(teamFacts.status, "rejected"))
    .orderBy(desc(teamFacts.reviewedAt), desc(teamFacts.id))
    .limit(REMOVED_SHOWN);

  const byMentions = (a: FactRow, b: FactRow) => b.mentionCount - a.mentionCount || b.id - a.id;
  return {
    // Newest first — the queue reads like an inbox.
    pending: rows.filter((r) => r.status === "pending").sort((a, b) => b.id - a.id),
    // Most-mentioned first — the order admins already know.
    approved: rows.filter((r) => r.status === "approved").sort(byMentions),
    removed,
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
 * facts are never silently dropped to make room. Refused too if the fact
 * changed since the admin loaded it (`expectedVersion`).
 */
export async function approveFact(
  id: number,
  reviewerId: number,
  expectedVersion: number,
  editedText?: string,
): Promise<FactChangeResult> {
  const fact = await getFact(id);
  if (!fact) return { ok: false, reason: "missing" };
  if (fact.version !== expectedVersion || fact.status === "rejected") {
    return { ok: false, reason: "conflict", current: snapshot(fact) };
  }

  const [{ count: approved }] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(teamFacts)
    .where(and(eq(teamFacts.status, "approved"), ne(teamFacts.id, id)));
  if (approved >= MAX_TEAM_FACTS) return { ok: false, reason: "at-cap" };

  const text = editedText?.trim().slice(0, 300);
  const changed = await db
    .update(teamFacts)
    .set({
      status: "approved",
      ...(text ? { text } : {}),
      version: sql`${teamFacts.version} + 1`,
      reviewedBy: reviewerId,
      reviewedAt: new Date().toISOString(),
    })
    // Checked again inside the update, so two admins clicking at once can't both win.
    .where(and(eq(teamFacts.id, id), eq(teamFacts.version, expectedVersion)))
    .returning({ id: teamFacts.id });
  if (changed.length === 0) return conflictOrMissing(id);

  const reworded = text !== undefined && text !== fact.text;
  await logEvent({
    actorId: reviewerId,
    action: "fact.approve",
    target: `fact #${id}`,
    summary: reworded ? `Approved with new wording: "${snip(text)}"` : `Approved: "${snip(fact.text)}"`,
  });
  return { ok: true };
}

/**
 * Reject a pending fact, or remove an approved one. Either way the row stays
 * as a blocklist entry so re-mentions don't put it back in the queue — and
 * an admin can restore it from the Removed list.
 */
export async function rejectFact(id: number, reviewerId: number): Promise<boolean> {
  const fact = await getFact(id);
  if (!fact) return false;
  if (fact.status === "rejected") return true;

  await db
    .update(teamFacts)
    .set({
      status: "rejected",
      version: sql`${teamFacts.version} + 1`,
      reviewedBy: reviewerId,
      reviewedAt: new Date().toISOString(),
    })
    .where(eq(teamFacts.id, id));

  const wasApproved = fact.status === "approved";
  await logEvent({
    actorId: reviewerId,
    action: wasApproved ? "fact.remove" : "fact.reject",
    target: `fact #${id}`,
    summary: `${wasApproved ? "Removed from the AI's memory" : "Rejected"}: "${snip(fact.text)}"`,
  });
  return true;
}

/**
 * Put a removed (rejected) fact back in the review queue. It goes to
 * "pending", not straight into the prompt — an admin approves it from there.
 */
export async function restoreFact(id: number, adminId: number): Promise<FactChangeResult> {
  const fact = await getFact(id);
  if (!fact) return { ok: false, reason: "missing" };

  const changed = await db
    .update(teamFacts)
    .set({
      status: "pending",
      version: sql`${teamFacts.version} + 1`,
      reviewedBy: adminId,
      reviewedAt: new Date().toISOString(),
    })
    .where(and(eq(teamFacts.id, id), eq(teamFacts.status, "rejected")))
    .returning({ id: teamFacts.id });
  if (changed.length === 0) return { ok: false, reason: "conflict", current: snapshot((await getFact(id)) ?? fact) };

  await logEvent({
    actorId: adminId,
    action: "fact.restore",
    target: `fact #${id}`,
    summary: `Put back for review: "${snip(fact.text)}"`,
  });
  return { ok: true };
}

/** Fix a fact's wording (pending or approved), if nobody changed it since `expectedVersion`. */
export async function editFact(
  id: number,
  text: string,
  expectedVersion: number,
  adminId: number,
): Promise<FactChangeResult> {
  const fact = await getFact(id);
  if (!fact) return { ok: false, reason: "missing" };
  if (fact.version !== expectedVersion || fact.status === "rejected") {
    return { ok: false, reason: "conflict", current: snapshot(fact) };
  }

  const clean = text.trim().slice(0, 300);
  if (clean === fact.text) return { ok: true };

  const changed = await db
    .update(teamFacts)
    .set({ text: clean, version: sql`${teamFacts.version} + 1` })
    .where(and(eq(teamFacts.id, id), eq(teamFacts.version, expectedVersion)))
    .returning({ id: teamFacts.id });
  if (changed.length === 0) return conflictOrMissing(id);

  await logEvent({
    actorId: adminId,
    action: "fact.edit",
    target: `fact #${id}`,
    summary: `Changed wording: "${snip(fact.text, 40)}" → "${snip(clean, 40)}"`,
  });
  return { ok: true };
}

/**
 * Expire what nobody will ever look at: pending facts past the queue cap
 * (oldest first — the admin plainly isn't reviewing them) and the oldest
 * entries of an overgrown blocklist. Approved facts are never touched, and
 * neither is a fact an admin put back in the queue on purpose.
 */
export async function trimQueues(): Promise<void> {
  // Pending: only facts no admin has touched (a restored fact has a reviewer).
  const pending = await db
    .select({ id: teamFacts.id })
    .from(teamFacts)
    .where(and(eq(teamFacts.status, "pending"), isNull(teamFacts.reviewedBy)))
    .orderBy(desc(teamFacts.id));
  await deleteRows(pending.slice(MAX_PENDING_FACTS));

  // Rejected: keep the most recently removed ones.
  const rejected = await db
    .select({ id: teamFacts.id })
    .from(teamFacts)
    .where(eq(teamFacts.status, "rejected"))
    .orderBy(desc(teamFacts.reviewedAt), desc(teamFacts.id));
  await deleteRows(rejected.slice(MAX_REJECTED_KEPT));
}

// ─── internals ────────────────────────────────────────────────────────────

async function deleteRows(rows: { id: number }[]): Promise<void> {
  for (const row of rows) {
    await db.delete(teamFacts).where(eq(teamFacts.id, row.id));
  }
}

async function getFact(id: number) {
  const [fact] = await db.select().from(teamFacts).where(eq(teamFacts.id, id));
  return fact ?? null;
}

function snapshot(fact: { id: number; text: string; version: number; status: FactStatus }): FactSnapshot {
  return { id: fact.id, text: fact.text, version: fact.version, status: fact.status };
}

/** A guarded update matched nothing: either someone changed it first, or it's gone. */
async function conflictOrMissing(id: number): Promise<FactChangeResult> {
  const now = await getFact(id);
  return now ? { ok: false, reason: "conflict", current: snapshot(now) } : { ok: false, reason: "missing" };
}

/** A short piece of a fact's text for the activity log. */
function snip(text: string, max = 80): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}
