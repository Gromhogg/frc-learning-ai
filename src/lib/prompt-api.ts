import { api } from "./api";

/** The instructions as they stand right now, plus who last touched them. */
export interface LivePrompt {
  prompt: string;
  version: number;
  authorName: string;
  updatedAt: string | null;
  note: string | null;
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

export interface TeamFact {
  id: number;
  text: string;
  mentionCount: number;
}

export function fetchLive() {
  return api<LivePrompt & { facts: TeamFact[] }>("/api/prompt");
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

export function savePrompt(prompt: string, baseVersion: number, note?: string) {
  return api<LivePrompt & { ok: true }>("/api/prompt", {
    method: "PUT",
    body: JSON.stringify({ prompt, baseVersion, note }),
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
