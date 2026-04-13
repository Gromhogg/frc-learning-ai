import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

// ── Types ────────────────────────────────────────────────────────────────────

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

interface User {
  id: number;
  name: string;
  createdAt: string | null;
}

// chatLog message shapes
interface TextMessage {
  role: "user" | "assistant";
  content: string | ContentBlock[];
}

interface ContentBlock {
  type: "text" | "tool_use" | "tool_result";
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
  content?: string | ContentBlock[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 60) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-500 dark:text-red-400";
}

function scoreBadgeBg(score: number): string {
  if (score >= 80)
    return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300";
  if (score >= 60)
    return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300";
  return "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300";
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

// ── Chat log parsing ─────────────────────────────────────────────────────────

interface ParsedMessage {
  role: "user" | "assistant";
  parts: string[];
}

function getTextFromBlock(block: ContentBlock): string | null {
  if (block.type === "text" && block.text) return block.text;
  if (block.type === "tool_use") {
    const input = block.input ?? {};
    const name = block.name ?? "Tool";
    // Quiz tool
    if ("question" in input && typeof input.question === "string") {
      return `[Quiz: ${input.question}]`;
    }
    // Checklist tool
    if ("title" in input && typeof input.title === "string") {
      return `[Checklist: ${input.title}]`;
    }
    return `[${name}]`;
  }
  if (block.type === "tool_result") {
    if (typeof block.content === "string") return null; // skip results
    return null;
  }
  return null;
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

    // UIMessage format (parts array with {type, text} objects)
    if (Array.isArray(msg.parts)) {
      for (const part of msg.parts as Record<string, unknown>[]) {
        if (part.type === "text" && typeof part.text === "string") {
          if (part.text.trim()) parts.push(part.text.trim());
        } else if (part.type === "tool-invocation" || part.type === "tool") {
          const input = (part.input ?? part.args) as Record<string, unknown> | undefined;
          const toolName = (part.toolName ?? part.name ?? "Tool") as string;
          if (input && "question" in input && typeof input.question === "string") {
            parts.push(`[Quiz: ${input.question}]`);
          } else if (input && "title" in input && typeof input.title === "string") {
            parts.push(`[Checklist: ${input.title}]`);
          } else {
            parts.push(`[${toolName}]`);
          }
        }
      }
    }
    // Legacy format (content string or content blocks array)
    else if (typeof msg.content === "string") {
      const content = msg.content as string;
      if (content.trim()) parts.push(content.trim());
    } else if (Array.isArray(msg.content)) {
      for (const block of msg.content as ContentBlock[]) {
        const text = getTextFromBlock(block);
        if (text) parts.push(text);
      }
    }

    if (parts.length > 0) {
      parsed.push({ role, parts });
    }
  }

  return parsed;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg
      className="animate-spin h-8 w-8 text-[var(--accent)]"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}

interface ChatLogViewProps {
  rawLog: string;
}

