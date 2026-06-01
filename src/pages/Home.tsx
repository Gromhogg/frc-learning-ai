import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import TopicPicker from "../components/topic-picker";
import { useAuth } from "../context/AuthContext";

interface Topic {
  id: number;
  name: string;
  slug: string;
  filePath: string;
}

export default function Home() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null);
  const [search, setSearch] = useState("");

  const filteredTopics = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return topics;
    return topics.filter(
      (t) => t.name.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q)
    );
  }, [topics, search]);

  useEffect(() => {
    let cancelled = false;

    fetch("http://localhost:3001/api/topics")
      .then((r) => {
        if (!r.ok) throw new Error(`Topics API error: ${r.status}`);
        return r.json() as Promise<Topic[]>;
      })
      .then((data) => { if (!cancelled) setTopics(data); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "Could not reach the server."); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, []);

  function handleTopicSelect(topic: Topic) {
    setSelectedTopic(topic);
    if (!user) return;
    const params = new URLSearchParams({
      userId: String(user.id),
      topicId: String(topic.id),
      topicName: topic.name,
      userName: user.name,
    });
    navigate(`/chat?${params.toString()}`);
  }

  // ── Render states ──────────────────────────────────────────────────────────

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
          <p className="mt-3 text-xs text-[var(--text)] opacity-70">
            Run <code className="text-xs px-1.5 py-0.5 rounded bg-[var(--border)] text-[var(--text-h)]">npm run server</code> to start the API.
          </p>
        </div>
      </div>
    );
  }

  return (
    <main className="flex flex-col flex-1 bg-[var(--bg)]">
      <div className="w-full max-w-3xl mx-auto px-6 py-12">

        {/* ── Header ── */}
        <header className="mb-12 text-center">
          <div className="inline-flex items-center gap-2 mb-4 px-3 py-1 rounded-full border border-[var(--accent-border)] bg-[var(--accent-bg)] text-xs font-semibold tracking-widest uppercase text-[var(--accent)]">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2"/></svg>
            <span>972 Iron Claw</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-[var(--text-h)] mb-3">
            FRC Team Knowledge<br className="hidden sm:block" /> Assessment
          </h1>
          {user && (
            <p className="text-base text-[var(--text)]">
              Welcome, <span className="font-semibold text-[var(--text-h)]">{user.name}</span>
            </p>
          )}
        </header>

        {/* ── Topic picker ── */}
        <section className="mb-8">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-[var(--text)] mb-3">
            Choose a topic to begin
          </p>

          {/* Search bar */}
          <div className="relative mb-4">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text)] opacity-50 pointer-events-none"
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="search"
              placeholder="Search topics…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--card-bg)] text-sm text-[var(--text-h)] placeholder:text-[var(--text)] placeholder:opacity-50 focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-colors"
            />
          </div>

          <TopicPicker
            topics={filteredTopics}
            selectedTopicId={selectedTopic?.id ?? null}
            onSelect={handleTopicSelect}
          />
        </section>


      </div>
    </main>
  );
}
