import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import path from "node:path";
import { db } from "../../db/index.ts";
import { settings } from "../../db/schema.ts";
import { DEFAULT_DOCS } from "./default-docs.ts";

// The reference docs the AI can open mid-answer. They are files in the R2
// bucket (env.FILES), no database table: "docs/<name>" for the library and
// "docs-trash/<stamp>__<name>" for the trash. The bucket listing is the
// source of truth.
//
// Nothing here is ever destroyed. "Replace" and "delete" copy the old file
// into the trash with a timestamp — the docs-library counterpart of the
// append-only prompt_versions table — and an admin can move it back.
//
// Each doc's title is saved with the file (R2 "custom metadata"), so listing
// the library doesn't have to open every file.

const DOCS_PREFIX = "docs/";
const TRASH_PREFIX = "docs-trash/";

/** Settings row written once the default docs have been added (or an admin changed the library). */
const SEEDED_FLAG = "docs_seeded";

export interface DocMeta {
  name: string;
  size: number;
  /** SQLite-style "YYYY-MM-DD HH:MM:SS" in UTC, same shape the rest of the app's timestamps use. */
  modifiedAt: string;
  /** First non-empty line of the file, markdown #s stripped. */
  title: string;
}

/** A deleted or replaced doc sitting in the trash. */
export interface TrashedDoc {
  /** The file's name inside the trash: "<timestamp>__<name>". */
  trashName: string;
  /** The doc's original name. */
  name: string;
  /** Same "YYYY-MM-DD HH:MM:SS" UTC shape as DocMeta.modifiedAt. */
  deletedAt: string;
  size: number;
  title: string;
  /** True when a doc with the original name exists now (restoring keeps both). */
  nameTaken: boolean;
}

export type WriteDocResult =
  | { status: "ok"; doc: DocMeta }
  /** A doc with this name already exists and no overwrite mode was chosen. */
  | { status: "conflict"; existing: DocMeta };

const ALLOWED_EXTENSIONS = new Set([".txt", ".md"]);

/**
 * Turn whatever filename arrived (from an upload or from the model) into a
 * safe doc name, or null if it can't be one. basename() first so "../" or a
 * folder can never sneak into the file's key.
 */
export function sanitizeDocName(raw: string): string | null {
  const base = path.basename(raw.trim()).replace(/[^A-Za-z0-9._ -]/g, "-");
  if (!base || base.startsWith(".")) return null;
  if (!ALLOWED_EXTENSIONS.has(path.extname(base).toLowerCase())) return null;
  return base;
}

