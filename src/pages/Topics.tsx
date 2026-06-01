import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

interface Topic {
  id: number;
  name: string;
  slug: string;
  filePath: string;
}

export default function Topics() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<Topic | null>(null);
  const [content, setContent] = useState<string>("");
  const [contentLoading, setContentLoading] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("http://localhost:3001/api/topics")
      .then((r) => {
        if (!r.ok) throw new Error(`Topics API error: ${r.status}`);
        return r.json() as Promise<Topic[]>;
      })
      .then((data) => {
        if (cancelled) return;
        setTopics(data);
        if (data.length > 0) setSelected(data[0]);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not reach the server.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setContentLoading(true);
    setContent("");
    fetch(`http://localhost:3001/api/topics/${selected.id}/content`)
      .then((r) => r.json() as Promise<{ content?: string; error?: string }>)
      .then((data) => {
        if (cancelled) return;
        setContent(data.content ?? data.error ?? "");
      })
      .catch(() => {
        if (!cancelled) setContent("Could not load this topic.");
      })
      .finally(() => {
        if (!cancelled) setContentLoading(false);
      });
    return () => { cancelled = true; };
  }, [selected]);

  function startAssessment() {
    if (!selected || !user) return;
    const params = new URLSearchParams({
      userId: String(user.id),
      topicId: String(selected.id),
      topicName: selected.name,
      userName: user.name,
    });
    navigate(`/chat?${params.toString()}`);
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-screen bg-[var(--bg)]">
        <div className="flex flex-col items-center gap-4 text-[var(--text)]">
          <svg className="animate-spin h-10 w-10 text-[var(--accent)]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          <p className="text-sm font-medium">Loading topics…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-screen bg-[var(--bg)]">
        <div className="max-w-md w-full mx-4 rounded-xl border-2 border-red-500/40 bg-red-500/10 px-6 py-5 text-center">
          <p className="text-base font-semibold text-red-400">Connection error</p>
          <p className="mt-2 text-sm text-[var(--text)]">{error}</p>
        </div>
      </div>
    );
  }

  const filtered = topics.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.slug.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <main className="flex flex-col flex-1 bg-[var(--bg)] min-h-screen">
      <div className="w-full max-w-6xl mx-auto px-6 py-10 flex-1 flex flex-col">
        {/* Header */}
        <header className="mb-6 pl-16">
          <div className="inline-flex items-center gap-2 mb-3 px-3 py-1 rounded-full border border-[var(--accent-border)] bg-[var(--accent-bg)] text-xs font-semibold tracking-widest uppercase text-[var(--accent)]">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
            </svg>
            <span>Topic Library</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-[var(--text-h)] mb-1">Study the knowledge base</h1>
          <p className="text-sm text-[var(--text)]">Browse what each topic covers. When you're ready, start an assessment.</p>
        </header>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4 flex-1 min-h-0">
          {/* Topic list */}
          <aside className="rounded-xl border border-[var(--border)] bg-[var(--card-bg)] flex flex-col min-h-0">
            <div className="p-3 border-b border-[var(--border)]">
              <div className="relative">
                <svg
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text)] opacity-50 pointer-events-none"
                  viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round"
                >
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input
                  type="search"
                  placeholder="Search…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-7 pr-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-xs text-[var(--text-h)] placeholder:text-[var(--text)] placeholder:opacity-50 focus:outline-none focus:border-[var(--accent)] transition-colors"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-[var(--text)] opacity-60">No topics found.</p>
              ) : (
                filtered.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setSelected(t)}
                    className={[
                      "w-full text-left px-4 py-2.5 text-sm transition-colors border-l-2",
                      selected?.id === t.id
                        ? "bg-[var(--accent-bg)] text-[var(--accent)] border-[var(--accent)] font-semibold"
                        : "text-[var(--text-h)] border-transparent hover:bg-[var(--bg)] hover:text-[var(--accent)]",
                    ].join(" ")}
                  >
                    {t.name}
                  </button>
                ))
              )}
            </div>
          </aside>

          {/* Content pane */}
          <section className="rounded-xl border border-[var(--border)] bg-[var(--card-bg)] flex flex-col min-h-0">
            {selected ? (
              <>
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border)] flex-shrink-0">
                  <h2 className="text-base font-semibold text-[var(--text-h)]">{selected.name}</h2>
                  <button
                    onClick={startAssessment}
                    disabled={!user}
                    className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    Start assessment →
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto px-5 py-4">
                  {contentLoading ? (
                    <p className="text-sm text-[var(--text)] opacity-70">Loading…</p>
                  ) : (
                    <pre className="text-sm leading-relaxed text-[var(--text-h)] whitespace-pre-wrap font-sans">{content}</pre>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-sm text-[var(--text)] opacity-60">
                Select a topic to view its content.
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
