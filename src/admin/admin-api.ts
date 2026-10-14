import { api } from "../lib/api";

// Types and calls for the admin pages. Every endpoint here is admin-only on
// the server.

export interface PromptSection {
  id: string;
  title: string;
  body: string;
  enabled: boolean;
}

export interface LivePrompt {
  prompt: string;
  sections: PromptSection[];
  version: number;
  authorName: string;
  updatedAt: string | null;
  note: string | null;
}

export interface VersionMeta {
  version: number;
  authorName: string;
  note: string | null;
  createdAt: string | null;
  size: number;
}

export interface Draft {
  id: number;
  source: "admin_chat" | "review";
  baseVersion: number;
  sections: PromptSection[];
  baseSections: PromptSection[];
  title: string;
  reason: string;
  evidence: number[];
  status: "pending" | "applied" | "dismissed";
  createdByName: string | null;
  agentChatId: number | null;
  appliedVersion: number | null;
  createdAt: string | null;
  stale: boolean;
}

export interface Fact {
  id: number;
  text: string;
  status: "pending" | "approved" | "rejected";
  mentionCount: number;
  /** Goes up on every change; edits and approvals send back the one they saw. */
  version: number;
  createdAt: string | null;
  sourceUserName: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
}

/** A fact as it is now — what a 409 sends back when someone else changed it. */
export interface FactSnapshot {
  id: number;
  text: string;
  version: number;
  status: Fact["status"];
}

export interface FactsData {
  pending: Fact[];
  approved: Fact[];
  /** Rejected or removed facts, most recent first. */
  removed: Fact[];
  approvedCap: number;
}

export interface Doc {
  name: string;
  size: number;
  modifiedAt: string;
  title: string;
}

export interface TrashedDoc {
  trashName: string;
  name: string;
  deletedAt: string;
  size: number;
  title: string;
  /** A doc with this name exists now, so restoring keeps both. */
  nameTaken: boolean;
}

export type AgentRole = "tutor" | "editor" | "learn";

export interface ModelChoice {
  id: string;
  label: string;
  price: string;
  tier: string;
}

export interface ModelSettings {
  choices: ModelChoice[];
  models: Record<AgentRole, string>;
}

export interface AdminEvent {
  id: number;
  actorId: number | null;
  actorName: string;
  action: string;
  target: string | null;
  summary: string;
  createdAt: string | null;
}

export interface ReviewOutcome {
  at: string;
  chatCount: number;
  draftIds: number[];
  summary: string;
}

export interface ReviewProgress {
  step: "reading" | "suggesting";
  done: number;
  total: number;
}

export interface ReviewStatus {
  running: boolean;
  progress: ReviewProgress | null;
  last: ReviewOutcome | null;
}

export const adminApi = {
  prompt: () => api<LivePrompt>("/api/admin/prompt"),
  preview: () => api<{ text: string }>("/api/admin/prompt/preview"),
  savePrompt: (sections: PromptSection[], baseVersion: number, note?: string) =>
    api<LivePrompt & { ok: true }>("/api/admin/prompt", {
      method: "PUT",
      body: JSON.stringify({ sections, baseVersion, note }),
    }),
  history: () => api<{ versions: VersionMeta[] }>("/api/admin/prompt/history"),
  version: (v: number) => api<LivePrompt>(`/api/admin/prompt/history/${v}`),
  rollback: (version: number) =>
    api<LivePrompt>("/api/admin/prompt/rollback", { method: "POST", body: JSON.stringify({ version }) }),

  drafts: (status?: Draft["status"]) =>
    api<{ drafts: Draft[] }>(`/api/admin/drafts${status ? `?status=${status}` : ""}`),
  draft: (id: number) => api<Draft>(`/api/admin/drafts/${id}`),
  applyDraft: (id: number, onTopOfLatest = false) =>
    api<{ ok: true; version: number }>(`/api/admin/drafts/${id}/apply`, {
      method: "POST",
      body: JSON.stringify({ onTopOfLatest }),
    }),
  dismissDraft: (id: number) => api(`/api/admin/drafts/${id}/dismiss`, { method: "POST" }),

  review: () => api<ReviewStatus>("/api/admin/review"),
  runReview: () => api<ReviewOutcome>("/api/admin/review", { method: "POST" }),

  facts: () => api<FactsData>("/api/admin/facts"),
  approveFact: (id: number, expectedVersion: number, text?: string) =>
    api(`/api/admin/facts/${id}/approve`, { method: "POST", body: JSON.stringify({ text, expectedVersion }) }),
  rejectFact: (id: number) => api(`/api/admin/facts/${id}/reject`, { method: "POST" }),
  editFact: (id: number, text: string, expectedVersion: number) =>
    api(`/api/admin/facts/${id}`, { method: "PATCH", body: JSON.stringify({ text, expectedVersion }) }),
  removeFact: (id: number) => api(`/api/admin/facts/${id}`, { method: "DELETE" }),
  restoreFact: (id: number) => api(`/api/admin/facts/${id}/restore`, { method: "POST" }),

  docs: () => api<{ docs: Doc[] }>("/api/admin/docs"),
  doc: (name: string) => api<Doc & { content: string }>(`/api/admin/docs/${encodeURIComponent(name)}`),
  uploadDoc: (file: File, mode?: "replace" | "keep-both") => {
    const form = new FormData();
    form.append("file", file);
    return api<{ ok: true; doc: Doc }>(`/api/admin/docs${mode ? `?mode=${mode}` : ""}`, { method: "POST", body: form });
  },
  deleteDoc: (name: string) => api(`/api/admin/docs/${encodeURIComponent(name)}`, { method: "DELETE" }),
  docsTrash: () => api<{ trash: TrashedDoc[] }>("/api/admin/docs/trash"),
  restoreDoc: (trashName: string) =>
    api<{ ok: true; doc: Doc; renamed: boolean }>(`/api/admin/docs/trash/${encodeURIComponent(trashName)}/restore`, {
      method: "POST",
    }),

  settings: () => api<ModelSettings>("/api/admin/settings"),
  setModel: (role: AgentRole, model: string, expected: string) =>
    api<{ ok: true; models: Record<AgentRole, string> }>("/api/admin/settings/models", {
      method: "PUT",
      body: JSON.stringify({ role, model, expected }),
    }),

  events: () => api<{ events: AdminEvent[] }>("/api/admin/events"),
};
