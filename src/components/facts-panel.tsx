import { useCallback, useEffect, useState } from "react";
import { buttonClass } from "../lib/button-styles";
import { approveFact, editFact, fetchFacts, rejectFact, removeFact, type FactRow, type FactsData } from "../lib/facts-api";
import { timeAgo } from "../lib/prompt-api";

/**
 * The review desk for auto-learned team knowledge. Facts the AI extracts
 * from student chats queue up here as pending; nothing reaches the AI's
 * instructions until a teacher approves it. Self-contained on purpose —
 * it fetches its own data, so it drops into any page as <FactsPanel />.
 */
export default function FactsPanel() {
  const [data, setData] = useState<FactsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingText, setEditingText] = useState("");

  const reload = useCallback(async () => {
    try {
      setData(await fetchFacts());
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not load team knowledge.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  /** Run one action against a fact, then refresh the lists. */
  async function act(id: number, action: () => Promise<unknown>, failure: string) {
    setBusyId(id);
    setStatus(null);
    try {
      await action();
      setEditingId(null);
      await reload();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : failure);
    } finally {
      setBusyId(null);
    }
  }

  function approve(fact: FactRow) {
    const edited = editingId === fact.id ? editingText.trim() : undefined;
    if (editingId === fact.id && !edited) return;
    void act(fact.id, () => approveFact(fact.id, edited), "Could not approve that fact.");
  }

  function saveEdit(fact: FactRow) {
    const text = editingText.trim();
    if (!text) return;
    void act(fact.id, () => editFact(fact.id, text), "Could not update that fact.");
  }

  function startEditing(fact: FactRow) {
    setEditingId(fact.id);
    setEditingText(fact.text);
  }

  /** The fact's text, or an edit box when this row is being reworded. */
  function factText(fact: FactRow, onEnter: () => void) {
    if (editingId !== fact.id) {
      return <p className="text-sm text-[var(--text-h)] break-words">{fact.text}</p>;
    }
    return (
      <input
        value={editingText}
        onChange={(e) => setEditingText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onEnter();
          if (e.key === "Escape") setEditingId(null);
        }}
        autoFocus
        className="w-full rounded-lg border-2 border-[var(--accent-border)] bg-[var(--code-bg)] px-3 py-1.5 text-sm text-[var(--text-h)] focus:outline-none animate-fade-in"
      />
    );
  }

  const pending = data?.pending ?? [];
  const approved = data?.approved ?? [];

  return (
    <section className="mt-10">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="text-lg font-bold text-[var(--text-h)]">
          Team knowledge
          {pending.length > 0 && (
            <span className="ml-2 align-middle inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-500 border border-amber-500/30">
              {pending.length} awaiting review
            </span>
          )}
        </h2>
        {data && (
          <p className="text-xs text-[var(--text)]">
            {approved.length}/{data.approvedCap} approved
          </p>
        )}
      </div>
      <p className="text-sm text-[var(--text)] mt-1.5 leading-relaxed">
        Things the AI picks up from real conversations — the parts, tools, and names your team
        actually uses. Nothing reaches the AI until you approve it here, so a wrong or joking
        answer in chat can't quietly become "knowledge".
      </p>

      {status && (
        <p
          key={status}
          className="mt-4 text-sm text-[var(--accent)] bg-[var(--accent-bg)] border border-[var(--accent-border)] rounded-lg px-4 py-2.5 animate-rise-in"
        >
          {status}
        </p>
      )}

      {loading ? (
        <p className="mt-5 text-sm text-[var(--text)]">Loading…</p>
      ) : (
        <>
          {pending.length > 0 && (
            <ul className="mt-5 space-y-2">
              {pending.map((fact) => (
                <li
                  key={fact.id}
                  className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-[var(--card-bg)] px-4 py-3 animate-rise-in"
                >
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />

                  <div className="flex-1 min-w-0">
                    {factText(fact, () => approve(fact))}
                    <p className="text-xs text-[var(--text)] mt-1">
                      {fact.sourceUserName ? `from a chat with ${fact.sourceUserName}` : "from a student chat"}
                      {fact.createdAt ? ` · ${timeAgo(fact.createdAt)}` : ""}
                      {fact.mentionCount > 1 ? ` · mentioned in ${fact.mentionCount} chats` : ""}
                    </p>
                  </div>

                  <div className="flex gap-1 flex-shrink-0">
                    {editingId !== fact.id && (
                      <button
                        onClick={() => startEditing(fact)}
                        disabled={busyId === fact.id}
                        className={buttonClass("outline", "xs")}
                      >
                        Edit
                      </button>
                    )}
                    <button
                      onClick={() => approve(fact)}
                      disabled={busyId === fact.id}
                      className={buttonClass("primary", "xs")}
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => void act(fact.id, () => rejectFact(fact.id), "Could not reject that fact.")}
                      disabled={busyId === fact.id}
                      className={buttonClass("danger", "xs")}
                    >
                      Reject
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {approved.length === 0 && pending.length === 0 ? (
            <p className="mt-5 text-sm text-[var(--text)] bg-[var(--card-bg)] border border-[var(--border)] rounded-xl px-4 py-5 text-center">
              Nothing learned yet. As students chat about the robot, facts will show up here for
              your review.
            </p>
          ) : (
            approved.length > 0 && (
              <>
                {pending.length > 0 && (
                  <h3 className="mt-6 text-sm font-semibold text-[var(--text-h)]">In the AI's instructions</h3>
                )}
                <ul className="mt-3 space-y-2">
                  {approved.map((fact) => (
                    <li
                      key={fact.id}
                      className="flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--card-bg)] px-4 py-3 animate-rise-in"
                    >
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[var(--accent)] flex-shrink-0" />

                      <div className="flex-1 min-w-0">
                        {factText(fact, () => saveEdit(fact))}
                        <p className="text-xs text-[var(--text)] mt-1">
                          mentioned in {fact.mentionCount} {fact.mentionCount === 1 ? "chat" : "chats"}
                        </p>
                      </div>

                      <div className="flex gap-1 flex-shrink-0">
                        {editingId === fact.id ? (
                          <button
                            onClick={() => saveEdit(fact)}
                            disabled={busyId === fact.id}
                            className={buttonClass("primary", "xs")}
                          >
                            Save
                          </button>
                        ) : (
                          <button
                            onClick={() => startEditing(fact)}
                            disabled={busyId === fact.id}
                            className={buttonClass("outline", "xs")}
                          >
                            Edit
                          </button>
                        )}
                        <button
                          onClick={() => void act(fact.id, () => removeFact(fact.id), "Could not remove that fact.")}
                          disabled={busyId === fact.id}
                          className={buttonClass("danger", "xs")}
                        >
                          Remove
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-[var(--text)]">
                  Removed facts won't be suggested again.
                </p>
              </>
            )
          )}
        </>
      )}
    </section>
  );
}
