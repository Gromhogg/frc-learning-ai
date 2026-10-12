import { buttonClass } from "../lib/button-styles";
import { timeAgo } from "../lib/prompt-api";
import type { DocMeta } from "../lib/docs-api";

interface Props {
  /** The file being uploaded. */
  incoming: File;
  /** The doc already in the library under the same name. */
  existing: DocMeta;
  busy: boolean;
  onReplace: () => void;
  onKeepBoth: () => void;
  onSkip: () => void;
}

function kb(size: number): string {
  return `${(size / 1024).toFixed(1)} KB`;
}

/**
 * Shown when an uploaded doc's name is already taken. The upload never
 * overwrites on its own — a person picks what happens, and even "Replace"
 * moves the old file to the server's trash folder rather than destroying it.
 */
export default function DocConflict({ incoming, existing, busy, onReplace, onKeepBoth, onSkip }: Props) {
  return (
    <section className="mt-4 rounded-xl border-2 border-amber-500/40 bg-amber-500/5 overflow-hidden animate-rise-in">
      <header className="px-4 py-3 border-b border-amber-500/20">
        <h3 className="text-sm font-bold text-[var(--text-h)]">
          A doc named "{existing.name}" already exists
        </h3>
        <p className="text-xs text-[var(--text)] mt-1 leading-relaxed">
          In the library: {existing.title} · {kb(existing.size)} · updated {timeAgo(existing.modifiedAt)}.
          Your file: {kb(incoming.size)}. Nothing is overwritten until you choose.
        </p>
      </header>

      <div className="flex flex-wrap gap-2 px-4 py-3">
        <button onClick={onReplace} disabled={busy} className={buttonClass("primary", "sm")}>
          {busy ? "Working…" : "Replace (old file goes to trash)"}
        </button>
        <button onClick={onKeepBoth} disabled={busy} className={buttonClass("outline", "sm")}>
          Keep both
        </button>
        <button onClick={onSkip} disabled={busy} className={buttonClass("ghost", "sm")}>
          Skip this file
        </button>
      </div>
    </section>
  );
}
