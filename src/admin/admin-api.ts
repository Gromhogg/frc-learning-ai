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
  status: "pending" | "approved";
  mentionCount: number;
  createdAt: string | null;
  sourceUserName: string | null;
}

export interface Doc {
  name: string;
  size: number;
  modifiedAt: string;
  title: string;
}

export interface ReviewOutcome {
  at: string;
  chatCount: number;
  draftIds: number[];
  summary: string;
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

  review: () => api<{ running: boolean; last: ReviewOutcome | null }>("/api/admin/review"),
  runReview: () => api<ReviewOutcome>("/api/admin/review", { method: "POST" }),

  facts: () => api<{ pending: Fact[]; approved: Fact[]; approvedCap: number }>("/api/admin/facts"),
  approveFact: (id: number, text?: string) =>
    api(`/api/admin/facts/${id}/approve`, { method: "POST", body: JSON.stringify({ text }) }),
  rejectFact: (id: number) => api(`/api/admin/facts/${id}/reject`, { method: "POST" }),
  editFact: (id: number, text: string) =>
    api(`/api/admin/facts/${id}`, { method: "PATCH", body: JSON.stringify({ text }) }),
  removeFact: (id: number) => api(`/api/admin/facts/${id}`, { method: "DELETE" }),

  docs: () => api<{ docs: Doc[] }>("/api/admin/docs"),
  doc: (name: string) => api<Doc & { content: string }>(`/api/admin/docs/${encodeURIComponent(name)}`),
  uploadDoc: (file: File, mode?: "replace" | "keep-both") => {
    const form = new FormData();
    form.append("file", file);
    return api<{ ok: true; doc: Doc }>(`/api/admin/docs${mode ? `?mode=${mode}` : ""}`, { method: "POST", body: form });
  },
  deleteDoc: (name: string) => api(`/api/admin/docs/${encodeURIComponent(name)}`, { method: "DELETE" }),
};
