import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { DOCS_DIR, DOCS_TRASH_DIR } from "./config.ts";
import { DEFAULT_DOCS } from "./default-docs.ts";

// The reference docs the AI can open mid-answer. Plain files on disk, no
// database: the directory listing is the source of truth, so an admin can
// also manage docs straight from the filesystem if they want to.
//
// Nothing here is ever destroyed. "Replace" and "delete" move the old file
// into DOCS_TRASH_DIR with a timestamp prefix — the docs-library counterpart
// of the append-only prompt_versions table.

export interface DocMeta {
  name: string;
  size: number;
  /** SQLite-style "YYYY-MM-DD HH:MM:SS" in UTC, same shape the rest of the app's timestamps use. */
  modifiedAt: string;
  /** First non-empty line of the file, markdown #s stripped. */
  title: string;
}

export type WriteDocResult =
  | { status: "ok"; doc: DocMeta }
  /** A doc with this name already exists and no overwrite mode was chosen. */
  | { status: "conflict"; existing: DocMeta };

const ALLOWED_EXTENSIONS = new Set([".txt", ".md"]);

/**
 * Turn whatever filename arrived (from an upload or from the model) into a
 * safe name inside DOCS_DIR, or null if it can't be one. basename() first so
 * "../" can never escape the folder — same guard as uploads.ts.
 */
export function sanitizeDocName(raw: string): string | null {
  const base = path.basename(raw.trim()).replace(/[^A-Za-z0-9._ -]/g, "-");
  if (!base || base.startsWith(".")) return null;
  if (!ALLOWED_EXTENSIONS.has(path.extname(base).toLowerCase())) return null;
  return base;
}

/** Real text only: no NUL bytes, and it must decode as strict UTF-8. */
export function isTextContent(bytes: Buffer): boolean {
  if (bytes.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

/**
 * Every doc in the library, sorted by plain byte order. The sort is
 * load-bearing: the doc index goes into the system prompt, and Anthropic's
 * prompt cache is a prefix match — a listing that changed order between
 * requests would throw the cache away on every turn.
 */
export function listDocs(): DocMeta[] {
  ensureDocsSeeded();
  if (!existsSync(DOCS_DIR)) return [];

  return readdirSync(DOCS_DIR)
    .filter((name) => !name.startsWith(".") && ALLOWED_EXTENSIONS.has(path.extname(name).toLowerCase()))
    .filter((name) => statSync(path.join(DOCS_DIR, name)).isFile())
    .sort()
    .map(metaOf);
}

/** Metadata for one doc, or null if it doesn't exist. */
export function statDoc(rawName: string): DocMeta | null {
  const name = sanitizeDocName(rawName);
  if (!name || !existsSync(path.join(DOCS_DIR, name))) return null;
  return metaOf(name);
}

export function readDoc(rawName: string): { name: string; content: string } | null {
  const name = sanitizeDocName(rawName);
  if (!name) return null;
  const full = path.join(DOCS_DIR, name);
  if (!existsSync(full)) return null;
  return { name, content: readFileSync(full, "utf-8") };
}

/**
 * Write one doc. `name` must already be sanitized.
 *
 * - "create":    refuse if the name is taken — the caller decides what to do.
 * - "replace":   move the old file to trash, then write. The old bytes are
 *                safe before the new ones land, so a crash loses nothing.
 * - "keep-both": find a free "name-2.md"-style variant and use that.
 *
 * The `wx` flag makes create-if-absent atomic: two simultaneous writes of the
 * same name can't both win, one gets EEXIST.
 */
export function writeDoc(
  name: string,
  bytes: Buffer,
  mode: "create" | "replace" | "keep-both" = "create",
): WriteDocResult {
  mkdirSync(DOCS_DIR, { recursive: true });

  if (mode === "replace") {
    trashDoc(name);
    writeFileSync(path.join(DOCS_DIR, name), bytes, { flag: "wx" });
    return { status: "ok", doc: metaOf(name) };
  }

  if (mode === "keep-both") {
    const ext = path.extname(name);
    const stem = name.slice(0, name.length - ext.length);
    for (let n = 1; ; n++) {
      const candidate = n === 1 ? name : `${stem}-${n}${ext}`;
      try {
        writeFileSync(path.join(DOCS_DIR, candidate), bytes, { flag: "wx" });
        return { status: "ok", doc: metaOf(candidate) };
      } catch (err) {
        if (!isExists(err)) throw err;
      }
    }
  }

  try {
    writeFileSync(path.join(DOCS_DIR, name), bytes, { flag: "wx" });
    return { status: "ok", doc: metaOf(name) };
  } catch (err) {
    if (isExists(err)) return { status: "conflict", existing: metaOf(name) };
    throw err;
  }
}

/** Move a doc into the trash folder with a timestamp prefix. False if it wasn't there. */
export function trashDoc(name: string): boolean {
  const full = path.join(DOCS_DIR, name);
  if (!existsSync(full)) return false;

  mkdirSync(DOCS_TRASH_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/:/g, "-");
  renameSync(full, path.join(DOCS_TRASH_DIR, `${stamp}__${name}`));
  return true;
}

let seedChecked = false;

/**
 * Write the default docs the first time the library is used — but only when
 * the folder doesn't exist at all. A folder that exists and is empty means a
 * admin deleted everything on purpose, and that choice is respected.
 */
export function ensureDocsSeeded(): void {
  if (seedChecked) return;
  seedChecked = true;
  if (existsSync(DOCS_DIR)) return;

  mkdirSync(DOCS_DIR, { recursive: true });
  for (const [name, content] of Object.entries(DEFAULT_DOCS)) {
    writeFileSync(path.join(DOCS_DIR, name), content, { flag: "wx" });
  }
}

/**
 * The listing the AI sees in its system prompt: filenames plus first-line
 * titles, nothing more. The contents only cost tokens when the model actually
 * opens a doc with the read_doc tool. Byte-identical between requests until a
 * admin changes a file — the same cache-friendliness rule as the rest of
 * the prompt (see buildSystemPrompt).
 */
export function buildDocIndex(): string {
  const docs = listDocs();
  if (docs.length === 0) return "";

  const lines = docs.map((d) => `  - ${d.name} — ${d.title}`).join("\n");
  return `━━━ REFERENCE DOCS (open with the read_doc tool) ━━━\n${lines}`;
}

// ─── internals ────────────────────────────────────────────────────────────

function metaOf(name: string): DocMeta {
  const full = path.join(DOCS_DIR, name);
  const stat = statSync(full);
  return {
    name,
    size: stat.size,
    modifiedAt: stat.mtime.toISOString().slice(0, 19).replace("T", " "),
    title: titleOf(full, name),
  };
}

function titleOf(fullPath: string, fallback: string): string {
  try {
    const firstLine = readFileSync(fullPath, "utf-8")
      .split("\n")
      .map((line) => line.replace(/^#+\s*/, "").trim())
      .find((line) => line !== "");
    if (!firstLine) return fallback;
    return firstLine.length > 80 ? `${firstLine.slice(0, 79)}…` : firstLine;
  } catch {
    return fallback;
  }
}

function isExists(err: unknown): boolean {
  return (err as NodeJS.ErrnoException | null)?.code === "EEXIST";
}
