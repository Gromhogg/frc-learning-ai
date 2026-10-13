import { eq } from "drizzle-orm";
import { db } from "../../db/index.ts";
import { settings } from "../../db/schema.ts";
import { REFERENCE_DOCS_PARAGRAPH } from "./default-prompt.ts";
import { sanitizeDocName, writeDoc } from "./docs.ts";
import { appendSystemVersion, currentVersion } from "./prompt.ts";

// One-time move of the old inline "SHOP & TEAM REFERENCE" section out of the
// live prompt and into the docs library. Runs at every server start but does
// its work exactly once, guarded by a settings flag — flag-based on purpose,
// so an admin who deliberately restores the old long prompt from history is
// never re-slimmed behind their back.

const FLAG_KEY = "docs_migrated";
const REFERENCE_MARKER = "━━━ SHOP & TEAM REFERENCE ━━━";

export async function ensureDocsMigrated(): Promise<void> {
  try {
    const [flag] = await db.select().from(settings).where(eq(settings.key, FLAG_KEY));
    if (flag) return;

    // currentVersion() also carries a pre-versioning `settings` prompt into
    // prompt_versions first, so we always split the text the admin actually
    // has live — their edits included — never the shipped default.
    const live = await currentVersion();
    const markerAt = live.text.indexOf(REFERENCE_MARKER);

    if (markerAt !== -1) {
      const header = live.text.slice(0, markerAt).trimEnd();
      const reference = live.text.slice(markerAt + REFERENCE_MARKER.length).trim();

      const sections = splitSections(reference);
      if (sections.length === 0 && reference) {
        sections.push({ heading: "Shop reference", body: reference });
      }

      for (const section of sections) {
        const name = sanitizeDocName(`${slugify(section.heading)}.md`);
        if (!name) continue;
        // keep-both: lands on the plain name normally, and never overwrites
        // if a file with that name somehow already exists.
        writeDoc(name, Buffer.from(`# ${section.heading}\n\n${section.body}\n`), "keep-both");
      }

      await appendSystemVersion(
        `${header}\n\n${REFERENCE_DOCS_PARAGRAPH}`,
        "Moved the shop reference into the docs library (automatic)",
      );
      console.log(`Docs migration: moved ${sections.length} reference sections into the docs library.`);
    }

    await db
      .insert(settings)
      .values({ key: FLAG_KEY, value: new Date().toISOString() })
      .onConflictDoNothing();
  } catch (err) {
    // A failed migration must never stop the server. The flag is only set on
    // success, so this retries on the next start.
    console.error("Docs migration failed (will retry on next start):", err);
  }
}

// ─── internals ────────────────────────────────────────────────────────────

/**
 * Split the reference block on its ALL-CAPS heading lines ("VERTICAL MILL",
 * "CAD IN ONSHAPE", …). Anything before the first heading is dropped only if
 * blank; otherwise it becomes part of the first section's body via the
 * zero-sections fallback above.
 */
function splitSections(reference: string): { heading: string; body: string }[] {
  const headingLine = /^[A-Z][A-Z0-9 &/-]*$/;
  const sections: { heading: string; body: string }[] = [];
  let current: { heading: string; lines: string[] } | null = null;

  for (const line of reference.split("\n")) {
    if (headingLine.test(line.trim()) && line.trim().length >= 3) {
      if (current) sections.push({ heading: current.heading, body: current.lines.join("\n").trim() });
      current = { heading: line.trim(), lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) sections.push({ heading: current.heading, body: current.lines.join("\n").trim() });

  return sections.filter((s) => s.body !== "");
}

function slugify(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
