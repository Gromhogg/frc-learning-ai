import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import {
  fetchLive,
  savePrompt as putPrompt,
  timeAgo,
  type LivePrompt,
  type TeamFact,
} from "../lib/prompt-api";
import PromptConflict from "../components/prompt-conflict";
import PromptHistory from "../components/prompt-history";

export default function Prompt() {
  const navigate = useNavigate();

  const [prompt, setPrompt] = useState("");
  const [savedPrompt, setSavedPrompt] = useState("");
  /** The version this editor was loaded from — sent on save to catch stale writes. */
  const [live, setLive] = useState<LivePrompt | null>(null);
  const [conflict, setConflict] = useState<LivePrompt | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [facts, setFacts] = useState<TeamFact[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingText, setEditingText] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const data = await fetchLive();
        setPrompt(data.prompt);
        setSavedPrompt(data.prompt);
        setLive(data);
        setFacts(data.facts);
      } catch (err) {
        setStatus(err instanceof Error ? err.message : "Could not load the prompt.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /** Adopt whatever the server says is current, and clear any conflict. */
  function adopt(next: LivePrompt, text = next.prompt) {
    setLive(next);
    setPrompt(text);
    setSavedPrompt(text);
    setConflict(null);
  }

  /**
   * Save against `baseVersion`. A 409 means someone else got there first —
   * we surface both texts rather than clobbering theirs.
   */
  async function savePrompt(baseVersion?: number) {
    const base = baseVersion ?? live?.version;
    if (base === undefined) return;

    setSaving(true);
    setStatus(null);
    try {
      const result = await putPrompt(prompt, base);
      adopt(result, prompt);
      setStatus(`Saved as v${result.version}. New messages will use these instructions.`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const body = err.body as { current?: LivePrompt } | null;
        if (body?.current) {
          setConflict(body.current);
          setStatus(null);
          return;
        }
      }
      setStatus(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  async function saveFact(id: number) {
    const text = editingText.trim();
    if (!text) return;
    try {
      await api(`/api/prompt/facts/${id}`, { method: "PATCH", body: JSON.stringify({ text }) });
      setFacts((prev) => prev.map((f) => (f.id === id ? { ...f, text } : f)));
      setEditingId(null);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not update that fact.");
    }
  }

  async function deleteFact(id: number) {
    try {
      await api(`/api/prompt/facts/${id}`, { method: "DELETE" });
      setFacts((prev) => prev.filter((f) => f.id !== id));
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not delete that fact.");
    }
  }

  const unsaved = prompt !== savedPrompt;

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <header className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-[var(--card-bg)] sticky top-0 z-10">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-1.5 px-3 py-1.5 -ml-2 rounded-lg text-sm font-medium text-[var(--text)] hover:bg-[var(--code-bg)] hover:text-[var(--text-h)] transition-colors"
        >
          ← Back to chat
        </button>

        <div className="flex items-center gap-2">
          {live && (
            <button
              onClick={() => setHistoryOpen(true)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium text-[var(--text)] hover:bg-[var(--code-bg)] hover:text-[var(--text-h)] transition-colors"
            >
              v{live.version} · History
            </button>
          )}
          <button
            onClick={() => void savePrompt()}
            disabled={saving || !unsaved}
            className={[
              "px-4 py-1.5 rounded-lg text-sm font-semibold transition-all",
              saving || !unsaved
                ? "bg-[var(--border)] text-[var(--text)] cursor-not-allowed"
                : "bg-[var(--accent)] text-white hover:opacity-90",
            ].join(" ")}
          >
            {saving ? "Saving…" : unsaved ? "Save changes" : "Saved"}
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        {loading ? (
          <p className="text-sm text-[var(--text)]">Loading…</p>
        ) : (
          <>
            {status && (
              <p className="mb-4 text-sm text-[var(--accent)] bg-[var(--accent-bg)] border border-[var(--accent-border)] rounded-lg px-4 py-2.5">
                {status}
              </p>
            )}

            {conflict && (
              <PromptConflict
                theirs={conflict}
                mine={prompt}
                busy={saving}
                onKeepMine={() => void savePrompt(conflict.version)}
                onTakeTheirs={() => adopt(conflict)}
                onDismiss={() => setConflict(null)}
              />
            )}

            <section>
              <h1 className="text-xl font-bold text-[var(--text-h)]">AI instructions</h1>
              <p className="text-sm text-[var(--text)] mt-1.5 leading-relaxed">
                This is what the AI is told before every conversation. Edit it to change how it
                answers, what it knows about your shop, or how careful it is about safety.
              </p>
              {live && (
                <p className="text-xs text-[var(--text)] mt-1.5">
                  Version {live.version} · last edited by {live.authorName}{" "}
                  {timeAgo(live.updatedAt)}
                </p>
              )}

              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                spellCheck={false}
                className="w-full mt-4 h-[28rem] resize-y rounded-xl border-2 border-[var(--border)] bg-[var(--code-bg)] px-4 py-3 text-sm leading-relaxed text-[var(--text-h)] font-mono focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] transition-colors"
              />
            </section>

            <section className="mt-10">
              <h2 className="text-lg font-bold text-[var(--text-h)]">Team knowledge</h2>
              <p className="text-sm text-[var(--text)] mt-1.5 leading-relaxed">
                Things the AI has picked up from real conversations — the parts, tools, and names
                your team actually uses. These are added to the instructions automatically so the
                AI knows what someone means by "the motor". Delete anything that's wrong.
              </p>

              {facts.length === 0 ? (
                <p className="mt-5 text-sm text-[var(--text)] bg-[var(--card-bg)] border border-[var(--border)] rounded-xl px-4 py-5 text-center">
                  Nothing learned yet. As students chat about the robot, facts will show up here.
                </p>
              ) : (
                <ul className="mt-5 space-y-2">
                  {facts.map((fact) => (
                    <li
                      key={fact.id}
                      className="flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--card-bg)] px-4 py-3"
                    >
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[var(--accent)] flex-shrink-0" />

                      <div className="flex-1 min-w-0">
                        {editingId === fact.id ? (
                          <input
                            value={editingText}
                            onChange={(e) => setEditingText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void saveFact(fact.id);
                              if (e.key === "Escape") setEditingId(null);
                            }}
                            autoFocus
                            className="w-full rounded-lg border-2 border-[var(--accent-border)] bg-[var(--code-bg)] px-3 py-1.5 text-sm text-[var(--text-h)] focus:outline-none"
                          />
                        ) : (
                          <p className="text-sm text-[var(--text-h)] break-words">{fact.text}</p>
                        )}
                        <p className="text-xs text-[var(--text)] mt-1">
                          mentioned in {fact.mentionCount} {fact.mentionCount === 1 ? "chat" : "chats"}
                        </p>
                      </div>

                      <div className="flex gap-1 flex-shrink-0">
                        {editingId === fact.id ? (
                          <button
                            onClick={() => void saveFact(fact.id)}
                            className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-[var(--accent)] text-white hover:opacity-90 transition-opacity"
                          >
                            Save
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              setEditingId(fact.id);
                              setEditingText(fact.text);
                            }}
                            className="px-2.5 py-1 rounded-lg text-xs font-medium text-[var(--text)] hover:text-[var(--accent)] hover:bg-[var(--accent-bg)] transition-colors"
                          >
                            Edit
                          </button>
                        )}
                        <button
                          onClick={() => void deleteFact(fact.id)}
                          aria-label="Delete fact"
                          className="px-2.5 py-1 rounded-lg text-xs font-medium text-[var(--text)] hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>

      {historyOpen && live && (
        <PromptHistory
          liveVersion={live.version}
          onClose={() => setHistoryOpen(false)}
          onRestored={(restored) => {
            adopt(restored);
            setHistoryOpen(false);
            setStatus(`Restored as v${restored.version}.`);
          }}
        />
      )}
    </div>
  );
}
