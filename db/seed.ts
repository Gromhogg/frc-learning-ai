import "../server/lib/env.ts";
import { eq } from "drizzle-orm";
import { db, runMigrations } from "./index.ts";
import { settings } from "./schema.ts";
import { DEFAULT_SYSTEM_PROMPT } from "../server/lib/default-prompt.ts";
import { PROMPT_KEY } from "../server/lib/prompt.ts";
import { ensureDocsSeeded } from "../server/lib/docs.ts";
import { ensureDocsMigrated } from "../server/lib/docs-migration.ts";
import { ensurePromptSectionsMigrated } from "../server/lib/prompt-sections-migration.ts";

// Seeds what the app needs to start: the default AI instructions and the
// starter reference docs. No users are created — the first person to sign up
// with the admin code becomes the admin.
async function seed() {
  runMigrations();
  const [existing] = await db.select().from(settings).where(eq(settings.key, PROMPT_KEY));

  if (existing) {
    console.log("System prompt already set — leaving it alone.");
  } else {
    await db.insert(settings).values({ key: PROMPT_KEY, value: DEFAULT_SYSTEM_PROMPT });
    console.log("Seeded the default system prompt.");
  }

  // Older installs get their inline shop reference moved into the docs
  // library; fresh installs get the starter docs. Then the instructions are
  // split into editable sections (once, flag-guarded).
  await ensureDocsMigrated();
  await ensurePromptSectionsMigrated();
  ensureDocsSeeded();
}

seed();
