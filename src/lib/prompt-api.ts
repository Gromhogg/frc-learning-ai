import { api } from "./api";

/** One editable piece of the instructions. `title` is a label for teachers;
 * `body` is the verbatim text the AI sees when the section is enabled. */
export interface PromptSection {
  id: string;
  title: string;
  body: string;
  enabled: boolean;
}

/** The instructions as they stand right now, plus who last touched them.
 * `prompt` is the assembled text; `sections` is what the editor edits. */
export interface LivePrompt {
  prompt: string;
  sections: PromptSection[];
  format: "text" | "sections@1";
  version: number;
  authorName: string;
  updatedAt: string | null;
  note: string | null;
}

/**
 * Client mirror of the server's assembly rule: enabled sections' bodies,
 * in order, blank line between. Kept deliberately tiny so the preview and
 * conflict diff can't drift from what the server will actually build.
 */
export function assembleSections(sections: PromptSection[]): string {
  return sections
    .filter((s) => s.enabled)
    .map((s) => s.body)
    .join("\n\n");
}

/** One row in the history list — no text body, so the list stays small. */
export interface VersionMeta {
  version: number;
  authorId: number | null;
  authorName: string;
  note: string | null;
  createdAt: string | null;
  size: number;
}

export function fetchLive() {
  return api<LivePrompt>("/api/prompt");
}

export function fetchHistory() {
  return api<{ versions: VersionMeta[] }>("/api/prompt/history");
}

export function fetchVersion(version: number) {
  return api<LivePrompt>(`/api/prompt/history/${version}`);
}

export function restoreVersion(version: number) {
  return api<LivePrompt & { ok: true }>("/api/prompt/rollback", {
    method: "POST",
    body: JSON.stringify({ version }),
  });
}

export function saveSections(sections: PromptSection[], baseVersion: number, note?: string) {
  return api<LivePrompt & { ok: true }>("/api/prompt", {
    method: "PUT",
    body: JSON.stringify({ sections, baseVersion, note }),
  });
}

/**
 * SQLite writes CURRENT_TIMESTAMP as "YYYY-MM-DD HH:MM:SS" in UTC with no
 * zone marker, which Date() would otherwise read as local time — an hours-off
 * timestamp on every row.
 */
export function parseTimestamp(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(`${value.replace(" ", "T")}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function timeAgo(value: string | null): string {
  const date = parseTimestamp(value);
  if (!date) return "";

  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;

  return date.toLocaleDateString();
}
