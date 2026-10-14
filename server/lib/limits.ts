import { sql } from "drizzle-orm";
import { db } from "../../db/index.ts";

// Counters and rate limits kept in the database. Cloudflare runs many
// short-lived copies of the server, so anything counted in memory would
// reset at random and mean nothing.

/** Today's date as "YYYY-MM-DD" (UTC), the key for daily counters. */
export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** How many times `key` has been counted today. */
export async function countToday(key: string): Promise<number> {
  const rows = await db.all<{ count: number }>(
    sql`SELECT count FROM usage_counters WHERE key = ${key} AND day = ${today()}`,
  );
  return rows[0]?.count ?? 0;
}

/**
 * Count one use of `key` for today, unless that would pass `cap`.
 * Returns true if the use was counted (allowed), false if the cap is reached.
 * The check and the count happen in one statement, so two requests at the
 * same moment can't both squeeze past the cap.
 */
export async function useDailyAllowance(key: string, cap: number): Promise<boolean> {
  const rows = await db.all<{ count: number }>(sql`
    INSERT INTO usage_counters (key, day, count) VALUES (${key}, ${today()}, 1)
    ON CONFLICT (key, day) DO UPDATE SET count = count + 1 WHERE count < ${cap}
    RETURNING count
  `);
  return rows.length > 0;
}

/**
 * Rate limit: at most `max` attempts per `windowMs` for `key`.
 * Returns { allowed, retryAfterMs }. Each call counts as one attempt.
 */
export async function takeAttempt(
  key: string,
  max: number,
  windowMs: number,
): Promise<{ allowed: boolean; retryAfterMs: number }> {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const windowStartCutoff = new Date(now - windowMs).toISOString();
  // Start a new window if there's none or the old one ran out; else add one.
  const rows = await db.all<{ count: number; window_start: string }>(sql`
    INSERT INTO attempts (key, count, window_start) VALUES (${key}, 1, ${nowIso})
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN window_start < ${windowStartCutoff} THEN 1 ELSE count + 1 END,
      window_start = CASE WHEN window_start < ${windowStartCutoff} THEN ${nowIso} ELSE window_start END
    RETURNING count, window_start
  `);
  const row = rows[0];
  if (!row || row.count <= max) return { allowed: true, retryAfterMs: 0 };
  const resetAt = new Date(row.window_start).getTime() + windowMs;
  return { allowed: false, retryAfterMs: Math.max(0, resetAt - now) };
}

/** Peek without counting: is `key` currently over `max`? */
export async function isLimited(key: string, max: number, windowMs: number): Promise<boolean> {
  const cutoff = new Date(Date.now() - windowMs).toISOString();
  const rows = await db.all<{ count: number }>(
    sql`SELECT count FROM attempts WHERE key = ${key} AND window_start >= ${cutoff}`,
  );
  return (rows[0]?.count ?? 0) >= max;
}

/** Forget attempts for `key` (e.g. after a correct password). */
export async function clearAttempts(key: string): Promise<void> {
  await db.run(sql`DELETE FROM attempts WHERE key = ${key}`);
}