function ChatLogView({ rawLog }: ChatLogViewProps) {
  const messages = parseChatLog(rawLog);

  if (messages.length === 0) {
    return (
      <p className="text-sm text-[var(--text)] italic px-4 pb-4">
        No chat messages to display.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3 px-4 pb-4 pt-2">
      {messages.map((msg, i) => {
        const isUser = msg.role === "user";
        return (
          <div
            key={i}
            className={`flex flex-col gap-1 ${isUser ? "items-end" : "items-start"}`}
          >
            <span
              className={`text-[10px] font-semibold uppercase tracking-widest ${
                isUser ? "text-[var(--accent)]" : "text-[var(--text)]"
              }`}
            >
              {isUser ? "Student" : "AI Tutor"}
            </span>
            {msg.parts.map((part, j) => {
              const isTool =
                part.startsWith("[Quiz:") || part.startsWith("[Checklist:") || part.startsWith("[");
              return (
                <div
                  key={j}
                  className={[
                    "max-w-[80%] rounded-xl px-3 py-2 text-sm leading-relaxed text-left",
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

interface AssessmentRowProps {
  assessment: Assessment;
  expanded: boolean;
  onToggle: () => void;
}

function AssessmentRow({ assessment, expanded, onToggle }: AssessmentRowProps) {
  return (
    <div className="border border-[var(--border)] rounded-xl overflow-hidden">
      {/* Row header — clickable */}
      <div className="flex items-center hover:bg-[var(--card-bg)] transition-colors duration-100">
        <button
          onClick={onToggle}
          className="flex-1 text-left px-4 py-3 flex items-center gap-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          {/* Chevron */}
          <span
            className={`flex-shrink-0 text-[var(--text)] transition-transform duration-150 ${
              expanded ? "rotate-90" : ""
            }`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </span>

          {/* Member name */}
          <span className="flex-1 min-w-0 text-sm font-semibold text-[var(--text-h)] truncate">
            {assessment.userName}
          </span>

          {/* Topic */}
          <span className="hidden sm:block flex-1 min-w-0 text-sm text-[var(--text)] truncate">
            {assessment.topicName}
          </span>

          {/* Score badge */}
          <span
            className={`flex-shrink-0 text-xs font-bold px-2.5 py-0.5 rounded-full ${scoreBadgeBg(
              assessment.score
            )}`}
          >
            {assessment.score}%
          </span>

          {/* Date/time */}
          <span className="flex-shrink-0 text-xs text-[var(--text)] text-right leading-tight">
            <span className="block">{formatDate(assessment.createdAt)}</span>
            <span className="block opacity-70">{formatTime(assessment.createdAt)}</span>
          </span>
        </button>
      </div>

      {/* Topic shown on mobile below name */}
      <div className="sm:hidden px-10 pb-2 text-xs text-[var(--text)]">
        {assessment.topicName}
      </div>

      {/* Expanded chat log */}
      {expanded && (
        <div className="border-t border-[var(--border)] bg-[var(--bg)]">
          <ChatLogView rawLog={assessment.chatLog} />
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Results() {
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filterUserId, setFilterUserId] = useState<string>("");
  const [filterTopic, setFilterTopic] = useState<string>("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchAll() {
      try {
        const [assessRes, usersRes] = await Promise.all([
          fetch("http://localhost:3001/api/assessments"),
          fetch("http://localhost:3001/api/users"),
        ]);

        if (!assessRes.ok)
          throw new Error(`Assessments API error: ${assessRes.status}`);
        if (!usersRes.ok)
          throw new Error(`Users API error: ${usersRes.status}`);

        const [assessData, usersData] = await Promise.all([
          assessRes.json() as Promise<Assessment[]>,
          usersRes.json() as Promise<User[]>,
        ]);

        if (!cancelled) {
          setAssessments(assessData);
          setUsers(usersData);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Could not reach the server. Make sure it is running on port 3001."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void fetchAll();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Derived data ───────────────────────────────────────────────────────────

  const uniqueTopics = Array.from(
    new Map(assessments.map((a) => [a.topicName, a.topicName])).values()
  ).sort();

  const filtered = assessments.filter((a) => {
    if (filterUserId && String(a.userId) !== filterUserId) return false;
    if (filterTopic && a.topicName !== filterTopic) return false;
    return true;
  });

  const totalAssessments = assessments.length;
  const avgScore =
    assessments.length > 0
      ? Math.round(
          assessments.reduce((sum, a) => sum + a.score, 0) / assessments.length
        )
      : null;
  const uniqueMemberCount = new Set(assessments.map((a) => a.userId)).size;

  // ── Render states ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-4 text-[var(--text)]">
          <Spinner />
          <p className="text-sm font-medium">Loading results…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-screen">
        <div className="max-w-md w-full mx-4 rounded-xl border-2 border-red-400/50 bg-red-500/10 px-6 py-5 text-center">
          <p className="text-base font-semibold text-red-400">Connection error</p>
          <p className="mt-2 text-sm text-[var(--text)]">{error}</p>
          <Link
            to="/"
            className="inline-block mt-4 text-sm text-[var(--accent)] underline"
          >
            Go back home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <main className="flex flex-col flex-1 px-4 sm:px-6 py-10 max-w-4xl mx-auto w-full text-left bg-[var(--bg)]">
      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-8 gap-4 flex-wrap">
        <div>
          <div className="inline-flex items-center gap-2 mb-2 px-3 py-1 rounded-full border border-[var(--accent-border)] bg-[var(--accent-bg)] text-xs font-semibold tracking-widest uppercase text-[var(--accent)]">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2"/></svg>
            <span>Robotics Team</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-[var(--text-h)] m-0">
            Assessment Results
          </h1>
          <p className="text-sm text-[var(--text)] mt-1">
            Review your team's learning history and performance.
          </p>
        </div>
        <Link
          to="/"
          className="flex-shrink-0 inline-flex items-center gap-2 rounded-lg border-2 border-[var(--accent)] bg-[var(--accent-bg)] px-4 py-2 text-sm font-semibold text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white transition-colors duration-150"
        >
          + Start New Assessment
        </Link>
      </div>

      {/* ── Summary stats ── */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card-bg)] px-4 py-4 text-center">
          <p className="text-2xl font-bold text-[var(--text-h)]">{totalAssessments}</p>
          <p className="text-xs font-medium uppercase tracking-widest text-[var(--text)] mt-0.5">
            Total
          </p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card-bg)] px-4 py-4 text-center">
          <p
            className={`text-2xl font-bold ${
              avgScore !== null ? scoreColor(avgScore) : "text-[var(--text)]"
            }`}
          >
            {avgScore !== null ? `${avgScore}%` : "—"}
          </p>
          <p className="text-xs font-medium uppercase tracking-widest text-[var(--text)] mt-0.5">
            Avg Score
          </p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card-bg)] px-4 py-4 text-center">
          <p className="text-2xl font-bold text-[var(--text-h)]">{uniqueMemberCount}</p>
          <p className="text-xs font-medium uppercase tracking-widest text-[var(--text)] mt-0.5">
            Members
          </p>
        </div>
      </div>

      {/* ── Filter bar ── */}
      <div className="flex gap-3 mb-5 flex-wrap">
        <select
          value={filterUserId}
          onChange={(e) => {
            setFilterUserId(e.target.value);
            setExpandedId(null);
          }}
          className="rounded-lg border border-[var(--border)] bg-[var(--card-bg)] text-[var(--text-h)] text-sm px-3 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <option value="">All members</option>
          {users.map((u) => (
            <option key={u.id} value={String(u.id)}>
              {u.name}
            </option>
          ))}
        </select>

        <select
          value={filterTopic}
          onChange={(e) => {
            setFilterTopic(e.target.value);
            setExpandedId(null);
          }}
          className="rounded-lg border border-[var(--border)] bg-[var(--card-bg)] text-[var(--text-h)] text-sm px-3 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <option value="">All topics</option>
          {uniqueTopics.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        {(filterUserId || filterTopic) && (
          <button
            onClick={() => {
              setFilterUserId("");
              setFilterTopic("");
              setExpandedId(null);
            }}
            className="text-xs text-[var(--text)] underline hover:text-[var(--accent)] transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* ── Column headers ── */}
      {filtered.length > 0 && (
        <div className="hidden sm:flex items-center gap-4 px-4 pb-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--text)]">
          <span className="w-4 flex-shrink-0" />
          <span className="flex-1">Member</span>
          <span className="flex-1">Topic</span>
          <span className="w-16 text-center">Score</span>
          <span className="w-24 text-right">Date</span>
        </div>
      )}

      {/* ── Assessment list ── */}
      <div className="flex flex-col gap-2">
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-[var(--border)] px-6 py-10 text-center text-sm text-[var(--text)]">
            {assessments.length === 0
              ? "No assessments recorded yet."
              : "No results match the current filters."}
          </div>
        ) : (
          filtered.map((a) => (
            <AssessmentRow
              key={a.id}
              assessment={a}
              expanded={expandedId === a.id}
              onToggle={() =>
                setExpandedId((prev) => (prev === a.id ? null : a.id))
              }
            />
          ))
        )}
      </div>

      {filtered.length > 0 && (
        <p className="mt-4 text-xs text-[var(--text)] text-center">
          Showing {filtered.length} of {totalAssessments} assessment
          {totalAssessments !== 1 ? "s" : ""}
        </p>
      )}
    </main>
  );
}
