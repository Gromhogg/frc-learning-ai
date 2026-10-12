import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../lib/api";
import { buttonClass } from "../lib/button-styles";
import { deleteDoc, fetchDoc, listDocs, uploadDoc, type DocMeta } from "../lib/docs-api";
import { timeAgo } from "../lib/prompt-api";
import DocConflict from "./doc-conflict";

const ALLOWED_NAME = /\.(txt|md)$/i;

interface Conflict {
  file: File;
  existing: DocMeta;
}

/**
 * The AI's reference library, managed by teachers. The AI sees the list of
 * these files in every chat and opens one with its read_doc tool when a
 * question needs the details — so the docs shape what it knows without
 * costing tokens on every message the way the prompt itself does.
 */
export default function DocsPanel() {
  const [docs, setDocs] = useState<DocMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [preview, setPreview] = useState<(DocMeta & { content: string }) | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    try {
      const data = await listDocs();
      setDocs(data.docs);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not load the docs.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function handleFiles(files: File[]) {
    if (files.length === 0) return;
    setStatus(null);

    const skipped = files.filter((f) => !ALLOWED_NAME.test(f.name));
    if (skipped.length > 0) {
      setStatus(`Only .txt and .md files go in the library — skipped ${skipped.map((f) => f.name).join(", ")}.`);
    }

    const accepted = files.filter((f) => ALLOWED_NAME.test(f.name));
    if (accepted.length === 0) return;

    setUploading(true);
    const found: Conflict[] = [];
    for (const file of accepted) {
      try {
        await uploadDoc(file);
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          const body = err.body as { existing?: DocMeta } | null;
          if (body?.existing) {
            found.push({ file, existing: body.existing });
            continue;
          }
        }
        setStatus(err instanceof Error ? err.message : "Couldn't upload that file.");
      }
    }
    setUploading(false);
    if (found.length > 0) setConflicts((prev) => [...prev, ...found]);
    await reload();
  }

  /** Settle the first queued conflict; no mode means skip it. */
  async function resolveConflict(mode?: "replace" | "keep-both") {
    const head = conflicts[0];
    if (!head) return;

    if (!mode) {
      setConflicts((prev) => prev.slice(1));
      return;
    }

    setBusy(true);
    try {
      await uploadDoc(head.file, mode);
      setConflicts((prev) => prev.slice(1));
      await reload();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Couldn't save that file.");
    } finally {
      setBusy(false);
    }
  }

  async function removeDoc(name: string) {
    if (!window.confirm(`Delete ${name}? It moves to the server's trash folder — it isn't destroyed.`)) {
      return;
    }
    try {
      await deleteDoc(name);
      setDocs((prev) => prev.filter((d) => d.name !== name));
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Couldn't delete that doc.");
    }
  }

  async function openPreview(name: string) {
    try {
      setPreview(await fetchDoc(name));
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Couldn't open that doc.");
    }
  }

  return (
    <section className="mt-10">
      <h2 className="text-lg font-bold text-[var(--text-h)]">Reference docs</h2>
      <p className="text-sm text-[var(--text)] mt-1.5 leading-relaxed">
        The AI sees this list of files in every chat and opens one when a question needs the
        details inside — machine guides, game-manual notes, team procedures. Drop in .txt or .md
        files to change what it can look up. Replaced and deleted docs are kept in a trash folder
        on the server, never destroyed.
      </p>

      {status && (
        <p className="mt-4 text-sm text-[var(--accent)] bg-[var(--accent-bg)] border border-[var(--accent-border)] rounded-lg px-4 py-2.5">
          {status}
        </p>
      )}

      {conflicts[0] && (
        <DocConflict
          incoming={conflicts[0].file}
          existing={conflicts[0].existing}
          busy={busy}
          onReplace={() => void resolveConflict("replace")}
          onKeepBoth={() => void resolveConflict("keep-both")}
          onSkip={() => void resolveConflict()}
        />
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".txt,.md,text/plain,text/markdown"
        multiple
        onChange={(e) => {
          const chosen = Array.from(e.target.files ?? []);
          e.target.value = ""; // let the same file be picked again later
          void handleFiles(chosen);
        }}
        className="hidden"
      />

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void handleFiles(Array.from(e.dataTransfer.files));
        }}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
        }}
        className={[
          "mt-4 rounded-xl border-2 border-dashed px-4 py-6 text-center cursor-pointer",
          "transition-[border-color,background-color,scale] duration-150 active:scale-[0.99]",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
          dragging
            ? "border-[var(--accent)] bg-[var(--accent-bg)]"
            : "border-[var(--border)] hover:border-[var(--accent-border)]",
        ].join(" ")}
      >
        <p className="text-sm font-medium text-[var(--text-h)]">
          {uploading ? "Uploading…" : "Drag files here, or click to choose"}
        </p>
        <p className="text-xs text-[var(--text)] mt-1">.txt and .md, up to 100 KB each</p>
      </div>

      {loading ? (
        <p className="mt-5 text-sm text-[var(--text)]">Loading…</p>
      ) : docs.length === 0 ? (
        <p className="mt-5 text-sm text-[var(--text)] bg-[var(--card-bg)] border border-[var(--border)] rounded-xl px-4 py-5 text-center">
          No docs yet. The AI only knows what's in its instructions until you add some.
        </p>
      ) : (
        <ul className="mt-5 space-y-2">
          {docs.map((doc) => (
            <li
              key={doc.name}
              className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--card-bg)] px-4 py-3"
            >
              <button
                onClick={() => void openPreview(doc.name)}
                className="flex-1 min-w-0 text-left group"
              >
                <p className="text-sm font-mono text-[var(--text-h)] truncate group-hover:text-[var(--accent)] transition-colors">
                  {doc.name}
                </p>
                <p className="text-xs text-[var(--text)] mt-0.5 truncate">
                  {doc.title} · {(doc.size / 1024).toFixed(1)} KB · updated {timeAgo(doc.modifiedAt)}
                </p>
              </button>
              <button
                onClick={() => void removeDoc(doc.name)}
                aria-label={`Delete ${doc.name}`}
                className={buttonClass("danger", "xs", "flex-shrink-0")}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}

      {preview && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setPreview(null)}
        >
          <div
            className="w-full max-w-2xl max-h-[80vh] rounded-xl border border-[var(--border)] bg-[var(--card-bg)] overflow-hidden flex flex-col shadow-2xl animate-pop-in"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
              <div className="min-w-0">
                <p className="text-sm font-mono font-semibold text-[var(--text-h)] truncate">
                  {preview.name}
                </p>
                <p className="text-xs text-[var(--text)]">
                  {(preview.size / 1024).toFixed(1)} KB · updated {timeAgo(preview.modifiedAt)}
                </p>
              </div>
              <button
                onClick={() => setPreview(null)}
                aria-label="Close preview"
                className={buttonClass("ghost", "icon-sm", "flex-shrink-0")}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" width="16" height="16">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </header>
            <pre className="px-4 py-3 overflow-auto text-xs leading-relaxed text-[var(--text-h)] font-mono whitespace-pre-wrap break-words">
              {preview.content}
            </pre>
          </div>
        </div>
      )}
    </section>
  );
}
