import { useMemo } from "react";
import { diffLines, diffStat } from "../lib/diff";
import { timeAgo, type LivePrompt } from "../lib/prompt-api";

interface Props {
  /** What's live on the server now — someone else's save. */
  theirs: LivePrompt;
  /** What's in this editor, unsaved. */
  mine: string;
  busy: boolean;
  onKeepMine: () => void;
  onTakeTheirs: () => void;
  onDismiss: () => void;
}

/**
 * Shown when a save is refused because someone else saved first.
 *
 * The point is that neither version is thrown away without somebody looking at
 * it — before this existed, the second save just overwrote the first.
 */
export default function PromptConflict({
  theirs,
  mine,
  busy,
  onKeepMine,
  onTakeTheirs,
  onDismiss,
}: Props) {
  const stat = useMemo(() => diffStat(diffLines(theirs.prompt, mine)), [theirs.prompt, mine]);
  const identical = theirs.prompt === mine;

  return (
    <section className="mb-6 rounded-xl border-2 border-amber-500/40 bg-amber-500/5 overflow-hidden">
      <header className="flex items-start justify-between gap-3 px-4 py-3 border-b border-amber-500/20">
        <div>
          <h2 className="text-sm font-bold text-[var(--text-h)]">
            {theirs.authorName} saved v{theirs.version} {timeAgo(theirs.updatedAt)}
          </h2>
          <p className="text-xs text-[var(--text)] mt-1 leading-relaxed">
            {identical ? (
              <>Their version matches yours exactly — nothing of yours would be lost.</>
            ) : (
              <>
                Your edits weren't saved. Compared to theirs, yours adds {stat.added} and removes{" "}
                {stat.removed} {stat.removed === 1 ? "line" : "lines"}. Pick one, or copy anything
                you need out of theirs first.
              </>
            )}
          </p>
          {theirs.note && (
            <p className="text-xs text-[var(--text)] mt-1 italic">"{theirs.note}"</p>
          )}
        </div>
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className="px-2 py-0.5 -mr-1 rounded-lg text-sm text-[var(--text)] hover:text-[var(--text-h)] hover:bg-[var(--code-bg)] transition-colors flex-shrink-0"
        >
          ✕
        </button>
      </header>

      <div className="grid md:grid-cols-2 gap-px bg-[var(--border)]">
        <Pane title={`Theirs — v${theirs.version}, now live`} body={theirs.prompt} />
        <Pane title="Yours — unsaved" body={mine} />
      </div>

      <div className="flex flex-wrap gap-2 px-4 py-3 border-t border-amber-500/20">
        <button
          onClick={onKeepMine}
          disabled={busy}
          className="px-4 py-1.5 rounded-lg text-sm font-semibold bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
        >
          {busy ? "Saving…" : `Keep mine (saves as v${theirs.version + 1})`}
        </button>
        <button
          onClick={onTakeTheirs}
          disabled={busy}
          className="px-4 py-1.5 rounded-lg text-sm font-medium border border-[var(--border)] text-[var(--text-h)] hover:bg-[var(--code-bg)] disabled:opacity-40 transition-colors"
        >
          Discard mine, use theirs
        </button>
      </div>
    </section>
  );
}

function Pane({ title, body }: { title: string; body: string }) {
  return (
    <div className="bg-[var(--card-bg)] min-w-0">
      <p className="px-4 pt-3 pb-2 text-xs font-semibold text-[var(--text)] uppercase tracking-wide">
        {title}
      </p>
      <pre className="px-4 pb-3 max-h-64 overflow-auto text-xs leading-relaxed text-[var(--text-h)] font-mono whitespace-pre-wrap break-words">
        {body}
      </pre>
    </div>
  );
}
