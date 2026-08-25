import "../server/lib/env.ts";
import { eq } from "drizzle-orm";
import { db } from "./index.ts";
import { settings } from "./schema.ts";
import { DEFAULT_SYSTEM_PROMPT } from "../server/lib/default-prompt.ts";
import { PROMPT_KEY } from "../server/lib/prompt.ts";

// Seeds the one row the app needs to start: the default AI instructions.
// No users are created — the first person to sign up with the teacher code
// becomes the teacher.
async function seed() {
  const [existing] = await db.select().from(settings).where(eq(settings.key, PROMPT_KEY));

  if (existing) {
    console.log("System prompt already set — leaving it alone.");
    return;
  }

  await db.insert(settings).values({ key: PROMPT_KEY, value: DEFAULT_SYSTEM_PROMPT });
  console.log("Seeded the default system prompt.");
}

seed();
