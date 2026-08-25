import { desc } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.ts";
import { settings, teamFacts } from "../../db/schema.ts";
import { DEFAULT_SYSTEM_PROMPT } from "./default-prompt.ts";

export const PROMPT_KEY = "system_prompt";

/** The teacher-editable instructions. Falls back to the default if unset. */
export async function getBasePrompt(): Promise<string> {
  const [row] = await db.select().from(settings).where(eq(settings.key, PROMPT_KEY));
  return row?.value ?? DEFAULT_SYSTEM_PROMPT;
}

export async function saveBasePrompt(value: string): Promise<void> {
  const [existing] = await db.select().from(settings).where(eq(settings.key, PROMPT_KEY));
  if (existing) {
    await db.update(settings).set({ value }).where(eq(settings.key, PROMPT_KEY));
  } else {
    await db.insert(settings).values({ key: PROMPT_KEY, value });
  }
}

/** Learned team facts, most-mentioned first. */
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
  const facts = await getTeamFacts();

  if (facts.length === 0) return base;

  const lines = facts.map((f) => `  - ${f.text}`).join("\n");

  return `${base}

━━━ TEAM CONTEXT (learned from this team's own chats) ━━━
Specifics about THIS team's robot, shop, and parts. When someone refers to
something vaguely ("the motor", "our router"), assume they mean these unless
they say otherwise.
${lines}`;
}
