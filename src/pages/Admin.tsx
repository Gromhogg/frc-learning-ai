import React, { useEffect, useState, useCallback, useRef } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface User {
  id: number;
  name: string;
  createdAt: string | null;
}

interface Topic {
  id: number;
  name: string;
  slug: string;
  filePath: string;
}

interface Assessment {
  id: number;
  userId: number;
  topicId: number;
  score: number;
  chatLog: string;
  createdAt: string;
  userName: string;
  topicName: string;
}

// ── Score helpers ─────────────────────────────────────────────────────────────

function scoreBadgeBg(score: number): string {
  if (score >= 80) return "bg-emerald-900/40 text-emerald-300";
  if (score >= 60) return "bg-yellow-900/40 text-yellow-300";
  return "bg-red-900/40 text-red-400";
}

function scoreBar(score: number): string {
  if (score >= 80) return "bg-emerald-500";
  if (score >= 60) return "bg-yellow-500";
  return "bg-red-500";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ── Chat log parsing (for member deep-dive) ───────────────────────────────────

interface ParsedMessage {
  role: "user" | "assistant";
  parts: string[];
}

function parseChatLog(raw: string): ParsedMessage[] {
  let messages: Record<string, unknown>[];
  try {
    messages = JSON.parse(raw) as Record<string, unknown>[];
  } catch {
    return [];
  }
  if (!Array.isArray(messages)) return [];

  const parsed: ParsedMessage[] = [];
  for (const msg of messages) {
    if (!msg.role) continue;
    const role = msg.role as "user" | "assistant";
    const parts: string[] = [];

    if (Array.isArray(msg.parts)) {
      for (const part of msg.parts as Record<string, unknown>[]) {
        if (part.type === "text" && typeof part.text === "string" && (part.text as string).trim()) {
          parts.push((part.text as string).trim());
        } else if (part.type === "tool-invocation" || part.type === "tool") {
          const input = (part.input ?? part.args) as Record<string, unknown> | undefined;
          const toolName = String(part.toolName ?? part.name ?? "Tool");
          if (input && "question" in input && typeof input.question === "string") {
            parts.push(`[Quiz: ${input.question}]`);
          } else if (input && "title" in input && typeof input.title === "string") {
            parts.push(`[Checklist: ${input.title}]`);
          } else {
            parts.push(`[${toolName}]`);
          }
        }
      }
    } else if (typeof msg.content === "string" && (msg.content as string).trim()) {
      parts.push((msg.content as string).trim());
    }

    if (parts.length > 0) parsed.push({ role, parts });
  }
  return parsed;
}

function ChatLogView({ rawLog }: { rawLog: string }) {
  const messages = parseChatLog(rawLog);
  if (messages.length === 0) {
    return <p className="text-sm text-[var(--text)] italic px-4 pb-4">No messages to display.</p>;
  }
  return (
    <div className="flex flex-col gap-3 px-4 pb-4 pt-2 max-h-96 overflow-y-auto">
      {messages.map((msg, i) => {
        const isUser = msg.role === "user";
        return (
          <div key={i} className={`flex flex-col gap-1 ${isUser ? "items-end" : "items-start"}`}>
            <span className={`text-[10px] font-semibold uppercase tracking-widest ${isUser ? "text-[var(--accent)]" : "text-[var(--text)]"}`}>
              {isUser ? "Student" : "AI Tutor"}
            </span>
            {msg.parts.map((part, j) => {
              const isTool = part.startsWith("[");
              return (
                <div
                  key={j}
                  className={[
                    "max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed text-left",
                    isTool
                      ? "border border-[var(--accent-border)] bg-[var(--accent-bg)] text-[var(--accent)] font-medium font-mono text-xs"
                      : isUser
                      ? "bg-[var(--accent)] text-white"
                      : "bg-[var(--card-bg)] text-[var(--text-h)]",
                  ].join(" ")}
                >
                  {part}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ── Tab bar ───────────────────────────────────────────────────────────────────

type Tab = "overview" | "knowledge" | "roster";

function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "overview", label: "Overview", icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
      </svg>
    )},
    { id: "knowledge", label: "Knowledge Base", icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
      </svg>
    )},
    { id: "roster", label: "Roster", icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    )},
  ];
  return (
    <div className="flex gap-1 border-b border-[var(--border)] mb-6">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={[
            "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors duration-150",
            active === t.id
              ? "border-[var(--accent)] text-[var(--accent)]"
              : "border-transparent text-[var(--text)] hover:text-[var(--text-h)]",
          ].join(" ")}
        >
          {t.icon}
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ── Overview tab ──────────────────────────────────────────────────────────────

interface MemberSummary {
  summary: string;
  score: number | null;
  loading: boolean;
}

function OverviewTab({
  users,
  topics,
  assessments,
  onDeleteAssessment,
  onEditScore,
}: {
  users: User[];
  topics: Topic[];
  assessments: Assessment[];
  onDeleteAssessment: (id: number) => Promise<void>;
  onEditScore: (id: number, score: number) => Promise<void>;
}) {
  const [expandedMemberId, setExpandedMemberId] = useState<number | null>(null);
  const [expandedAssessmentId, setExpandedAssessmentId] = useState<number | null>(null);
  const [editingScoreId, setEditingScoreId] = useState<number | null>(null);
  const [editScoreValue, setEditScoreValue] = useState("");
  const [summaries, setSummaries] = useState<Record<number, MemberSummary>>({});
  const hasFetchedRef = useRef(false);

  // ── Generate AI summaries for all members ────────────────────────────────

  const generateSummaries = useCallback(() => {
    if (users.length === 0) return;
    hasFetchedRef.current = true;

    // Mark everyone as loading
    const initial: Record<number, MemberSummary> = {};
    for (const user of users) {
      initial[user.id] = { summary: "", score: null, loading: true };
    }
    setSummaries(initial);

    // Fetch in parallel, update each as it resolves
    for (const user of users) {
      fetch("http://localhost:3001/api/admin/member-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      })
        .then((r) => r.json() as Promise<{ summary: string; score: number | null }>)
        .then((data) => {
          setSummaries((prev) => ({
            ...prev,
            [user.id]: { summary: data.summary, score: data.score, loading: false },
          }));
        })
        .catch(() => {
          setSummaries((prev) => ({
            ...prev,
            [user.id]: { summary: "Could not generate summary.", score: null, loading: false },
          }));
        });
    }
  }, [users]);

  useEffect(() => {
    if (!hasFetchedRef.current && users.length > 0) {
      generateSummaries();
    }
  }, [users, generateSummaries]);

  // ── Derived values ───────────────────────────────────────────────────────

  const totalAssessments = assessments.length;

  // Team avg uses AI scores where available, falls back to raw scores
  const scoredMembers = users.filter((u) => {
    const s = summaries[u.id];
    return s && !s.loading && s.score !== null;
  });
  const teamAvg =
    scoredMembers.length > 0
      ? Math.round(scoredMembers.reduce((sum, u) => sum + (summaries[u.id].score ?? 0), 0) / scoredMembers.length)
      : null;

  // Gap analysis: topics where fewer than half the team has been assessed
  const topicGaps = topics
    .map((topic) => {
      const assessed = new Set(assessments.filter((a) => a.topicId === topic.id).map((a) => a.userId));
      const coverage = users.length > 0 ? Math.round((assessed.size / users.length) * 100) : 0;
      const missing = users.length - assessed.size;
      return { topic, coverage, missing };
    })
    .filter((t) => t.coverage < 50);

  // Sort members: loaded with scores first (desc), then loading, then no assessments
  const sortedUsers = [...users].sort((a, b) => {
    const sa = summaries[a.id];
    const sb = summaries[b.id];
    const scoreA = sa?.score ?? -1;
    const scoreB = sb?.score ?? -1;
    if (sa?.loading && !sb?.loading) return 1;
    if (!sa?.loading && sb?.loading) return -1;
    return scoreB - scoreA;
  });

  return (
    <div className="space-y-8">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card-bg)] px-5 py-5 text-center">
          <p className="text-3xl font-bold text-[var(--text-h)]">{users.length}</p>
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text)] mt-1">Team Members</p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card-bg)] px-5 py-5 text-center">
          <p className="text-3xl font-bold text-[var(--text-h)]">{totalAssessments}</p>
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text)] mt-1">Sessions Completed</p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card-bg)] px-5 py-5 text-center">
          <p
            className={`text-3xl font-bold ${
              teamAvg === null
                ? "text-[var(--text)]"
                : teamAvg >= 80
                ? "text-emerald-400"
                : teamAvg >= 60
                ? "text-yellow-400"
                : "text-red-400"
            }`}
          >
            {teamAvg !== null ? `${teamAvg}%` : "—"}
          </p>
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text)] mt-1">Team Avg</p>
        </div>
      </div>

      {/* Gap analysis */}
      {topicGaps.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-widest text-[var(--text)] mb-3">
            Coverage Gaps
          </h2>
          <div className="flex flex-col gap-2">
            {topicGaps.map(({ topic, coverage, missing }) => (
              <div
                key={topic.id}
                className="flex items-center gap-3 rounded-xl border border-yellow-500/25 bg-yellow-500/8 px-4 py-3"
              >
                <svg className="text-yellow-400 flex-shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                <p className="text-sm text-[var(--text-h)] flex-1">
                  <span className="font-semibold">{topic.name}</span>
                  {" — "}
                  {missing} member{missing !== 1 ? "s" : ""} {missing !== 1 ? "haven't" : "hasn't"} been assessed yet
                </p>
                <span className="text-xs font-bold text-yellow-400 flex-shrink-0">{coverage}% coverage</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Member profiles with AI summaries */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-[var(--text)]">
            Team Members
          </h2>
          <button
            onClick={generateSummaries}
            className="flex items-center gap-1.5 text-xs text-[var(--text)] hover:text-[var(--accent)] transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            Regenerate summaries
          </button>
        </div>

        {users.length === 0 ? (
          <p className="text-sm text-[var(--text)] italic">No members in the roster.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {sortedUsers.map((user) => {
              const summary = summaries[user.id];
              const isExpanded = expandedMemberId === user.id;
              const memberAssessments = assessments
                .filter((a) => a.userId === user.id)
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

              return (
                <div key={user.id} className="rounded-xl border border-[var(--border)] overflow-hidden">
                  {/* Collapsed row */}
                  <div className="px-4 pt-3.5 pb-3">
                    {/* Name + score */}
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => {
                          setExpandedMemberId(isExpanded ? null : user.id);
                          setExpandedAssessmentId(null);
                        }}
                        className="flex items-center gap-2 flex-1 min-w-0 text-left focus:outline-none group"
                      >
                        <span className={`flex-shrink-0 text-[var(--text)] transition-transform duration-150 ${isExpanded ? "rotate-90" : ""}`}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="9 18 15 12 9 6" />
                          </svg>
                        </span>
                        <span className="text-sm font-semibold text-[var(--text-h)] group-hover:text-[var(--accent)] transition-colors truncate">
                          {user.name}
                        </span>
                      </button>

                      {/* Score badge */}
                      {summary?.loading ? (
                        <span className="flex items-center gap-1.5 text-xs text-[var(--text)] opacity-50 flex-shrink-0">
                          <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                          </svg>
                          Analysing…
                        </span>
                      ) : summary?.score !== null && summary?.score !== undefined ? (
                        <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full flex-shrink-0 ${scoreBadgeBg(summary.score)}`}>
                          {summary.score}%
                        </span>
                      ) : memberAssessments.length === 0 ? (
                        <span className="text-xs text-[var(--text)] opacity-40 flex-shrink-0">Not assessed</span>
                      ) : null}
                    </div>

                    {/* AI summary text */}
                    <div className="ml-5 mt-1.5">
                      {summary?.loading ? (
                        <div className="h-3.5 w-3/4 rounded bg-[var(--border)] animate-pulse" />
                      ) : summary?.summary ? (
                        <p className="text-sm text-[var(--text)] leading-relaxed">{summary.summary}</p>
                      ) : memberAssessments.length === 0 ? (
                        <p className="text-sm text-[var(--text)] opacity-40 italic">No sessions recorded yet.</p>
                      ) : null}
                    </div>
                  </div>

                  {/* Expanded: individual assessment history */}
                  {isExpanded && memberAssessments.length > 0 && (
                    <div className="border-t border-[var(--border)] bg-[var(--bg)] px-4 py-3">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text)] opacity-60 mb-2">Session History</p>
                      <div className="flex flex-col gap-2">
                        {memberAssessments.map((a) => {
                          const isExpA = expandedAssessmentId === a.id;
                          const isEditingScore = editingScoreId === a.id;
                          return (
                            <div key={a.id} className="rounded-lg border border-[var(--border)] overflow-hidden">
                              <div className="flex items-center hover:bg-[var(--card-bg)] transition-colors">
                                <button
                                  onClick={() => setExpandedAssessmentId(isExpA ? null : a.id)}
                                  className="flex-1 flex items-center gap-3 px-3 py-2.5 text-left text-sm focus:outline-none"
                                >
                                  <span className={`flex-shrink-0 text-[var(--text)] transition-transform duration-150 ${isExpA ? "rotate-90" : ""}`}>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                      <polyline points="9 18 15 12 9 6" />
                                    </svg>
                                  </span>
                                  <span className="flex-1 text-[var(--text-h)] font-medium">{a.topicName}</span>
                                  <span className="text-xs text-[var(--text)] opacity-50 flex-shrink-0">{formatDate(a.createdAt)}</span>
                                </button>

                                {/* Score — badge or inline editor */}
                                {isEditingScore ? (
                                  <div className="flex items-center gap-1 mr-1" onClick={(e) => e.stopPropagation()}>
                                    <input
                                      type="number"
                                      min={0}
                                      max={100}
                                      value={editScoreValue}
                                      onChange={(e) => setEditScoreValue(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                          const v = Math.max(0, Math.min(100, parseInt(editScoreValue, 10)));
                                          if (!isNaN(v)) void onEditScore(a.id, v).then(() => setEditingScoreId(null));
                                        }
                                        if (e.key === "Escape") setEditingScoreId(null);
                                      }}
                                      autoFocus
                                      className="w-14 rounded-md border border-[var(--accent)] bg-[var(--card-bg)] text-[var(--text-h)] text-xs font-bold text-center px-1 py-0.5 focus:outline-none"
                                    />
                                    <button
                                      onClick={() => {
                                        const v = Math.max(0, Math.min(100, parseInt(editScoreValue, 10)));
                                        if (!isNaN(v)) void onEditScore(a.id, v).then(() => setEditingScoreId(null));
                                      }}
                                      className="p-1 rounded text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                                      title="Save"
                                    >
                                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="20 6 9 17 4 12" />
                                      </svg>
                                    </button>
                                    <button
                                      onClick={() => setEditingScoreId(null)}
                                      className="p-1 rounded text-[var(--text)] opacity-50 hover:opacity-100 transition-colors"
                                      title="Cancel"
                                    >
                                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                                      </svg>
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setEditScoreValue(String(a.score)); setEditingScoreId(a.id); }}
                                    title="Edit score"
                                    className={`group flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 mr-1 ${scoreBadgeBg(a.score)} hover:ring-2 hover:ring-[var(--accent)] transition-all`}
                                  >
                                    {a.score}%
                                    <svg className="opacity-0 group-hover:opacity-70 transition-opacity" xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                    </svg>
                                  </button>
                                )}

                                <button
                                  onClick={() => void onDeleteAssessment(a.id)}
                                  title="Delete assessment"
                                  className="flex-shrink-0 mr-2 p-1.5 rounded-lg text-[var(--text)] opacity-30 hover:opacity-100 hover:text-red-400 hover:bg-red-500/10 transition-all focus:outline-none"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="3 6 5 6 21 6" />
                                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                                    <path d="M10 11v6M14 11v6" />
                                    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                                  </svg>
                                </button>
                              </div>
                              {isExpA && (
                                <div className="border-t border-[var(--border)]">
                                  <ChatLogView rawLog={a.chatLog} />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Knowledge Base tab ────────────────────────────────────────────────────────

function KnowledgeTab({
  topics,
  onTopicsChange,
}: {
  topics: Topic[];
  onTopicsChange: () => void;
}) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");
  const [loadingContent, setLoadingContent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState("");
  const [addContent, setAddContent] = useState("");
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [deletingId, setDeletingId] = useState<number | null>(null);

  async function startEdit(topic: Topic) {
    if (editingId === topic.id) {
      setEditingId(null);
      return;
    }
    setEditingId(topic.id);
    setEditContent("");
    setSaveMsg(null);
    setLoadingContent(true);
    try {
      const res = await fetch(`http://localhost:3001/api/topics/${topic.id}/content`);
      const data = await res.json() as { content?: string; error?: string };
      setEditContent(data.content ?? "");
    } catch {
      setEditContent("");
    } finally {
      setLoadingContent(false);
    }
  }

  async function saveContent(topicId: number) {
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch(`http://localhost:3001/api/topics/${topicId}/content`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editContent }),
      });
      if (res.ok) {
        setSaveMsg("Saved successfully.");
        setTimeout(() => setSaveMsg(null), 3000);
      } else {
        setSaveMsg("Failed to save.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function deleteTopic(id: number) {
    if (!confirm("Delete this topic and its knowledge file? This cannot be undone.")) return;
    setDeletingId(id);
    try {
      await fetch(`http://localhost:3001/api/topics/${id}`, { method: "DELETE" });
      if (editingId === id) setEditingId(null);
      onTopicsChange();
    } finally {
      setDeletingId(null);
    }
  }

  async function addTopic() {
    if (!addName.trim()) return;
    setAddLoading(true);
    setAddError(null);
    try {
      const res = await fetch("http://localhost:3001/api/topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: addName.trim(), content: addContent.trim() || undefined }),
      });
      if (res.ok) {
        setAddName("");
        setAddContent("");
        setShowAdd(false);
        onTopicsChange();
      } else {
        setAddError("Failed to create topic. The slug may already exist.");
      }
    } catch {
      setAddError("Network error.");
    } finally {
      setAddLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm text-[var(--text)]">
          Edit knowledge files that the AI uses during assessments. Changes take effect immediately on the next chat session.
        </p>
        <div className="flex items-center gap-2 ml-4 flex-shrink-0">
          <button
            onClick={() => void fetch("http://localhost:3001/api/topics/open-knowledge-folder", { method: "POST" })}
            title="Open the knowledge folder in Finder"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--text)] text-xs font-semibold hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            Open Knowledge Folder
          </button>
          <button
            onClick={() => { setShowAdd((v) => !v); setAddError(null); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--accent)] text-[var(--accent)] bg-[var(--accent-bg)] text-xs font-semibold hover:bg-[var(--accent)] hover:text-white transition-colors"
          >
            + Add Topic
          </button>
        </div>
      </div>

      {/* Add topic form */}
      {showAdd && (
        <div className="rounded-xl border border-[var(--accent-border)] bg-[var(--accent-bg)] p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--accent)]">New Topic</p>
          <div>
            <label className="block text-xs text-[var(--text)] mb-1">Topic Name</label>
            <input
              type="text"
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              placeholder="e.g. Electrical Wiring"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--card-bg)] text-[var(--text-h)] text-sm px-3 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--text)] mb-1">Initial Content <span className="opacity-50">(optional — you can edit after creating)</span></label>
            <textarea
              value={addContent}
              onChange={(e) => setAddContent(e.target.value)}
              placeholder="Describe what team members should know about this topic..."
              rows={5}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--card-bg)] text-[var(--text-h)] text-sm px-3 py-2 font-mono focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] resize-y"
            />
          </div>
          {addError && <p className="text-xs text-red-400">{addError}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => void addTopic()}
              disabled={!addName.trim() || addLoading}
              className="px-4 py-1.5 rounded-lg bg-[var(--accent)] text-white text-sm font-semibold hover:opacity-85 disabled:opacity-40 transition-opacity"
            >
              {addLoading ? "Creating…" : "Create Topic"}
            </button>
            <button
              onClick={() => { setShowAdd(false); setAddError(null); setAddName(""); setAddContent(""); }}
              className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--text)] text-sm hover:text-[var(--text-h)] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Topic list */}
      {topics.length === 0 ? (
        <div className="rounded-xl border border-[var(--border)] px-6 py-10 text-center text-sm text-[var(--text)]">
          No topics yet. Add one above.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {topics.map((topic) => {
            const isEditing = editingId === topic.id;
            return (
              <div key={topic.id} className="rounded-xl border border-[var(--border)] overflow-hidden">
                {/* Topic header */}
                <div className="flex items-center gap-3 px-4 py-3 bg-[var(--card-bg)]">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[var(--text-h)]">{topic.name}</p>
                    <p className="text-xs text-[var(--text)] opacity-60 font-mono mt-0.5">{topic.filePath}</p>
                  </div>
                  <button
                    onClick={() => void fetch(`http://localhost:3001/api/topics/${topic.id}/open-folder`, { method: "POST" })}
                    title="Open topic folder in Finder"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-[var(--border)] text-[var(--text)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                    Open Folder
                  </button>
                  <button
                    onClick={() => void startEdit(topic)}
                    className={[
                      "px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors",
                      isEditing
                        ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                        : "border-[var(--border)] text-[var(--text)] hover:border-[var(--accent)] hover:text-[var(--accent)]",
                    ].join(" ")}
                  >
                    {isEditing ? "Close" : "Edit"}
                  </button>
                  <button
                    onClick={() => void deleteTopic(topic.id)}
                    disabled={deletingId === topic.id}
                    title="Delete topic"
                    className="p-1.5 rounded-lg text-[var(--text)] opacity-40 hover:opacity-100 hover:text-red-400 hover:bg-red-500/10 transition-all disabled:opacity-20"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                      <path d="M10 11v6M14 11v6" />
                      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                    </svg>
                  </button>
                </div>

                {/* Inline editor */}
                {isEditing && (
                  <div className="border-t border-[var(--border)] p-4 space-y-3">
                    {loadingContent ? (
                      <p className="text-sm text-[var(--text)] italic">Loading file content…</p>
                    ) : (
                      <>
                        <textarea
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          rows={16}
                          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text-h)] text-sm px-3 py-2.5 font-mono leading-relaxed focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] resize-y"
                        />
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => void saveContent(topic.id)}
                            disabled={saving}
                            className="px-4 py-1.5 rounded-lg bg-[var(--accent)] text-white text-sm font-semibold hover:opacity-85 disabled:opacity-50 transition-opacity"
                          >
                            {saving ? "Saving…" : "Save Changes"}
                          </button>
                          {saveMsg && (
                            <span className={`text-xs ${saveMsg.startsWith("Saved") ? "text-emerald-400" : "text-red-400"}`}>
                              {saveMsg}
                            </span>
                          )}
                          <span className="ml-auto text-xs text-[var(--text)] opacity-50">
                            {editContent.split(/\s+/).filter(Boolean).length} words
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Roster tab ────────────────────────────────────────────────────────────────

function RosterTab({
  users,
  assessments,
  onUsersChange,
}: {
  users: User[];
  assessments: Assessment[];
  onUsersChange: () => void;
}) {
  const [addName, setAddName] = useState("");
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  async function addMember() {
    if (!addName.trim()) return;
    setAddLoading(true);
    setAddError(null);
    try {
      const res = await fetch("http://localhost:3001/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: addName.trim() }),
      });
      if (res.ok) {
        setAddName("");
        onUsersChange();
      } else {
        setAddError("Failed to add member.");
      }
    } catch {
      setAddError("Network error.");
    } finally {
      setAddLoading(false);
    }
  }

  async function deleteMember(id: number) {
    setConfirmDeleteId(null);
    setDeletingId(id);
    try {
      await fetch(`http://localhost:3001/api/users/${id}`, { method: "DELETE" });
      onUsersChange();
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Add member form */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card-bg)] px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text)] mb-3">Add Team Member</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void addMember(); }}
            placeholder="Full name"
            className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text-h)] text-sm px-3 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          />
          <button
            onClick={() => void addMember()}
            disabled={!addName.trim() || addLoading}
            className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-semibold hover:opacity-85 disabled:opacity-40 transition-opacity flex-shrink-0"
          >
            {addLoading ? "Adding…" : "Add"}
          </button>
        </div>
        {addError && <p className="text-xs text-red-400 mt-2">{addError}</p>}
      </div>

      {/* Member list */}
      <div>
        <div className="hidden sm:flex items-center gap-4 px-4 pb-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--text)]">
          <span className="flex-1">Name</span>
          <span className="w-24 text-center">Assessments</span>
          <span className="w-20 text-center">Avg Score</span>
          <span className="w-8" />
        </div>
        <div className="flex flex-col gap-2">
          {users.length === 0 ? (
            <div className="rounded-xl border border-[var(--border)] px-6 py-10 text-center text-sm text-[var(--text)]">
              No team members yet.
            </div>
          ) : (
            users.map((user) => {
              const userAssessments = assessments.filter((a) => a.userId === user.id);
              const avgScore =
                userAssessments.length > 0
                  ? Math.round(userAssessments.reduce((s, a) => s + a.score, 0) / userAssessments.length)
                  : null;
              const isConfirming = confirmDeleteId === user.id;
              return (
                <div
                  key={user.id}
                  className="flex items-center gap-4 rounded-xl border border-[var(--border)] px-4 py-3 bg-[var(--card-bg)]"
                >
                  <span className="flex-1 text-sm font-medium text-[var(--text-h)]">{user.name}</span>
                  <span className="w-24 text-center text-sm text-[var(--text)]">
                    {userAssessments.length}
                  </span>
                  <span className="w-20 text-center">
                    {avgScore !== null ? (
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${scoreBadgeBg(avgScore)}`}>
                        {avgScore}%
                      </span>
                    ) : (
                      <span className="text-xs text-[var(--text)] opacity-40">—</span>
                    )}
                  </span>
                  {isConfirming ? (
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => void deleteMember(user.id)}
                        className="px-2.5 py-1 rounded-lg bg-red-500/15 text-red-400 border border-red-400/30 text-xs font-semibold hover:bg-red-500/25 transition-colors"
                      >
                        Remove
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-2.5 py-1 rounded-lg border border-[var(--border)] text-[var(--text)] text-xs font-semibold hover:text-[var(--text-h)] transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                  <button
                    onClick={() => setConfirmDeleteId(user.id)}
                    disabled={deletingId === user.id}
                    title="Remove member"
                    className="w-8 flex justify-center p-1.5 rounded-lg text-[var(--text)] opacity-40 hover:opacity-100 hover:text-red-400 hover:bg-red-500/10 transition-all disabled:opacity-20"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                      <path d="M10 11v6M14 11v6" />
                      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                    </svg>
                  </button>
                  )}
                </div>
              );
            })
          )}
        </div>
        {users.length > 0 && (
          <p className="mt-3 text-xs text-[var(--text)] text-center opacity-60">
            {users.length} member{users.length !== 1 ? "s" : ""} on the roster
          </p>
        )}
      </div>
    </div>
  );
}

// ── Main Admin page ───────────────────────────────────────────────────────────

export default function Admin() {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [users, setUsers] = useState<User[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function handleDeleteAssessment(id: number) {
    await fetch(`http://localhost:3001/api/assessments/${id}`, { method: "DELETE" });
    setAssessments((prev) => prev.filter((a) => a.id !== id));
  }

  async function handleEditScore(id: number, score: number) {
    const res = await fetch(`http://localhost:3001/api/assessments/${id}/score`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ score }),
    });
    if (res.ok) {
      setAssessments((prev) => prev.map((a) => a.id === id ? { ...a, score } : a));
    }
  }

  const fetchAll = useCallback(async () => {
    try {
      const [usersRes, topicsRes, assessmentsRes] = await Promise.all([
        fetch("http://localhost:3001/api/users"),
        fetch("http://localhost:3001/api/topics"),
        fetch("http://localhost:3001/api/assessments"),
      ]);

      if (!usersRes.ok) throw new Error(`Users API error: ${usersRes.status}`);
      if (!topicsRes.ok) throw new Error(`Topics API error: ${topicsRes.status}`);
      if (!assessmentsRes.ok) throw new Error(`Assessments API error: ${assessmentsRes.status}`);

      const [usersData, topicsData, assessmentsData] = await Promise.all([
        usersRes.json() as Promise<User[]>,
        topicsRes.json() as Promise<Topic[]>,
        assessmentsRes.json() as Promise<Assessment[]>,
      ]);

      setUsers(usersData);
      setTopics(topicsData);
      setAssessments(assessmentsData);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not reach the server. Make sure it is running on port 3001."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-4 text-[var(--text)]">
          <svg className="animate-spin h-8 w-8 text-[var(--accent)]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          <p className="text-sm font-medium">Loading admin data…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-screen">
        <div className="max-w-md w-full mx-4 rounded-xl border-2 border-red-500/40 bg-red-500/10 px-6 py-5 text-center">
          <p className="text-base font-semibold text-red-400">Connection error</p>
          <p className="mt-2 text-sm text-[var(--text)]">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <main className="flex flex-col flex-1 bg-[var(--bg)] px-4 sm:px-8 pt-6 pb-10 max-w-5xl mx-auto w-full">
      {/* Header */}
      <header className="mb-0">
        <div className="inline-flex items-center gap-2 mb-3 px-3 py-1 rounded-full border border-[var(--accent-border)] bg-[var(--accent-bg)] text-xs font-semibold tracking-widest uppercase text-[var(--accent)]">
          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          Administrator
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-[var(--text-h)]">Mentor Dashboard</h1>
        <p className="text-sm text-[var(--text)] mt-1">
          Manage the team roster, edit knowledge base files, and review team performance.
        </p>
      </header>

      <TabBar active={activeTab} onChange={setActiveTab} />

      {activeTab === "overview" && (
        <OverviewTab users={users} topics={topics} assessments={assessments} onDeleteAssessment={handleDeleteAssessment} onEditScore={handleEditScore} />
      )}
      {activeTab === "knowledge" && (
        <KnowledgeTab topics={topics} onTopicsChange={() => void fetchAll()} />
      )}
      {activeTab === "roster" && (
        <RosterTab users={users} assessments={assessments} onUsersChange={() => void fetchAll()} />
      )}
    </main>
  );
}