/** Real text only: no NUL bytes, and it must decode as strict UTF-8. */
export function isTextContent(bytes: Uint8Array): boolean {
  if (bytes.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
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
 *
 * Adds the default docs the very first time the library is used.
 */
export async function listDocs(): Promise<DocMeta[]> {
  const docs = await listLibrary();
  if (docs.length === 0 && (await ensureDocsSeeded())) return listLibrary();
  return docs;
}

/** Metadata for one doc, or null if it doesn't exist. */
export async function statDoc(rawName: string): Promise<DocMeta | null> {
  const name = sanitizeDocName(rawName);
  if (!name) return null;
  const obj = await env.FILES.head(DOCS_PREFIX + name);
  return obj ? metaOf(name, obj) : null;
}

export async function readDoc(rawName: string): Promise<{ name: string; content: string } | null> {
  const name = sanitizeDocName(rawName);
  if (!name) return null;
  const obj = await env.FILES.get(DOCS_PREFIX + name);
  if (!obj) return null;
  return { name, content: await obj.text() };
}

/** One doc's metadata and full text in a single read, or null if it doesn't exist. */
export async function readDocWithMeta(rawName: string): Promise<(DocMeta & { content: string }) | null> {
  const name = sanitizeDocName(rawName);
  if (!name) return null;
  const obj = await env.FILES.get(DOCS_PREFIX + name);
  if (!obj) return null;
  const content = await obj.text();
  return { ...(await metaOf(name, obj, content)), content };
}

/**
 * Write one doc. `name` must already be sanitized.
 *
 * - "create":    refuse if the name is taken — the caller decides what to do.
 * - "replace":   copy the old file to the trash, then write. The old bytes
 *                are safe before the new ones land, so a crash loses nothing.
 * - "keep-both": find a free "name-2.md"-style variant and use that.
 *
 * Every write is "only if no file has this name" (an R2 conditional put), so
 * two admins saving the same name at once can't silently overwrite each other.
 */
export async function writeDoc(
  name: string,
  bytes: Uint8Array,
  mode: "create" | "replace" | "keep-both" = "create",
): Promise<WriteDocResult> {
  if (mode === "keep-both") return { status: "ok", doc: await putUnderFreeName(name, bytes) };

  // A few tries only matter when someone else writes or deletes the same
  // name at the same moment.
  for (let tries = 0; tries < 3; tries++) {
    if (mode === "replace") await trashDoc(name);
    const saved = await putNew(name, bytes);
    if (saved) return { status: "ok", doc: saved };
    if (mode === "create") {
      const existing = await statDoc(name);
      if (existing) return { status: "conflict", existing };
    }
  }
  throw new Error(`Couldn't save ${name}: it kept changing while saving.`);
}

/** Move a doc into the trash with a timestamp prefix. False if it wasn't there. */
export async function trashDoc(name: string): Promise<boolean> {
  const obj = await env.FILES.get(DOCS_PREFIX + name);
  if (!obj) return false;

  // R2 has no "rename", so copy into the trash first, then remove.
  const bytes = new Uint8Array(await obj.arrayBuffer());
  await putIntoTrash(name, bytes, obj.customMetadata?.title ?? encodeTitle(titleFromText(decode(bytes), name)));
  await env.FILES.delete(DOCS_PREFIX + name);

  // An admin has changed the library, so never add the default docs again —
  // even if this was the last doc and the library is now empty.
  await markSeeded();
  return true;
}

/**
 * Everything in the trash, newest first. Files that don't look like
 * "<timestamp>__<name>" (someone put them there by hand) are skipped.
 */
export async function listTrash(): Promise<TrashedDoc[]> {
  const [trashed, library] = await Promise.all([listAll(TRASH_PREFIX), listAll(DOCS_PREFIX)]);
  const taken = new Set(library.map((obj) => obj.key.slice(DOCS_PREFIX.length)));

  const out = await Promise.all(
    trashed.map(async (obj): Promise<TrashedDoc | null> => {
      const trashName = obj.key.slice(TRASH_PREFIX.length);
      const parsed = parseTrashName(trashName);
      if (!parsed) return null;
      return {
        trashName,
        name: parsed.name,
        deletedAt: parsed.deletedAt ?? sqliteTime(obj.uploaded),
        size: obj.size,
        title: await titleOf(obj, parsed.name),
        nameTaken: taken.has(parsed.name),
      };
    }),
  );
  return out
    .filter((t): t is TrashedDoc => t !== null)
    .sort((a, b) => b.deletedAt.localeCompare(a.deletedAt) || b.trashName.localeCompare(a.trashName));
}

/**
 * Move a doc from the trash back into the library under its original name,
 * or a free "name-2.md"-style name if that one is taken now. Null if there's
 * no such file in the trash. Never overwrites anything.
 */
export async function restoreFromTrash(
  rawTrashName: string,
): Promise<{ doc: DocMeta; originalName: string } | null> {
  // basename() so "../" or a folder can never reach outside the trash.
  const trashName = path.basename(rawTrashName);
  if (trashName !== rawTrashName) return null;
  const parsed = parseTrashName(trashName);
  if (!parsed) return null;

  const obj = await env.FILES.get(TRASH_PREFIX + trashName);
  if (!obj) return null;

  const doc = await putUnderFreeName(parsed.name, new Uint8Array(await obj.arrayBuffer()));
  await env.FILES.delete(TRASH_PREFIX + trashName);
  return { doc, originalName: parsed.name };
}

/**
 * The listing the AI sees in its system prompt: filenames plus first-line
 * titles, nothing more. The contents only cost tokens when the model actually
 * opens a doc with the read_doc tool. Byte-identical between requests until
 * an admin changes a file — the same cache-friendliness rule as the rest of
 * the prompt (see buildSystemPrompt).
 */
export async function buildDocIndex(): Promise<string> {
  const docs = await listDocs();
  if (docs.length === 0) return "";

  const lines = docs.map((d) => `  - ${d.name} — ${d.title}`).join("\n");
  return `━━━ REFERENCE DOCS (open with the read_doc tool) ━━━\n${lines}`;
}

// ─── internals ────────────────────────────────────────────────────────────

/** Every doc in the library, sorted by name (see listDocs for why). */
async function listLibrary(): Promise<DocMeta[]> {
  const objects = (await listAll(DOCS_PREFIX)).filter((obj) => {
    const name = obj.key.slice(DOCS_PREFIX.length);
    return sanitizeDocName(name) === name;
  });
  const docs = await Promise.all(objects.map((obj) => metaOf(obj.key.slice(DOCS_PREFIX.length), obj)));
  return docs.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** Every file under `prefix`, with its saved title. R2 hands back one page at a time. */
async function listAll(prefix: string): Promise<R2Object[]> {
  const out: R2Object[] = [];
  let cursor: string | undefined;
  do {
    const page = await env.FILES.list({ prefix, cursor, include: ["customMetadata"] });
    out.push(...page.objects);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return out;
}

/**
 * Write the default docs the first time the library is used, then note that
 * in a settings row. A library that is empty AFTER that means an admin
 * deleted everything on purpose, and that choice is respected. Returns true
 * if the defaults were just added.
 */
async function ensureDocsSeeded(): Promise<boolean> {
  const [flag] = await db.select().from(settings).where(eq(settings.key, SEEDED_FLAG));
  if (flag) return false;

  // putNew never overwrites, so two requests seeding at once is harmless.
  const encoder = new TextEncoder();
  await Promise.all(
    Object.entries(DEFAULT_DOCS).map(([name, content]) => putNew(name, encoder.encode(content))),
  );
  await markSeeded();
  console.log(`Docs: added ${Object.keys(DEFAULT_DOCS).length} default docs to an empty library.`);
  return true;
}

async function markSeeded(): Promise<void> {
  await db
    .insert(settings)
    .values({ key: SEEDED_FLAG, value: new Date().toISOString() })
    .onConflictDoNothing();
}

/** Save a doc only if no doc has this name yet. Null if the name is taken. */
async function putNew(name: string, bytes: Uint8Array): Promise<DocMeta | null> {
  const title = titleFromText(decode(bytes), name);
  const obj = await env.FILES.put(DOCS_PREFIX + name, bytes, {
    onlyIf: { etagDoesNotMatch: "*" },
    httpMetadata: { contentType: contentTypeOf(name) },
    customMetadata: { title: encodeTitle(title) },
  });
  if (!obj) return null;
  return { name, size: obj.size, modifiedAt: sqliteTime(obj.uploaded), title };
}

/** Save under `name`, or the first free "name-2.md"-style variant. */
async function putUnderFreeName(name: string, bytes: Uint8Array): Promise<DocMeta> {
  const ext = path.extname(name);
  const stem = name.slice(0, name.length - ext.length);
  for (let n = 1; n <= 500; n++) {
    const saved = await putNew(n === 1 ? name : `${stem}-${n}${ext}`, bytes);
    if (saved) return saved;
  }
  throw new Error(`No free name left for ${name}.`);
}

/** Copy a doc into the trash as "<timestamp>__<name>", never over another trashed file. */
async function putIntoTrash(name: string, bytes: Uint8Array, savedTitle: string): Promise<void> {
  const now = Date.now();
  for (let n = 0; n < 10; n++) {
    // ":" swapped for "-" to keep the name plain (parseTrashName swaps it back).
    const stamp = new Date(now + n).toISOString().replace(/:/g, "-");
    const obj = await env.FILES.put(`${TRASH_PREFIX}${stamp}__${name}`, bytes, {
      onlyIf: { etagDoesNotMatch: "*" },
      httpMetadata: { contentType: contentTypeOf(name) },
      customMetadata: { title: savedTitle },
    });
    if (obj) return;
  }
  throw new Error(`Couldn't move ${name} to the trash.`);
}

/**
 * Split "2026-10-12T14-03-22.123Z__guide.md" into the doc name and when it
 * was trashed. Null unless the name part is a valid doc name.
 */
function parseTrashName(trashName: string): { name: string; deletedAt: string | null } | null {
  const split = trashName.indexOf("__");
  if (split <= 0) return null;
  const name = trashName.slice(split + 2);
  if (sanitizeDocName(name) !== name) return null;

  const stamp = trashName.slice(0, split).replace(/T(\d{2})-(\d{2})-(\d{2})/, "T$1:$2:$3");
  const date = new Date(stamp);
  const deletedAt = Number.isNaN(date.getTime()) ? null : sqliteTime(date);
  return { name, deletedAt };
}

async function metaOf(name: string, obj: R2Object, content?: string): Promise<DocMeta> {
  return {
    name,
    size: obj.size,
    modifiedAt: sqliteTime(obj.uploaded),
    title: content !== undefined ? titleFromText(content, name) : await titleOf(obj, name),
  };
}

/** The saved title, or — for a file put in the bucket by hand without one — read it from the text. */
async function titleOf(obj: R2Object, fallback: string): Promise<string> {
  const saved = obj.customMetadata?.title;
  if (saved !== undefined) return decodeTitle(saved);
  const body = await env.FILES.get(obj.key);
  return body ? titleFromText(await body.text(), fallback) : fallback;
}

/** First non-empty line, markdown #s stripped, at most 80 characters. */
function titleFromText(text: string, fallback: string): string {
  const firstLine = text
    .split("\n")
    .map((line) => line.replace(/^#+\s*/, "").trim())
    .find((line) => line !== "");
  if (!firstLine) return fallback;
  return firstLine.length > 80 ? `${firstLine.slice(0, 79)}…` : firstLine;
}

// Titles are stored URL-encoded so any character is safe in R2 metadata.
function encodeTitle(title: string): string {
  return encodeURIComponent(title);
}

function decodeTitle(saved: string): string {
  try {
    return decodeURIComponent(saved);
  } catch {
    return saved;
  }
}

function decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function contentTypeOf(name: string): string {
  return path.extname(name).toLowerCase() === ".md"
    ? "text/markdown; charset=utf-8"
    : "text/plain; charset=utf-8";
}

function sqliteTime(date: Date): string {
  return date.toISOString().slice(0, 19).replace("T", " ");
}
