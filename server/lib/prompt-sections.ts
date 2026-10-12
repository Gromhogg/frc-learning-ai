// The structured form of the teacher-editable instructions: an ordered list
// of sections, each individually editable, reorderable, and toggleable.
//
// A whole document is stored per version in prompt_versions.text (tagged
// format = "sections@1"), so the existing append-only versioning, conflict
// handling, and history keep working unchanged. Assembly is a pure function
// of the stored document — same version row, same bytes, every request —
// which is what keeps Anthropic's prompt prefix cache warm.

export interface PromptSection {
  /** Stable slug, unique within the document. */
  id: string;
  /** UI label only — never part of the assembled prompt. */
  title: string;
  /** Verbatim prompt text, heading lines included. */
  body: string;
  enabled: boolean;
}

export interface PromptDoc {
  /** Array order is assembly order. */
  sections: PromptSection[];
}

export type PromptFormat = "text" | "sections@1";
export const SECTIONS_FORMAT = "sections@1";

const ID_PATTERN = /^[a-z0-9-]{1,64}$/;
const MAX_SECTION_BODY = 20_000;
const MAX_TOTAL_BODY = 100_000;

/**
 * What the AI actually receives: enabled sections' bodies, in order,
 * separated by blank lines. No sorting, no timestamps, no conditionals on
 * anything but the document itself — determinism is the contract here.
 */
export function assembleDoc(doc: PromptDoc): string {
  return doc.sections
    .filter((s) => s.enabled)
    .map((s) => s.body)
    .join("\n\n");
}

/** Canonical bytes for storage: fixed key order, no formatting whims. */
export function serializeDoc(doc: PromptDoc): string {
  return JSON.stringify({
    sections: doc.sections.map((s) => ({
      id: s.id,
      title: s.title,
      body: s.body,
      enabled: s.enabled,
    })),
  });
}

/**
 * Read a stored version back into a document. A plain-text version — the
 * pre-sections era, or a restore of one — becomes a single editable section
 * whose body is the whole prompt, which assembles back to identical bytes.
 */
export function parseDoc(text: string, format: string): PromptDoc {
  if (format === SECTIONS_FORMAT) {
    try {
      const parsed = JSON.parse(text) as unknown;
      const checked = validateSections((parsed as { sections?: unknown })?.sections);
      if (checked.ok) return { sections: checked.sections };
    } catch {
      // Fall through to the text wrap — a corrupt row should degrade to an
      // editable blob, never a crash in the chat path.
    }
  }
  return { sections: [{ id: "instructions", title: "Instructions", body: text, enabled: true }] };
}

/**
 * Gate for teacher-submitted sections. Normalizes titles (trim) but leaves
 * bodies byte-for-byte alone — parseDoc runs stored rows through this same
 * check, so any body rewrite here would make a stored document assemble to
 * different bytes than the ones verified at save time.
 */
export function validateSections(
  input: unknown,
): { ok: true; sections: PromptSection[] } | { ok: false; error: string } {
  if (!Array.isArray(input)) return { ok: false, error: "Sections must be a list." };
  if (input.length === 0) return { ok: false, error: "At least one section is required." };
  if (input.length > 50) return { ok: false, error: "Too many sections (50 max)." };

  const sections: PromptSection[] = [];
  const seen = new Set<string>();
  let totalBody = 0;

  for (const raw of input) {
    if (typeof raw !== "object" || raw === null) {
      return { ok: false, error: "Each section must be an object." };
    }
    const { id, title, body, enabled } = raw as Record<string, unknown>;
    if (typeof id !== "string" || !ID_PATTERN.test(id)) {
      return { ok: false, error: `Section id "${String(id)}" must be a short lowercase slug.` };
    }
    if (seen.has(id)) return { ok: false, error: `Duplicate section id "${id}".` };
    seen.add(id);
    if (typeof title !== "string" || !title.trim()) {
      return { ok: false, error: "Every section needs a title." };
    }
    if (typeof body !== "string") return { ok: false, error: "Section bodies must be text." };
    if (body.length > MAX_SECTION_BODY) {
      return { ok: false, error: `Section "${title.trim()}" is too long (20,000 characters max).` };
    }
    if (typeof enabled !== "boolean") {
      return { ok: false, error: "Each section must say whether it's enabled." };
    }
    totalBody += body.length;
    sections.push({ id, title: title.trim(), body, enabled });
  }

  if (totalBody > MAX_TOTAL_BODY) {
    return { ok: false, error: "The instructions are too long overall (100,000 characters max)." };
  }
  const assembled = assembleDoc({ sections });
  if (!assembled.trim()) {
    return { ok: false, error: "At least one enabled section with text is required." };
  }
  return { ok: true, sections };
}

/**
 * Split a legacy one-blob prompt into sections on its ALL-CAPS heading lines
 * ("HOW TO TALK", "SAFETY", …), heading kept inside each body. The safety
 * valve is byte equality: if the split doesn't assemble back to the exact
 * original text, fall back to one big section — a join of one section is the
 * identity, so migration can never change what the AI sees or invalidate
 * the prompt cache.
 */
export function splitLegacyPrompt(text: string): PromptDoc {
  const headingLine = /^[A-Z][A-Z0-9 &/-]*$/;
  const lines = text.split("\n");

  const chunks: { heading: string | null; lines: string[] }[] = [];
  let current: { heading: string | null; lines: string[] } = { heading: null, lines: [] };
  for (const line of lines) {
    const trimmed = line.trim();
    if (headingLine.test(trimmed) && trimmed.length >= 3) {
      if (current.lines.length > 0 || current.heading !== null) chunks.push(current);
      current = { heading: trimmed, lines: [line] };
    } else {
      current.lines.push(line);
    }
  }
  chunks.push(current);

  const seen = new Set<string>();
  const sections: PromptSection[] = chunks
    .filter((c) => c.lines.length > 0)
    .map((c) => {
      const title = c.heading ? titleCase(c.heading) : "Intro";
      let id = c.heading ? slugify(c.heading) : "intro";
      while (seen.has(id)) id = `${id}-2`.slice(0, 64);
      seen.add(id);
      // Trailing blank lines come off the body; assembly's "\n\n" separator
      // puts exactly one blank line back between sections.
      const body = c.lines.join("\n").replace(/\n+$/, "");
      return { id, title, body, enabled: true };
    })
    .filter((s) => s.body !== "");

  const candidate: PromptDoc = { sections };
  if (sections.length > 1 && assembleDoc(candidate) === text) return candidate;

  return { sections: [{ id: "instructions", title: "Instructions", body: text, enabled: true }] };
}

function slugify(heading: string): string {
  return (
    heading
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "section"
  );
}

function titleCase(heading: string): string {
  const lower = heading.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}
