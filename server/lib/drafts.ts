import { waitUntil } from "cloudflare:workers";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../../db/index.ts";
import { promptDrafts, users } from "../../db/schema.ts";
import { logEvent } from "./events.ts";
import { currentVersion, getVersion, saveSections, sectionsOf, type PromptVersion } from "./prompt.ts";
import { parseDoc, serializeDoc, SECTIONS_FORMAT, type PromptSection } from "./prompt-sections.ts";
import { alertNewSuggestion } from "../slack/alerts.ts";

// Prompt drafts: changes an agent proposes but never applies. An admin
// applies one (a normal new prompt version, same conflict rules as a person
// saving) or dismisses it. This is the safety valve on self-improvement —
// nothing an agent writes reaches students without a person saying yes.

export type DraftStatus = "pending" | "applied" | "dismissed";

export interface Draft {
  id: number;
  source: "admin_chat" | "review";
  baseVersion: number;
  sections: PromptSection[];
  /** The sections the agent started from, so the UI can show a diff. */
  baseSections: PromptSection[];
  title: string;
  reason: string;
  evidence: number[];
  status: DraftStatus;
  createdByName: string | null;
  agentChatId: number | null;
  appliedVersion: number | null;
  createdAt: string | null;
  /** True when the live prompt has moved on since the agent read it. */
  stale: boolean;
}

/** Record a new draft. Every create, apply, and dismiss goes in the activity log. */
export async function createDraft(input: {
  source: "admin_chat" | "review";
  baseVersion: number;
  sections: PromptSection[];
  title: string;
  reason: string;
  evidence?: number[];
  createdBy?: number | null;
  agentChatId?: number | null;
}): Promise<number> {
  const [row] = await db
    .insert(promptDrafts)
    .values({
      source: input.source,
      baseVersion: input.baseVersion,
      sections: serializeDoc({ sections: input.sections }),
      title: input.title.trim().slice(0, 120) || "Prompt change",
      reason: input.reason.trim().slice(0, 2000),
      evidence: JSON.stringify(input.evidence ?? []),
      createdBy: input.createdBy ?? null,
      agentChatId: input.agentChatId ?? null,
    })
    .returning({ id: promptDrafts.id, title: promptDrafts.title });

  await logEvent({
    actorId: input.createdBy ?? null,
    action: "draft.create",
    target: `draft #${row.id}`,
    summary: `${input.source === "review" ? "Reviewer suggested" : "Prompt assistant drafted"}: ${row.title}`,
  });

  // Tell admins in Slack (if set up) — in the background, and a failed alert
  // never undoes or blocks the draft.
  if (input.source === "review") {
    try {
      waitUntil(alertNewSuggestion(row.title).catch((err) => console.error("Suggestion alert failed:", err)));
    } catch (err) {
      console.error("Couldn't send the suggestion alert:", err);
    }
  }
  return row.id;
}

export async function countPendingDrafts(): Promise<number> {
  const [{ count }] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(promptDrafts)
    .where(eq(promptDrafts.status, "pending"));
  return count;
}

export async function listDrafts(status?: DraftStatus): Promise<Draft[]> {
  const rows = await db
    .select({ draft: promptDrafts, createdByName: users.name })
    .from(promptDrafts)
    .leftJoin(users, eq(promptDrafts.createdBy, users.id))
    .where(status ? eq(promptDrafts.status, status) : undefined)
    .orderBy(desc(promptDrafts.id))
    .limit(100);
  const live = await currentVersion();
  const bases = new Map<number, PromptVersion | null>();
  const out: Draft[] = [];
  for (const { draft, createdByName } of rows) {
    if (!bases.has(draft.baseVersion)) bases.set(draft.baseVersion, await getVersion(draft.baseVersion));
    out.push(toDraft(draft, createdByName, bases.get(draft.baseVersion) ?? null, live.version));
  }
  return out;
}

export async function getDraft(id: number): Promise<Draft | null> {
  const [row] = await db
    .select({ draft: promptDrafts, createdByName: users.name })
    .from(promptDrafts)
    .leftJoin(users, eq(promptDrafts.createdBy, users.id))
    .where(eq(promptDrafts.id, id));
  if (!row) return null;
  const live = await currentVersion();
  return toDraft(row.draft, row.createdByName, await getVersion(row.draft.baseVersion), live.version);
}

export type ApplyResult =
  | { ok: true; version: PromptVersion }
  | { ok: false; reason: "missing" }
  | { ok: false; reason: "not-pending" }
  | { ok: false; reason: "conflict"; current: PromptVersion };

/**
 * Apply a draft as the next prompt version.
 *
 * A stale draft (the prompt changed since the agent read it) is refused
 * unless `onTopOfLatest` is set — then it's saved over the newest version,
 * which the admin has seen in the diff.
 */
export async function applyDraft(
  id: number,
  adminId: number,
  onTopOfLatest = false,
): Promise<ApplyResult> {
  const [row] = await db.select().from(promptDrafts).where(eq(promptDrafts.id, id));
  if (!row) return { ok: false, reason: "missing" };
  if (row.status !== "pending") return { ok: false, reason: "not-pending" };

  const baseVersion = onTopOfLatest ? (await currentVersion()).version : row.baseVersion;
  const result = await saveSections({
    sections: parseDoc(row.sections, SECTIONS_FORMAT).sections,
    baseVersion,
    authorId: adminId,
    note: `${row.source === "review" ? "Suggestion" : "Agent edit"}: ${row.title}`.slice(0, 200),
  });
  if (!result.ok) return { ok: false, reason: "conflict", current: result.conflict };

  // Guarded on status so a double-click can't apply the same draft twice.
  await db
    .update(promptDrafts)
    .set({
      status: "applied",
      reviewedBy: adminId,
      reviewedAt: new Date().toISOString(),
      appliedVersion: result.version.version,
    })
    .where(and(eq(promptDrafts.id, id), eq(promptDrafts.status, "pending")));

  await logEvent({
    actorId: adminId,
    action: "draft.apply",
    target: `draft #${id}`,
    summary: `Applied "${row.title}" — saved as v${result.version.version}`,
  });
  return { ok: true, version: result.version };
}

export async function dismissDraft(id: number, adminId: number): Promise<boolean> {
  const updated = await db
    .update(promptDrafts)
    .set({ status: "dismissed", reviewedBy: adminId, reviewedAt: new Date().toISOString() })
    .where(and(eq(promptDrafts.id, id), eq(promptDrafts.status, "pending")))
    .returning({ id: promptDrafts.id, title: promptDrafts.title });
  if (updated.length === 0) return false;

  await logEvent({
    actorId: adminId,
    action: "draft.dismiss",
    target: `draft #${id}`,
    summary: `Dismissed "${updated[0].title}"`,
  });
  return true;
}

function toDraft(
  row: typeof promptDrafts.$inferSelect,
  createdByName: string | null,
  base: PromptVersion | null,
  liveVersion: number,
): Draft {
  return {
    id: row.id,
    source: row.source,
    baseVersion: row.baseVersion,
    sections: parseDoc(row.sections, SECTIONS_FORMAT).sections,
    baseSections: base ? sectionsOf(base) : [],
    title: row.title,
    reason: row.reason,
    evidence: JSON.parse(row.evidence) as number[],
    status: row.status,
    createdByName,
    agentChatId: row.agentChatId,
    appliedVersion: row.appliedVersion,
    createdAt: row.createdAt,
    stale: row.status === "pending" && row.baseVersion !== liveVersion,
  };
}
