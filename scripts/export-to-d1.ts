// ONE-TIME DATA MOVE, step 1 of 2: copy the old app's database (data/app.db,
// from before the move to Cloudflare) into a file of SQL commands that the
// new Cloudflare database (D1) can load.
//
//   npx tsx scripts/export-to-d1.ts [path-to-app.db]      (default: data/app.db)
//
// It writes data/d1-import.sql (or the file given with --out <file>). Load
// that into the real database with:
//
//   npx wrangler d1 execute chatbot972 --remote --file data/d1-import.sql
//
// (Use --local instead of --remote to load it into the copy on your computer.)
// Run `npm run db:migrate:remote` (or :local) first so the tables exist, and
// load the data BEFORE the app is first opened.
//
// Safe to run again: each row replaces the row with the same id.
//
// How it works: it reads the old file with the `sqlite3` program that comes
// with macOS. The old file is copied to a temporary folder first and only the
// copy is opened, so the original is never changed. The output holds
// password hashes — data/ is never committed to git, so keep it there.

import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Tables that are not copied: sqlite's and drizzle's own bookkeeping (the new
// database keeps its own), and half-finished signups (their codes expire in
// 10 minutes anyway).
const SKIP_TABLES = new Set(["__drizzle_migrations", "sqlite_sequence", "email_codes", "d1_migrations"]);

// D1 refuses a single command longer than this.
const MAX_STATEMENT_BYTES = 100_000;

function fail(message: string): never {
  console.error(`\n${message}\n`);
  process.exit(1);
}

// ── Find and copy the old database ──────────────────────────────────────────

const args = process.argv.slice(2);
const outAt = args.indexOf("--out");
const OUT_FILE = outAt >= 0 ? args[outAt + 1] : "data/d1-import.sql";
if (!OUT_FILE) fail("Put a file name after --out.");
const source = args.find((a, i) => !a.startsWith("--") && i !== outAt + 1) ?? "data/app.db";
if (!existsSync(source)) {
  fail(`Can't find the old database at "${source}". Pass its path, like:\n  npx tsx scripts/export-to-d1.ts path/to/app.db`);
}

try {
  execFileSync("sqlite3", ["-version"], { stdio: "ignore" });
} catch {
  fail("This needs the `sqlite3` program (it comes with macOS). Type `sqlite3 -version` to check it's there.");
}

// Copy the database and its -wal helper file (it holds recent changes that
// may not be in the main file yet).
const tempDir = mkdtempSync(path.join(tmpdir(), "chatbot972-export-"));
const copy = path.join(tempDir, "app.db");
for (const suffix of ["", "-wal"]) {
  if (existsSync(source + suffix)) copyFileSync(source + suffix, copy + suffix);
}

/** Run one query on the copy and return its rows. */
function query<T>(sql: string): T[] {
  const out = execFileSync("sqlite3", ["-json", copy, sql], { maxBuffer: 1024 * 1024 * 1024 }).toString().trim();
  return out ? (JSON.parse(out) as T[]) : [];
}

/** Put "double quotes" around a table or column name. */
function quoteName(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

// ── Work out what to copy, and in what order ────────────────────────────────

type TableInfo = { name: string; columns: string[]; rows: number; parents: string[] };

const tables: TableInfo[] = [];
for (const { name } of query<{ name: string }>(
  "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
)) {
  if (SKIP_TABLES.has(name) || name.startsWith("sqlite_") || name.startsWith("_cf_")) continue;
  const [{ n }] = query<{ n: number }>(`SELECT count(*) AS n FROM ${quoteName(name)}`);
  if (n === 0) continue;
  const columns = query<{ name: string }>(`PRAGMA table_info(${quoteName(name)})`).map((c) => c.name);
  const parents = query<{ table: string }>(`PRAGMA foreign_key_list(${quoteName(name)})`)
    .map((fk) => fk.table)
    .filter((parent) => parent !== name);
  tables.push({ name, columns, rows: n, parents: [...new Set(parents)] });
}

// A table that points at another (messages → conversations → users) must be
// loaded after it, or the database refuses the rows.
const ordered: TableInfo[] = [];
const placed = new Set<string>();
const copying = new Set(tables.map((t) => t.name));
while (ordered.length < tables.length) {
  const ready = tables.filter(
    (t) => !placed.has(t.name) && t.parents.every((p) => placed.has(p) || !copying.has(p)),
  );
  // Tables that point at each other in a loop: just add the rest. The
  // "defer_foreign_keys" line at the top of the file covers this case.
  const next = ready.length > 0 ? ready : tables.filter((t) => !placed.has(t.name));
  for (const t of next) {
    ordered.push(t);
    placed.add(t.name);
  }
}

// ── Write the SQL file ──────────────────────────────────────────────────────

const lines: string[] = [
  `-- 972 Chat Bot: data copied from ${path.basename(source)} on ${new Date().toISOString()}.`,
  `-- Load with: npx wrangler d1 execute chatbot972 --remote --file ${OUT_FILE}`,
  "-- Holds password hashes. Don't share it or commit it.",
  "",
  "-- Check links between tables only at the end, not row by row.",
  "PRAGMA defer_foreign_keys = true;",
  "",
];

let tooLong = 0;
for (const table of ordered) {
  const columnList = table.columns.map(quoteName).join(", ");
  // sqlite's own quote() turns each value into a safe SQL value: text gets
  // single quotes (with ' doubled), empty values become NULL, numbers stay
  // numbers, and binary data becomes X'..'.
  const selectList = table.columns.map((c) => `quote(${quoteName(c)}) AS ${quoteName(c)}`).join(", ");
  let rows: Record<string, string>[];
  try {
    rows = query(`SELECT ${selectList} FROM ${quoteName(table.name)} ORDER BY rowid`);
  } catch {
    rows = query(`SELECT ${selectList} FROM ${quoteName(table.name)}`); // tables without a rowid
  }

  lines.push(`-- ${table.name} (${rows.length} row${rows.length === 1 ? "" : "s"})`);
  for (const row of rows) {
    const values = table.columns.map((c) => row[c] ?? "NULL").join(", ");
    const statement = `INSERT OR REPLACE INTO ${quoteName(table.name)} (${columnList}) VALUES (${values});`;
    if (Buffer.byteLength(statement) > MAX_STATEMENT_BYTES) tooLong++;
    lines.push(statement);
  }
  lines.push("");
}

writeFileSync(OUT_FILE, lines.join("\n"));
rmSync(tempDir, { recursive: true, force: true });

// ── Report ──────────────────────────────────────────────────────────────────

console.log(`\nWrote ${OUT_FILE}:`);
for (const t of ordered) console.log(`  ${t.name.padEnd(20)} ${t.rows} row${t.rows === 1 ? "" : "s"}`);
if (tooLong > 0) {
  console.log(
    `\nWarning: ${tooLong} row(s) are bigger than 100 KB, which D1 may refuse. If loading fails, ` +
      "ask for help splitting them.",
  );
}
console.log("\nNext, load it into the real database:");
console.log(`  npx wrangler d1 execute chatbot972 --remote --file ${OUT_FILE}\n`);
