import { eq } from "drizzle-orm";
import { db } from "../../db/index.ts";
import { settings } from "../../db/schema.ts";
import { appendSystemVersion, currentVersion } from "./prompt.ts";
import { assembleDoc, SECTIONS_FORMAT, serializeDoc, splitLegacyPrompt } from "./prompt-sections.ts";

// One-time split of the single-blob instructions into editable sections.
// Runs at every server start but does its work exactly once, guarded by a
// settings flag — flag-based on purpose, so an admin who deliberately
// restores an old one-blob version from history is never re-split behind
// their back.
//
// The split is guaranteed lossless: splitLegacyPrompt() only returns a
// multi-section document when it assembles back to the EXACT bytes of the
// original prompt (falling back to one big section otherwise, which is the
// identity). The AI's prompt — and its cache prefix — cannot change here.

const FLAG_KEY = "prompt_sections_migrated";

export async function ensurePromptSectionsMigrated(): Promise<void> {
  try {
    const [flag] = await db.select().from(settings).where(eq(settings.key, FLAG_KEY));
    if (flag) return;

    // currentVersion() seeds v1 from the legacy settings prompt if needed,
    // so fresh installs and old ones take the same path through here.
    const head = await currentVersion();

    if (head.format !== SECTIONS_FORMAT) {
      const doc = splitLegacyPrompt(head.text);
      if (assembleDoc(doc) !== head.text) {
        // The safety valve inside splitLegacyPrompt makes this unreachable;
        // checked anyway because "migration changed the prompt" is the one
        // failure this file exists to rule out.
        throw new Error("Section split did not assemble back to the original prompt.");
      }
      await appendSystemVersion(
        serializeDoc(doc),
        "Split the instructions into editable sections (automatic)",
        SECTIONS_FORMAT,
      );
      console.log(`Prompt migration: split the instructions into ${doc.sections.length} section(s).`);
    }

    await db
      .insert(settings)
      .values({ key: FLAG_KEY, value: new Date().toISOString() })
      .onConflictDoNothing();
  } catch (err) {
    // A failed migration must never stop the server. The flag is only set on
    // success, so this retries on the next start.
    console.error("Prompt sections migration failed (will retry on next start):", err);
  }
}
