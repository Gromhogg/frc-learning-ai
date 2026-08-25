import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { eq, asc, sql } from "drizzle-orm";
import { db } from "../../db/index.ts";
import { teamFacts } from "../../db/schema.ts";
import { LEARN_MODEL, MAX_TEAM_FACTS } from "./config.ts";

// What the model is allowed to hand back.
type Extraction =
  | { action: "new"; text: string }
  | { action: "reinforce"; id: number };

const EXTRACT_INSTRUCTIONS = `You maintain a small set of facts about ONE specific FIRST Robotics team, so an AI assistant can understand what team members mean when they speak loosely ("the motor", "our router", "the practice bot").

You will be given one exchange between a student and the assistant, plus the facts already on file.

Return ONLY durable, team-specific facts about:
- Hardware the team owns or uses (motor brands and models, controllers, batteries)
- Shop tools and machines this team has, and what they call them
- Materials, fasteners, and parts they standardize on
- Local naming: what a nickname or shorthand refers to
- How this team's robot is actually built (subsystem X uses part Y)

NEVER return:
- A person's name, or anything about who asked what
- A one-off question, a temporary problem, or today's debugging session
- General robotics or engineering knowledge that is true for every team
- Anything you are inferring rather than something that was actually stated or clearly shown

Most exchanges contain NOTHING worth saving. Returning an empty array is the correct and expected answer most of the time. Do not invent a fact to seem useful.

Respond with a JSON array and nothing else. Each entry is either:
  {"action":"new","text":"<one short factual sentence>"}
  {"action":"reinforce","id":<id of an existing fact this exchange confirms>}

Empty array if nothing qualifies: []`;

/** Pull the first JSON array out of the model's reply. */
function parseExtractions(raw: string): Extraction[] {
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) return [];
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((e): e is Extraction => {
      if (typeof e !== "object" || e === null) return false;
      const rec = e as Record<string, unknown>;
      if (rec.action === "new") return typeof rec.text === "string" && rec.text.trim().length > 0;
      if (rec.action === "reinforce") return typeof rec.id === "number";
      return false;
    });
  } catch {
    return [];
  }
}

/** Drop the weakest facts once we're over the cap. */
async function trimToCap(): Promise<void> {
  const all = await db.select({ id: teamFacts.id }).from(teamFacts);
  if (all.length <= MAX_TEAM_FACTS) return;

  const weakest = await db
    .select({ id: teamFacts.id })
    .from(teamFacts)
    .orderBy(asc(teamFacts.mentionCount), asc(teamFacts.lastSeenAt))
    .limit(all.length - MAX_TEAM_FACTS);

  for (const row of weakest) {
    await db.delete(teamFacts).where(eq(teamFacts.id, row.id));
  }
}

/**
 * Look at one finished exchange and update what we know about the team.
 *
 * This runs in the background after the student already has their answer,
 * so it must never throw into the request path — every failure is swallowed
 * and logged. A missed fact is not worth a broken chat.
 */
export async function learnFromExchange(
  userText: string,
  assistantText: string,
  hadPhoto: boolean,
): Promise<void> {
  try {
    if (!process.env.ANTHROPIC_API_KEY) return;
    if (!userText.trim() && !hadPhoto) return;

    const existing = await db.select().from(teamFacts);
    const existingList = existing.length
      ? existing.map((f) => `  ${f.id}: ${f.text}`).join("\n")
      : "  (none yet)";

    const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const { text } = await generateText({
      model: anthropic(LEARN_MODEL),
      system: EXTRACT_INSTRUCTIONS,
      messages: [
        {
          role: "user",
          content: `FACTS ALREADY ON FILE:
${existingList}

THE EXCHANGE:
Student${hadPhoto ? " (attached a photo)" : ""}: ${userText || "(photo only)"}

Assistant: ${assistantText}`,
        },
      ],
    });

    const extractions = parseExtractions(text);
    if (extractions.length === 0) return;

    const knownIds = new Set(existing.map((f) => f.id));
    const now = new Date().toISOString();

    for (const item of extractions) {
      if (item.action === "reinforce") {
        if (!knownIds.has(item.id)) continue;
        await db
          .update(teamFacts)
          .set({ mentionCount: sql`${teamFacts.mentionCount} + 1`, lastSeenAt: now })
          .where(eq(teamFacts.id, item.id));
      } else {
        const clean = item.text.trim().slice(0, 300);
        // Skip near-duplicates the model missed.
        const dupe = existing.some(
          (f) => f.text.trim().toLowerCase() === clean.toLowerCase(),
        );
        if (dupe) continue;
        await db.insert(teamFacts).values({ text: clean, lastSeenAt: now });
      }
    }

    await trimToCap();
  } catch (err) {
    console.error("learnFromExchange failed (chat was unaffected):", err);
  }
}
