// ONE-TIME DATA MOVE, step 2 of 2: copy the old app's files into Cloudflare
// R2 (the app's file storage).
//
//   npx tsx scripts/upload-files.ts --remote     (the real app)
//   npx tsx scripts/upload-files.ts --local      (the copy on your computer)
//
// What goes where:
//   data/docs/<name>.md or .txt    →  docs/<name>          (reference docs)
//   data/docs/.trash/<name>        →  docs-trash/<name>    (deleted docs)
//   data/uploads/<name>            →  uploads/<name>       (chat pictures)
//
// Options: --data <folder> reads from another folder instead of data/;
// --persist-to <folder> picks where the --local copy is kept.
//
// Safe to run again: each file replaces the one with the same name.
// Uses `npx wrangler r2 object put` for each file, so for --remote you must
// be signed in first (`npx wrangler login`).

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const BUCKET = "chatbot972-files";

const CONTENT_TYPES: Record<string, string> = {
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".heic": "image/heic",
};

// ── Read the options ────────────────────────────────────────────────────────

const args = process.argv.slice(2);

function optionValue(name: string): string | undefined {
  const at = args.indexOf(name);
  if (at < 0) return undefined;
  const value = args[at + 1];
  if (!value || value.startsWith("--")) {
    console.error(`Put a folder after ${name}.`);
    process.exit(1);
  }
  return value;
}

const remote = args.includes("--remote");
if (remote && args.includes("--local")) {
  console.error("Pick one: --local or --remote.");
  process.exit(1);
}
const dataDir = optionValue("--data") ?? "data";
const persistTo = optionValue("--persist-to");
if (remote && persistTo) {
  console.error("--persist-to only works with --local.");
  process.exit(1);
}

const where = remote ? ["--remote"] : ["--local", ...(persistTo ? ["--persist-to", persistTo] : [])];

// ── Make the list of files ──────────────────────────────────────────────────

type Upload = { file: string; key: string };

/** Plain files in a folder (no sub-folders, no hidden files like .DS_Store). */
function filesIn(folder: string): string[] {
  if (!existsSync(folder)) return [];
  return readdirSync(folder)
    .filter((name) => !name.startsWith(".") && statSync(path.join(folder, name)).isFile())
    .sort();
}

const docsDir = path.join(dataDir, "docs");
const uploads: Upload[] = [
  ...filesIn(docsDir)
    .filter((name) => /\.(md|txt)$/i.test(name))
    .map((name) => ({ file: path.join(docsDir, name), key: `docs/${name}` })),
  ...filesIn(path.join(docsDir, ".trash")).map((name) => ({
    file: path.join(docsDir, ".trash", name),
    key: `docs-trash/${name}`,
  })),
  ...filesIn(path.join(dataDir, "uploads")).map((name) => ({
    file: path.join(dataDir, "uploads", name),
    key: `uploads/${name}`,
  })),
];

if (uploads.length === 0) {
  console.log(`No files found in ${docsDir}, ${docsDir}/.trash or ${dataDir}/uploads. Nothing to do.`);
  process.exit(0);
}

// ── Upload them, one at a time ──────────────────────────────────────────────

console.log(`Uploading ${uploads.length} file(s) to ${remote ? "the real app" : "the copy on this computer"}...\n`);

let failed = 0;
for (const { file, key } of uploads) {
  const contentType = CONTENT_TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream";
  try {
    execFileSync(
      "npx",
      ["wrangler", "r2", "object", "put", `${BUCKET}/${key}`, "--file", file, "--content-type", contentType, ...where],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    console.log(`  ✓ ${key}`);
  } catch (err) {
    failed++;
    const stderr = (err as { stderr?: Buffer }).stderr?.toString().trim();
    console.log(`  ✗ ${key}${stderr ? `\n      ${stderr.split("\n").slice(-3).join("\n      ")}` : ""}`);
  }
}

if (failed > 0) {
  console.log(`\n${failed} file(s) didn't upload. Fix the problem above and run this again.`);
  process.exit(1);
}
console.log("\nDone. All files uploaded.");
