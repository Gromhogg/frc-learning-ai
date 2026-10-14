import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "../../db/index.ts";
import { messageFeedback, teamFacts } from "../../db/schema.ts";
import { countPendingDrafts } from "../lib/drafts.ts";
import { isSlackConfigured } from "./api.ts";
import { appUrl, postAdminAlert } from "./alerts.ts";
import { getAlertChannel, getSetting, LAST_DIGEST_KEY, setSetting } from "./settings.ts";

// Once a day, around 4 pm school time, tell admins what's waiting for them —
// only if something is.

const TIME_ZONE = "America/Los_Angeles";
const DIGEST_HOUR = 16;

/** The hour (0–23) and date ("YYYY-MM-DD") in the school's time zone. */
export function schoolClock(now: Date): { hour: number; date: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { hour: Number(get("hour")), date: `${get("year")}-${get("month")}-${get("day")}` };
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Hourly: send today's digest if it's past 4 pm and it hasn't gone out yet. */
export async function maybeSendDigest(now = new Date()): Promise<void> {
  if (!isSlackConfigured() || !(await getAlertChannel())) return;
  const { hour, date } = schoolClock(now);
  if (hour < DIGEST_HOUR) return;
  if ((await getSetting(LAST_DIGEST_KEY)) === date) return;
  // Remember first, so a slow or failed post never sends twice.
  await setSetting(LAST_DIGEST_KEY, date);

  const [{ facts }] = await db
    .select({ facts: sql<number>`COUNT(*)` })
    .from(teamFacts)
    .where(eq(teamFacts.status, "pending"));
  const [{ downs }] = await db
    .select({ downs: sql<number>`COUNT(*)` })
    .from(messageFeedback)
    .where(and(eq(messageFeedback.rating, "down"), gte(messageFeedback.createdAt, sql`datetime('now', '-1 day')`)));
  const drafts = await countPendingDrafts();
  if (facts === 0 && downs === 0 && drafts === 0) return;

  const base = appUrl();
  const lines = ["📋 *Daily check-in from 972 Chat Bot*"];
  if (facts > 0) {
    lines.push(`• ${plural(facts, "team fact is", "team facts are")} waiting for review — <${base}/admin/facts|Review facts>`);
  }
  if (drafts > 0) {
    lines.push(`• ${plural(drafts, "prompt suggestion is", "prompt suggestions are")} waiting — <${base}/admin/suggestions|See suggestions>`);
  }
  if (downs > 0) {
    lines.push(`• ${plural(downs, "answer", "answers")} got a 👎 in the last 24 hours — <${base}/admin/suggestions|Review recent chats>`);
  }
  await postAdminAlert(lines.join("\n"));
}
