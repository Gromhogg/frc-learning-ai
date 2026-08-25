import { useEffect, useMemo, useState } from "react";
import { diffLines, diffStat } from "../lib/diff";
import {
  fetchHistory,
  fetchVersion,
  restoreVersion,
  timeAgo,
  type LivePrompt,
  type VersionMeta,
} from "../lib/prompt-api";

interface Props {
  liveVersion: number;
  onClose: () => void;
  /** Fired after a restore lands, so the editor can pick up the new version. */
  onRestored: (live: LivePrompt) => void;
}

/**
 * Every version of the instructions, with what each edit changed.
 *
 * A version list on its own is a column of timestamps nobody reads — the diff
 * is what makes "who changed the safety rules?" answerable at a glance.
 */
export default function PromptHistory({ liveVersion, onClose, onRestored }: Props) {
  const [versions, setVersions] = useState<VersionMeta[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [pair, setPair] = useState<{ before: string; after: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const { versions } = await fetchHistory();
        setVersions(versions);
        if (versions.length > 0) setSelected(versions[0].version);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load the history.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Load the selected version and the one before it, so the diff shows what
  // that particular edit did rather than how it compares to today.
  useEffect(() => {
    if (selected === null) return;
    let cancelled = false;

    void (async () => {
      setPair(null);
      try {
        const [after, before] = await Promise.all([
          fetchVersion(selected),
          selected > 1 ? fetchVersion(selected - 1) : Promise.resolve(null),
        ]);
        if (!cancelled) setPair({ before: before?.prompt ?? "", after: after.prompt });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load it.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selected]);

  const lines = useMemo(
    () => (pair ? diffLines(pair.before, pair.after) : []),
    [pair],
  );
  const stat = useMemo(() => diffStat(lines), [lines]);

  async function restore(version: number) {
    setBusy(true);
    setError(null);
    try {
      onRestored(await restoreVersion(version));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not restore that version.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={onClose}>
      <aside
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl h-full flex flex-col bg-[var(--bg)] border-l border-[var(--border)] shadow-2xl"
      >
        <header className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border)] bg-[var(--card-bg)]">
          <div>
            <h2 className="text-base font-bold text-[var(--text-h)]">Version history</h2>
            <p className="text-xs text-[var(--text)] mt-0.5">
              Nothing is ever overwritten — restoring adds a new version on top.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close history"
            className="px-2.5 py-1 rounded-lg text-sm text-[var(--text)] hover:text-[var(--text-h)] hover:bg-[var(--code-bg)] transition-colors"
          >
            ✕
          </button>
        </header>

        {error && (
          <p className="mx-5 mt-4 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2.5">
            {error}
          </p>
        )}

        <div className="flex-1 min-h-0 flex">
          <ul className="w-56 flex-shrink-0 overflow-y-auto border-r border-[var(--border)] py-2">
            {loading && <li className="px-4 py-2 text-sm text-[var(--text)]">Loading…</li>}
            {versions.map((v) => (
              <li key={v.version}>
                <button
                  onClick={() => setSelected(v.version)}
                  className={[
                    "w-full text-left px-4 py-2.5 transition-colors",
                    selected === v.version
                      ? "bg-[var(--accent-bg)] border-l-2 border-[var(--accent)]"
                      : "border-l-2 border-transparent hover:bg-[var(--code-bg)]",
                  ].join(" ")}
                >
                  <span className="flex items-baseline gap-1.5">
                    <span className="text-sm font-semibold text-[var(--text-h)]">
                      v{v.version}
                    </span>
                    {v.version === liveVersion && (
                      <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--accent)]">
                        live
                      </span>
                    )}
                  </span>
                  <span className="block text-xs text-[var(--text)] mt-0.5 truncate">
                    {v.authorName}
                  </span>
                  <span className="block text-xs text-[var(--text)] truncate">
                    {timeAgo(v.createdAt)}
                  </span>
                  {v.note && (
                    <span className="block text-xs text-[var(--text)] mt-1 italic truncate">
                      {v.note}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>

          <div className="flex-1 min-w-0 flex flex-col">
            {selected !== null && (
              <div className="flex items-center justify-between gap-3 px-5 py-2.5 border-b border-[var(--border)]">
                <p className="text-xs text-[var(--text)]">
                  {selected === 1 ? (
                    "First version"
                  ) : (
                    <>
                      Changes in v{selected} —{" "}
                      <span className="text-emerald-400">+{stat.added}</span>{" "}
                      <span className="text-red-400">−{stat.removed}</span>
                    </>
                  )}
                </p>
                {selected !== liveVersion && (
                  <button
                    onClick={() => void restore(selected)}
                    disabled={busy}
                    className="px-3 py-1 rounded-lg text-xs font-semibold bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-40 transition-opacity flex-shrink-0"
                  >
                    {busy ? "Restoring…" : `Restore v${selected}`}
                  </button>
                )}
              </div>
            )}

            <div className="flex-1 overflow-auto px-5 py-3">
              {!pair ? (
                <p className="text-sm text-[var(--text)]">Loading…</p>
              ) : (
                <pre className="text-xs leading-relaxed font-mono whitespace-pre-wrap break-words">
                  {lines.map((line, i) => (
                    <div
                      key={i}
                      className={
                        line.type === "add"
                          ? "bg-emerald-500/10 text-emerald-300"
                          : line.type === "remove"
                            ? "bg-red-500/10 text-red-300"
                            : "text-[var(--text)]"
                      }
                    >
                      <span className="select-none opacity-50">
                        {line.type === "add" ? "+ " : line.type === "remove" ? "− " : "  "}
                      </span>
                      {line.text || " "}
                    </div>
                  ))}
                </pre>
              )}
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
