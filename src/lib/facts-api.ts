import { api } from "./api";

// Auto-learned team facts and their review queue. Extracted facts wait as
// "pending" until a teacher approves them into the AI's instructions.

export interface FactRow {
  id: number;
  text: string;
  status: "pending" | "approved";
  mentionCount: number;
  createdAt: string | null;
  /** Which student's chat surfaced this — null for facts learned before review existed. */
  sourceUserName: string | null;
}

export interface FactsData {
  pending: FactRow[];
  approved: FactRow[];
  approvedCap: number;
}

export function fetchFacts() {
  return api<FactsData>("/api/facts");
}

/** Approve into the prompt — optionally with corrected wording in one step. */
export function approveFact(id: number, text?: string) {
  return api<{ ok: true }>(`/api/facts/${id}/approve`, {
    method: "POST",
    body: JSON.stringify(text ? { text } : {}),
  });
}

export function rejectFact(id: number) {
  return api<{ ok: true }>(`/api/facts/${id}/reject`, { method: "POST" });
}

export function editFact(id: number, text: string) {
  return api<{ ok: true }>(`/api/facts/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ text }),
  });
}

/** Remove an approved fact from the prompt. It won't be suggested again. */
export function removeFact(id: number) {
  return api<{ ok: true }>(`/api/facts/${id}`, { method: "DELETE" });
}
