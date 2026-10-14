import { desc, eq } from "drizzle-orm";
import { db } from "../../db/index.ts";
import { adminEvents, users } from "../../db/schema.ts";

// The admin activity log: every change an admin (or an agent acting for one)
// makes to shared things — the prompt, drafts, facts, docs, settings, admin
// access. Append-only; nothing here is ever edited or deleted.

export interface AdminEvent {
  id: number;
  actorId: number | null;
  actorName: string;
  action: string;
  target: string | null;
  summary: string;
  createdAt: string | null;
}

/**
 * Record one admin action. `actorId` null means the app did it on its own
 * (e.g. the daily reviewer). Never throws — a logging failure must not
 * undo or block the action it describes.
 */
export async function logEvent(input: {
  actorId: number | null;
  action: string;
  target?: string | null;
  summary: string;
}): Promise<void> {
  try {
    let actorName = "System";
    if (input.actorId !== null) {
      const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, input.actorId));
      actorName = u?.name ?? "Unknown";
    }
    await db.insert(adminEvents).values({
      actorId: input.actorId,
      actorName,
      action: input.action,
      target: input.target ?? null,
      summary: input.summary.slice(0, 500),
    });
  } catch (err) {
    console.error("logEvent failed:", err);
  }
}

/** Newest first. */
export async function listEvents(limit = 200): Promise<AdminEvent[]> {
  return db.select().from(adminEvents).orderBy(desc(adminEvents.id)).limit(limit);
}
