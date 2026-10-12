import { api } from "./api";

/** One file in the AI's reference library. */
export interface DocMeta {
  name: string;
  size: number;
  modifiedAt: string;
  title: string;
}

export function listDocs() {
  return api<{ docs: DocMeta[] }>("/api/docs");
}

export function fetchDoc(name: string) {
  return api<DocMeta & { content: string }>(`/api/docs/${encodeURIComponent(name)}`);
}

/**
 * Upload one doc. With no mode, a name collision comes back as a 409
 * ApiError whose body carries the existing doc's details — the caller shows
 * the conflict and retries with "replace" or "keep-both" once a person has
 * decided. Never overwrites on its own.
 */
export function uploadDoc(file: File, mode?: "replace" | "keep-both") {
  const form = new FormData();
  form.append("file", file);
  const query = mode ? `?mode=${mode}` : "";
  return api<{ ok: true; doc: DocMeta }>(`/api/docs${query}`, {
    method: "POST",
    body: form,
  });
}

/** Moves the doc to the server's trash folder — recoverable, not destroyed. */
export function deleteDoc(name: string) {
  return api<{ ok: true }>(`/api/docs/${encodeURIComponent(name)}`, { method: "DELETE" });
}
