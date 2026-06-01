import React, { useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import QuizWidget, { type QuizWidgetProps, type QuizAnswer } from "../components/quiz-widget";
import ChecklistWidget, { type ChecklistWidgetProps } from "../components/checklist-widget";
import DragOrderWidget, { type DragOrderWidgetProps, type DragOrderAnswer } from "../components/drag-order-widget";
import ScenarioWidget, { type ScenarioWidgetProps, type ScenarioAnswer } from "../components/scenario-widget";
import CodeRunnerWidget, { type CodeRunnerWidgetProps, type CodeRunnerAnswer } from "../components/code-runner-widget";
import LabeledDiagramWidget, { type LabeledDiagramWidgetProps } from "../components/labeled-diagram-widget";

// ── Types ─────────────────────────────────────────────────────────────────────

interface User {
  id: number;
  name: string;
  createdAt: string | null;
  hasPassword?: number; // 1 when password_hash is set, 0 otherwise
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

interface TextPart { kind: "text"; text: string }
interface WidgetPart { kind: "widget"; toolName: string; args: Record<string, unknown>; answer: unknown }
type MsgPart = TextPart | WidgetPart;

interface ParsedMessage {
  role: "user" | "assistant";
  parts: MsgPart[];
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
    const parts: MsgPart[] = [];

    if (Array.isArray(msg.parts)) {
      for (const part of msg.parts as Record<string, unknown>[]) {
        const pType = typeof part.type === "string" ? part.type : "";
        if (pType === "text" && typeof part.text === "string" && (part.text as string).trim()) {
          parts.push({ kind: "text", text: (part.text as string).trim() });
        } else if (pType.startsWith("tool-") && pType !== "tool-result") {
          // AI SDK v5+: tool parts have type "tool-<toolName>", e.g. "tool-showQuiz"
          const toolName = pType.slice("tool-".length);
          const args = (part.input ?? part.args) as Record<string, unknown> | undefined;
          const output = part.output as Record<string, unknown> | undefined;
          const answer = output && typeof output === "object" ? output.answer : undefined;
          if (args && toolName) {
            parts.push({ kind: "widget", toolName, args, answer });
          }
        } else if ((pType === "tool-invocation" || pType === "tool") && part) {
          // Legacy fallback for older logs
          const args = (part.input ?? part.args) as Record<string, unknown> | undefined;
          const toolName = String(part.toolName ?? part.name ?? "");
          const output = part.output as Record<string, unknown> | undefined;
          const answer = output && typeof output === "object" ? output.answer : undefined;
          if (args && toolName) {
            parts.push({ kind: "widget", toolName, args, answer });
          }
        }
      }
    } else if (typeof msg.content === "string" && (msg.content as string).trim()) {
      parts.push({ kind: "text", text: (msg.content as string).trim() });
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
              if (part.kind === "text") {
                return (
                  <div
                    key={j}
                    className={[
                      "max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed text-left",
                      isUser
                        ? "bg-[var(--accent)] text-white"
                        : "bg-[var(--card-bg)] text-[var(--text-h)]",
                    ].join(" ")}
                  >
                    {part.text}
                  </div>
                );
              }

              // Widget parts — render the real component, pre-filled with the student's answer (read-only)
              const { toolName, args, answer } = part;
              if (toolName === "showQuiz") {
                return (
                  <QuizWidget
                    key={j}
                    question={args.question as QuizWidgetProps["question"]}
                    options={args.options as QuizWidgetProps["options"]}
                    correctIndex={args.correctIndex as QuizWidgetProps["correctIndex"]}
                    answer={answer as QuizAnswer | undefined}
                  />
                );
              }
              if (toolName === "showChecklist") {
                return (
                  <ChecklistWidget
                    key={j}
                    title={args.title as ChecklistWidgetProps["title"]}
                    items={args.items as ChecklistWidgetProps["items"]}
                  />
                );
              }
              if (toolName === "showDragOrder") {
                return (
                  <DragOrderWidget
                    key={j}
                    instruction={args.instruction as DragOrderWidgetProps["instruction"]}
                    items={args.items as DragOrderWidgetProps["items"]}
                    answer={answer as DragOrderAnswer | undefined}
                  />
                );
              }
              if (toolName === "showScenario") {
                return (
                  <ScenarioWidget
                    key={j}
                    title={args.title as ScenarioWidgetProps["title"]}
                    scenario={args.scenario as ScenarioWidgetProps["scenario"]}
                    steps={args.steps as ScenarioWidgetProps["steps"]}
                    answer={answer as ScenarioAnswer | undefined}
                  />
                );
              }
              if (toolName === "showCodeRunner") {
                return (
                  <CodeRunnerWidget
                    key={j}
                    prompt={args.prompt as CodeRunnerWidgetProps["prompt"]}
                    language={args.language as CodeRunnerWidgetProps["language"]}
                    starterCode={args.starterCode as CodeRunnerWidgetProps["starterCode"]}
                    expectedPatterns={args.expectedPatterns as CodeRunnerWidgetProps["expectedPatterns"]}
                    solutionCode={args.solutionCode as CodeRunnerWidgetProps["solutionCode"]}
                    answer={answer as CodeRunnerAnswer | undefined}
                  />
                );
              }
              if (toolName === "showLabeledDiagram") {
                return (
                  <LabeledDiagramWidget
                    key={j}
                    title={args.title as LabeledDiagramWidgetProps["title"]}
                    description={args.description as LabeledDiagramWidgetProps["description"]}
                    parts={args.parts as LabeledDiagramWidgetProps["parts"]}
                  />
                );
              }
              // Unknown tool — fallback label
              return (
                <div key={j} className="text-xs text-[var(--accent)] font-mono bg-[var(--accent-bg)] border border-[var(--accent-border)] rounded-xl px-3 py-2">
                  [{toolName}]
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

type Tab = "overview" | "knowledge" | "roster" | "access";

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
    { id: "access", label: "Access", icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
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
  onClearHistory,
}: {
  users: User[];
  topics: Topic[];
  assessments: Assessment[];
  onDeleteAssessment: (id: number) => Promise<void>;
  onEditScore: (id: number, score: number) => Promise<void>;
  onClearHistory: (userId: number) => Promise<void>;
}) {
  const [expandedMemberId, setExpandedMemberId] = useState<number | null>(null);
  const [expandedAssessmentId, setExpandedAssessmentId] = useState<number | null>(null);
  const [editingScoreId, setEditingScoreId] = useState<number | null>(null);
  const [editScoreValue, setEditScoreValue] = useState("");
  const [confirmClearId, setConfirmClearId] = useState<number | null>(null);
  const [clearingId, setClearingId] = useState<number | null>(null);

  function commitScore(assessmentId: number) {
    const v = Math.max(0, Math.min(100, parseInt(editScoreValue, 10)));
    if (!isNaN(v)) void onEditScore(assessmentId, v).then(() => setEditingScoreId(null));
  }

  async function clearHistory(userId: number) {
    setClearingId(userId);
    setConfirmClearId(null);
    await onClearHistory(userId);
    setClearingId(null);
    // Reset expanded state since there are no sessions left
    setExpandedMemberId(null);
  }

  const [summaries, setSummaries] = useState<Record<number, MemberSummary>>({});
  const hasFetchedRef = useRef(false);

  // ── Generate AI narrative summaries for all members ──────────────────────

  const generateSummaries = useCallback(() => {
    if (users.length === 0) return;
    hasFetchedRef.current = true;

    const initial: Record<number, MemberSummary> = {};
    for (const user of users) {
      initial[user.id] = { summary: "", score: null, loading: true };
    }
    setSummaries(initial);

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

  // Objective member score: average of that member's stored assessment scores
  function memberScore(userId: number): number | null {
    const scores = assessments
      .filter((a) => a.userId === userId)
      .map((a) => a.score);
    if (scores.length === 0) return null;
    return Math.round(scores.reduce((s, n) => s + n, 0) / scores.length);
  }

  // Team avg: average of all members who have at least one assessment
  const membersWithScores = users.map((u) => memberScore(u.id)).filter((s): s is number => s !== null);
  const teamAvg = membersWithScores.length > 0
    ? Math.round(membersWithScores.reduce((a, b) => a + b, 0) / membersWithScores.length)
    : null;

  // Sort by score descending; unassessed members go to the end
  const sortedUsers = [...users].sort((a, b) => {
    const sa = memberScore(a.id) ?? -1;
    const sb = memberScore(b.id) ?? -1;
    return sb - sa;
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
              const score = memberScore(user.id);
              const isConfirmingClear = confirmClearId === user.id;
              const isClearing = clearingId === user.id;
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
                          setConfirmClearId(null);
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

                      {/* Objective score badge — computed from stored assessment data */}
                      {score !== null ? (
                        <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full flex-shrink-0 ${scoreBadgeBg(score)}`}>
                          {score}%
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--text)] opacity-40 flex-shrink-0">Not assessed</span>
                      )}
                    </div>

                    {/* AI narrative summary */}
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

                  {/* Expanded: individual assessment history + clear history action */}
                  {isExpanded && (
                    <div className="border-t border-[var(--border)] bg-[var(--bg)] px-4 py-3">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text)] opacity-60">Session History</p>

                        {/* Clear history */}
                        {memberAssessments.length > 0 && (
                          isConfirmingClear ? (
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-[var(--text)] opacity-70">Clear all {memberAssessments.length} session{memberAssessments.length !== 1 ? "s" : ""}?</span>
                              <button
                                onClick={() => void clearHistory(user.id)}
                                disabled={isClearing}
                                className="px-2 py-0.5 rounded text-xs font-semibold bg-red-500/15 text-red-400 border border-red-400/30 hover:bg-red-500/25 transition-colors"
                              >
                                {isClearing ? "Clearing…" : "Confirm"}
                              </button>
                              <button
                                onClick={() => setConfirmClearId(null)}
                                className="px-2 py-0.5 rounded text-xs text-[var(--text)] border border-[var(--border)] hover:text-[var(--text-h)] transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmClearId(user.id)}
                              className="flex items-center gap-1 text-xs text-[var(--text)] opacity-40 hover:opacity-100 hover:text-red-400 transition-all"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                              </svg>
                              Clear history
                            </button>
                          )
                        )}
                      </div>
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
                                        if (e.key === "Enter") commitScore(a.id);
                                        if (e.key === "Escape") setEditingScoreId(null);
                                      }}
                                      autoFocus
                                      className="w-14 rounded-md border border-[var(--accent)] bg-[var(--card-bg)] text-[var(--text-h)] text-xs font-bold text-center px-1 py-0.5 focus:outline-none"
                                    />
                                    <button
                                      onClick={() => commitScore(a.id)}
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
  onResetPassword,
}: {
  users: User[];
  assessments: Assessment[];
  onUsersChange: () => void;
  onResetPassword: (userId: number) => Promise<void>;
}) {
  const [addName, setAddName] = useState("");
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [confirmResetId, setConfirmResetId] = useState<number | null>(null);
  const [resettingId, setResettingId] = useState<number | null>(null);

  async function resetPassword(userId: number) {
    setConfirmResetId(null);
    setResettingId(userId);
    try {
      await onResetPassword(userId);
    } finally {
      setResettingId(null);
    }
  }

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
              const isConfirmingReset = confirmResetId === user.id;
              const isResetting = resettingId === user.id;
              const hasPassword = user.hasPassword === 1;
              return (
                <div
                  key={user.id}
                  className="flex items-center gap-4 rounded-xl border border-[var(--border)] px-4 py-3 bg-[var(--card-bg)]"
                >
                  <div className="flex-1 min-w-0 flex items-center gap-2">
                    <span className="text-sm font-medium text-[var(--text-h)] truncate">{user.name}</span>
                    {!hasPassword && (
                      <span
                        title="Hasn't set a password yet — the password they enter on first login will become theirs."
                        className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-yellow-900/40 text-yellow-300 border border-yellow-700/40 flex-shrink-0"
                      >
                        Unclaimed
                      </span>
                    )}
                  </div>
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
                  {isConfirmingReset ? (
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className="text-xs text-[var(--text)] opacity-70">Reset password?</span>
                      <button
                        onClick={() => void resetPassword(user.id)}
                        disabled={isResetting}
                        className="px-2.5 py-1 rounded-lg bg-[var(--accent-bg)] text-[var(--accent)] border border-[var(--accent-border)] text-xs font-semibold hover:opacity-80 transition-colors"
                      >
                        {isResetting ? "Resetting…" : "Confirm"}
                      </button>
                      <button
                        onClick={() => setConfirmResetId(null)}
                        className="px-2.5 py-1 rounded-lg border border-[var(--border)] text-[var(--text)] text-xs font-semibold hover:text-[var(--text-h)] transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : isConfirming ? (
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
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {hasPassword && (
                      <button
                        onClick={() => setConfirmResetId(user.id)}
                        title="Reset password — the student's next login will claim a new one"
                        className="p-1.5 rounded-lg text-[var(--text)] opacity-40 hover:opacity-100 hover:text-[var(--accent)] hover:bg-[var(--accent-bg)] transition-all"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                          <path d="M7 11V7a5 5 0 0 1 9.9-1"/>
                        </svg>
                      </button>
                    )}
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
                  </div>
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

// ── Access tab ────────────────────────────────────────────────────────────────

interface ManagedUser {
  id: number;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  status: "pending" | "approved" | "rejected";
  role: "student" | "admin" | "manager";
  createdAt: string | null;
}

type SectionDef = {
  id: string;
  label: string;
  count: number;
  countColor: string;
  emptyText: string;
  rows: ManagedUser[];
  extra?: React.ReactNode;
};

function statusBadge(status: ManagedUser["status"]): string {
  if (status === "approved") return "bg-emerald-900/40 text-emerald-300 border-emerald-700/40";
  if (status === "pending") return "bg-yellow-900/40 text-yellow-300 border-yellow-700/40";
  return "bg-red-900/40 text-red-400 border-red-700/40";
}

function RoleBadge({ role }: { role: ManagedUser["role"] }) {
  if (role === "manager") return (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wide flex-shrink-0 bg-purple-900/40 text-purple-300 border-purple-700/40">
      Manager
    </span>
  );
  if (role === "admin") return (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wide flex-shrink-0 bg-[var(--accent-bg)] text-[var(--accent)] border-[var(--accent-border)]">
      Admin
    </span>
  );
  return null;
}

interface UserRowProps {
  user: ManagedUser;
  showActions: boolean;
  pendingRole: "student" | "admin" | "manager" | undefined;
  actingId: number | null;
  savingRoles: boolean;
  isManager: boolean;
  onStageRole: (id: number, role: "student" | "admin" | "manager") => void;
  onApprove: (id: number) => Promise<void>;
  onReject: (id: number) => Promise<void>;
  onRemove: (id: number) => Promise<void>;
}

function UserRow({ user, showActions, pendingRole, actingId, savingRoles, isManager, onStageRole, onApprove, onReject, onRemove }: UserRowProps) {
  const effectiveRole = pendingRole ?? user.role;
  const userIsManager = effectiveRole === "manager";
  const userIsAdmin = effectiveRole === "admin";
  const userIsStudent = effectiveRole === "student";
  const hasPendingChange = pendingRole !== undefined;
  return (
    <div className={`flex items-center gap-3 px-6 py-3 transition-colors ${hasPendingChange ? "bg-yellow-500/5" : "hover:bg-[var(--card-bg)]/60"}`}>
      {user.avatarUrl ? (
        <img src={user.avatarUrl} alt={user.name} className="w-8 h-8 rounded-full flex-shrink-0" />
      ) : (
        <span className="w-8 h-8 rounded-full bg-[var(--accent-bg)] border border-[var(--accent-border)] flex items-center justify-center text-xs font-bold text-[var(--accent)] flex-shrink-0">
          {user.name.charAt(0).toUpperCase()}
        </span>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-[var(--text-h)] truncate">{user.name}</p>
          <RoleBadge role={user.role} />
          {hasPendingChange && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wide flex-shrink-0 bg-yellow-900/40 text-yellow-300 border-yellow-700/40">
              → {pendingRole}
            </span>
          )}
        </div>
        <p className="text-xs text-[var(--text)] opacity-60 truncate">{user.email ?? "—"}</p>
      </div>
      {user.status !== "approved" && (
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wide flex-shrink-0 ${statusBadge(user.status)}`}>
          {user.status}
        </span>
      )}
      {showActions && (
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {user.status !== "approved" && (
            <button
              onClick={() => void onApprove(user.id)}
              disabled={actingId === user.id || savingRoles}
              className="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-400/30 text-xs font-semibold hover:bg-emerald-500/25 disabled:opacity-40 transition-colors"
            >
              Approve
            </button>
          )}

          {isManager && (
            <>
              {userIsManager && (
                <button
                  onClick={() => onStageRole(user.id, "admin")}
                  disabled={savingRoles}
                  className="px-2.5 py-1 rounded-lg bg-purple-900/30 text-purple-300 border border-purple-700/40 text-xs font-semibold hover:opacity-75 disabled:opacity-40 transition-colors"
                >
                  Remove Manager
                </button>
              )}
              {userIsAdmin && (
                <>
                  <button
                    onClick={() => onStageRole(user.id, "manager")}
                    disabled={savingRoles}
                    className="px-2.5 py-1 rounded-lg bg-purple-900/30 text-purple-300 border border-purple-700/40 text-xs font-semibold hover:opacity-75 disabled:opacity-40 transition-colors"
                  >
                    Make Manager
                  </button>
                  <button
                    onClick={() => onStageRole(user.id, "student")}
                    disabled={savingRoles}
                    className="px-2.5 py-1 rounded-lg bg-[var(--accent-bg)] text-[var(--accent)] border border-[var(--accent-border)] text-xs font-semibold hover:opacity-75 disabled:opacity-40 transition-colors"
                  >
                    Remove Admin
                  </button>
                </>
              )}
              {userIsStudent && (
                <>
                  <button
                    onClick={() => onStageRole(user.id, "manager")}
                    disabled={savingRoles}
                    className="px-2.5 py-1 rounded-lg bg-purple-900/30 text-purple-300 border border-purple-700/40 text-xs font-semibold hover:opacity-75 disabled:opacity-40 transition-colors"
                  >
                    Make Manager
                  </button>
                  <button
                    onClick={() => onStageRole(user.id, "admin")}
                    disabled={savingRoles}
                    className="px-2.5 py-1 rounded-lg bg-[var(--accent-bg)] text-[var(--accent)] border border-[var(--accent-border)] text-xs font-semibold hover:opacity-75 disabled:opacity-40 transition-colors"
                  >
                    Make Admin
                  </button>
                </>
              )}
            </>
          )}

          {!userIsManager && (
            <>
              {user.status !== "rejected" && !userIsAdmin && (
                <button
                  onClick={() => void onReject(user.id)}
                  disabled={actingId === user.id || savingRoles}
                  className="px-2.5 py-1 rounded-lg bg-red-500/15 text-red-400 border border-red-400/30 text-xs font-semibold hover:bg-red-500/25 disabled:opacity-40 transition-colors"
                >
                  Reject
                </button>
              )}
              <button
                onClick={() => void onRemove(user.id)}
                disabled={actingId === user.id || savingRoles}
                title="Remove user"
                className="p-1.5 rounded-lg text-[var(--text)] opacity-40 hover:opacity-100 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-20 transition-all"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  <path d="M10 11v6M14 11v6" />
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                </svg>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function AccessTab({ token, currentRole }: { token: string | null; currentRole: "student" | "admin" | "manager" }) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<number | null>(null);
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(["pending", "managers", "admins", "students", "rejected"]));
  const [pendingRoles, setPendingRoles] = useState<Record<number, "student" | "admin" | "manager">>({});
  const [savingRoles, setSavingRoles] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  function toggleSection(id: string) {
    setOpenSections((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const authHeader = token ? { Authorization: `Bearer ${token}` } : {};

  async function fetchUsers() {
    setLoading(true);
    setAuthError(null);
    try {
      const res = await fetch("http://localhost:3001/api/admin/all-users", {
        headers: authHeader,
      });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          setAuthError("This section requires manager access.");
        } else {
          setAuthError(`Server error (${res.status}).`);
        }
        setUsers([]);
        return;
      }
      const data = await res.json();
      if (!Array.isArray(data)) {
        setAuthError("Unexpected server response.");
        setUsers([]);
        return;
      }
      setUsers(data as ManagedUser[]);
    } catch {
      setAuthError("Could not reach the server.");
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void fetchUsers(); }, []);

  async function approve(id: number) {
    setActingId(id);
    await fetch(`http://localhost:3001/api/admin/users/${id}/approve`, {
      method: "POST",
      headers: authHeader,
    });
    setUsers((prev) => prev.map((u) => u.id === id ? { ...u, status: "approved" } : u));
    setActingId(null);
  }

  async function reject(id: number) {
    setActingId(id);
    await fetch(`http://localhost:3001/api/admin/users/${id}/reject`, {
      method: "POST",
      headers: authHeader,
    });
    setUsers((prev) => prev.map((u) => u.id === id ? { ...u, status: "rejected" } : u));
    setActingId(null);
  }

  async function approveAll() {
    const pendingIds = users.filter((u) => u.status === "pending").map((u) => u.id);
    if (pendingIds.length === 0) return;
    if (!confirm(`Approve all ${pendingIds.length} pending user${pendingIds.length !== 1 ? "s" : ""}?`)) return;

    await Promise.all(
      pendingIds.map((id) =>
        fetch(`http://localhost:3001/api/admin/users/${id}/approve`, {
          method: "POST",
          headers: authHeader,
        })
      )
    );
    setUsers((prev) => prev.map((u) => pendingIds.includes(u.id) ? { ...u, status: "approved" } : u));
  }

  async function remove(id: number) {
    if (!confirm("Permanently remove this user and all their data?")) return;
    setActingId(id);
    await fetch(`http://localhost:3001/api/admin/users/${id}/remove`, {
      method: "POST",
      headers: authHeader,
    });
    setUsers((prev) => prev.filter((u) => u.id !== id));
    setActingId(null);
  }

  function stageRole(id: number, role: "student" | "admin" | "manager") {
    setSaveError(null);
    const current = users.find((u) => u.id === id);
    setPendingRoles((prev) => {
      const next = { ...prev };
      if (current && current.role === role) {
        // Reverting to current role — drop the pending change
        delete next[id];
      } else {
        next[id] = role;
      }
      return next;
    });
  }

  function discardPendingRoles() {
    setPendingRoles({});
    setSaveError(null);
  }

  async function savePendingRoles() {
    const entries = Object.entries(pendingRoles);
    if (entries.length === 0) return;
    setSavingRoles(true);
    setSaveError(null);
    let failed = 0;
    for (const [idStr, role] of entries) {
      const res = await fetch(`http://localhost:3001/api/admin/users/${idStr}/set-role`, {
        method: "POST",
        headers: { ...authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) failed++;
    }
    if (failed > 0) {
      setSaveError(`${failed} of ${entries.length} change(s) failed. Make sure you're signed in as a manager.`);
    } else {
      setPendingRoles({});
    }
    await fetchUsers();
    setSavingRoles(false);
  }

  const isManager = currentRole === "manager";
  const pending = users.filter((u) => u.status === "pending");
  const managers = users.filter((u) => u.status === "approved" && u.role === "manager");
  const admins = users.filter((u) => u.status === "approved" && u.role === "admin");
  const students = users.filter((u) => u.status === "approved" && u.role === "student");
  const rejected = users.filter((u) => u.status === "rejected");

  if (loading) {
    return <p className="text-sm text-[var(--text)] animate-pulse">Loading users…</p>;
  }

  if (authError) {
    return (
      <div className="rounded-xl border-2 border-yellow-500/40 bg-yellow-500/10 px-5 py-4 text-sm text-yellow-300">
        <p className="font-semibold mb-1">Admin access required</p>
        <p className="text-yellow-200/80">{authError}</p>
      </div>
    );
  }

  const sections: SectionDef[] = [
    {
      id: "pending",
      label: "Needs Review",
      count: pending.length,
      countColor: "bg-yellow-900/40 text-yellow-300 border-yellow-700/40",
      emptyText: "No pending requests.",
      rows: pending,
      extra: pending.length > 1 ? (
        <button
          onClick={(e) => { e.stopPropagation(); void approveAll(); }}
          className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-400/30 text-xs font-semibold hover:bg-emerald-500/25 transition-colors"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Approve All
        </button>
      ) : undefined,
    },
    {
      id: "managers",
      label: "Managers",
      count: managers.length,
      countColor: "bg-purple-900/40 text-purple-300 border-purple-700/40",
      emptyText: "No managers yet.",
      rows: managers,
    },
    {
      id: "admins",
      label: "Admins",
      count: admins.length,
      countColor: "bg-[var(--accent-bg)] text-[var(--accent)] border-[var(--accent-border)]",
      emptyText: "No admins yet.",
      rows: admins,
    },
    {
      id: "students",
      label: "Students",
      count: students.length,
      countColor: "bg-[var(--border)]/60 text-[var(--text)] border-[var(--border)]",
      emptyText: "No approved students yet.",
      rows: students,
    },
    {
      id: "rejected",
      label: "Rejected",
      count: rejected.length,
      countColor: "bg-red-900/40 text-red-400 border-red-700/40",
      emptyText: "No rejected users.",
      rows: rejected,
    },
  ];

  const pendingCount = Object.keys(pendingRoles).length;

  return (
    <div className="space-y-4">
      {/* Save bar — shown when there are unsaved role changes */}
      {pendingCount > 0 && (
        <div className="sticky top-0 z-10 flex items-center gap-3 rounded-xl border-2 border-[var(--accent-border)] bg-[var(--accent-bg)] px-4 py-3 backdrop-blur-sm">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--accent)] flex-shrink-0">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span className="text-sm font-semibold text-[var(--text-h)]">
            {pendingCount} unsaved role change{pendingCount !== 1 ? "s" : ""}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={discardPendingRoles}
              disabled={savingRoles}
              className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--text)] text-xs font-semibold hover:text-[var(--text-h)] hover:border-[var(--text)] disabled:opacity-40 transition-colors"
            >
              Discard
            </button>
            <button
              onClick={() => void savePendingRoles()}
              disabled={savingRoles}
              className="px-4 py-1.5 rounded-lg bg-[var(--accent)] text-white text-xs font-bold hover:opacity-85 disabled:opacity-50 transition-opacity"
            >
              {savingRoles ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>
      )}

      {saveError && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {saveError}
        </div>
      )}

      <div className="rounded-xl border border-[var(--border)] overflow-hidden divide-y divide-[var(--border)]">
        {sections.map((section) => {
        const isOpen = openSections.has(section.id);
        return (
          <div key={section.id}>
            <button
              onClick={() => toggleSection(section.id)}
              className="w-full flex items-center gap-3 px-5 py-4 bg-[var(--card-bg)] hover:bg-[var(--border)]/20 transition-colors text-left"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="13" height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`flex-shrink-0 text-[var(--text)] transition-transform duration-150 ${isOpen ? "rotate-90" : ""}`}
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
              <span className="text-sm font-semibold uppercase tracking-widest text-[var(--text-h)]">
                {section.label}
              </span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${section.countColor}`}>
                {section.count}
              </span>
              {section.extra && <div className="ml-auto">{section.extra}</div>}
            </button>

            {isOpen && (
              <div className="bg-[var(--bg)] divide-y divide-[var(--border)]">
                {section.rows.length === 0 ? (
                  <p className="px-6 py-4 text-sm text-[var(--text)] italic opacity-60">{section.emptyText}</p>
                ) : (
                  section.rows.map((u) => (
                    <UserRow
                      key={u.id}
                      user={u}
                      showActions
                      pendingRole={pendingRoles[u.id]}
                      actingId={actingId}
                      savingRoles={savingRoles}
                      isManager={isManager}
                      onStageRole={stageRole}
                      onApprove={approve}
                      onReject={reject}
                      onRemove={remove}
                    />
                  ))
                )}
              </div>
            )}
          </div>
        );
      })}
      </div>
    </div>
  );
}

// ── Main Admin page ───────────────────────────────────────────────────────────

export default function Admin() {
  const { token, user: authUser } = useAuth();
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

  async function handleClearHistory(userId: number) {
    await fetch(`http://localhost:3001/api/admin/users/${userId}/assessments`, { method: "DELETE" });
    setAssessments((prev) => prev.filter((a) => a.userId !== userId));
  }

  async function handleResetPassword(userId: number) {
    const res = await fetch(`http://localhost:3001/api/admin/users/${userId}/reset-password`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (res.ok) {
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, hasPassword: 0 } : u)));
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
        <OverviewTab users={users} topics={topics} assessments={assessments} onDeleteAssessment={handleDeleteAssessment} onEditScore={handleEditScore} onClearHistory={handleClearHistory} />
      )}
      {activeTab === "knowledge" && (
        <KnowledgeTab topics={topics} onTopicsChange={() => void fetchAll()} />
      )}
      {activeTab === "roster" && (
        <RosterTab users={users} assessments={assessments} onUsersChange={() => void fetchAll()} onResetPassword={handleResetPassword} />
      )}
      {activeTab === "access" && (
        <AccessTab token={token} currentRole={authUser?.role ?? "student"} />
      )}
    </main>
  );
}
