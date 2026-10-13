import { useCallback, useEffect, useState } from "react";
import { Inbox, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { adminApi, type Draft, type ReviewOutcome } from "./admin-api";
import { useAdmin } from "./admin-context";
import { errorMessage } from "../lib/api";
import { timeAgo } from "../lib/time";
import { cn } from "../lib/cn";
import { Button } from "../components/ui/button";
import { EmptyState, Skeleton, Spinner } from "../components/ui/misc";
import { Markdown } from "../components/markdown";
import { PageHeader } from "./components/page-header";
import { DraftCard } from "./components/draft-card";

export default function SuggestionsPage() {
  const { refreshCounts } = useAdmin();
  const [tab, setTab] = useState<"pending" | "past">("pending");
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [review, setReview] = useState<{ running: boolean; last: ReviewOutcome | null } | null>(null);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    try {
      const [d, r] = await Promise.all([adminApi.drafts(), adminApi.review()]);
      setDrafts(d.drafts);
      setReview(r);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function runReview() {
    setRunning(true);
    try {
      const outcome = await adminApi.runReview();
      toast.success(
        outcome.draftIds.length
          ? `Review done — ${outcome.draftIds.length} new suggestion${outcome.draftIds.length === 1 ? "" : "s"}.`
          : "Review done — no changes suggested.",
      );
      await load();
      refreshCounts();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setRunning(false);
    }
  }

  const pending = drafts?.filter((d) => d.status === "pending") ?? [];
  const past = drafts?.filter((d) => d.status !== "pending") ?? [];
  const shown = tab === "pending" ? pending : past;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        title="Suggestions"
        description="The AI reviews recent student chats once a day (👎 answers first) and suggests changes to its own prompt. Nothing changes until you apply a suggestion."
        actions={
          <Button variant="primary" onClick={() => void runReview()} disabled={running || review?.running}>
            {running || review?.running ? <Spinner /> : <Sparkles />}
            {running || review?.running ? "Reviewing chats…" : "Review recent chats"}
          </Button>
        }
      />

      {review?.last ? (
        <div className="mb-6 rounded-2xl border border-line bg-surface p-4">
          <p className="mb-1.5 text-xs font-medium text-muted">
            Last review · {timeAgo(review.last.at)} · {review.last.chatCount} chat{review.last.chatCount === 1 ? "" : "s"} read
          </p>
          <Markdown text={review.last.summary} className="text-sm" />
        </div>
      ) : null}

      <div className="mb-4 inline-flex rounded-xl bg-surface-2 p-1">
        {(
          [
            ["pending", `Waiting (${pending.length})`],
            ["past", "Past"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              tab === value ? "bg-surface text-fg shadow-soft" : "text-muted hover:text-fg",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {drafts === null ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-36 rounded-2xl" />
          <Skeleton className="h-36 rounded-2xl" />
        </div>
      ) : shown.length === 0 ? (
        <EmptyState icon={<Inbox />} title={tab === "pending" ? "No suggestions waiting" : "Nothing here yet"}>
          {tab === "pending"
            ? "Run a review, or ask the prompt assistant for a change on the Prompt page."
            : "Applied and dismissed suggestions show up here."}
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-4">
          {shown.map((d) => (
            <DraftCard
              key={d.id}
              draft={d}
              defaultOpen={tab === "pending" && shown.length <= 2}
              onChanged={(next) => {
                setDrafts((prev) => prev?.map((x) => (x.id === next.id ? next : x)) ?? null);
                refreshCounts();
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
