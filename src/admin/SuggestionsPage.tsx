import { useCallback, useEffect, useState } from "react";
import { Inbox, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { adminApi, type Draft, type ReviewProgress, type ReviewStatus } from "./admin-api";
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
  const { refreshCounts, appliedCount } = useAdmin();
  const [tab, setTab] = useState<"pending" | "past">("pending");
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [review, setReview] = useState<ReviewStatus | null>(null);
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

  // Also reload when the prompt assistant applies one of these suggestions.
  useEffect(() => {
    void load();
  }, [load, appliedCount]);

  // While a review runs (this admin's or anyone's), check its progress.
  const busy = running || !!review?.running;
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => {
      adminApi
        .review()
        .then(setReview)
        .catch(() => {});
    }, 1_500);
    return () => clearInterval(timer);
  }, [busy]);

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
          <Button variant="primary" onClick={() => void runReview()} disabled={busy}>
            {busy ? <Spinner /> : <Sparkles />}
            {busy ? "Reviewing chats…" : "Review recent chats"}
          </Button>
        }
      />

      {busy ? <ReviewProgressBar progress={review?.progress ?? null} /> : null}

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
            ? "Run a review, or ask the prompt assistant for a change."
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

function ReviewProgressBar({ progress }: { progress: ReviewProgress | null }) {
  const reading = progress?.step === "reading";
  const label = !progress
    ? "Picking chats to review…"
    : reading
      ? `Reading chats — ${progress.done} of ${progress.total}`
      : "Writing suggestions…";
  const percent = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="mb-6 rounded-2xl border border-line bg-surface p-4">
      <p className="mb-2 text-sm font-medium" aria-live="polite">
        {label}
      </p>
      <div className="h-2 overflow-hidden rounded-full bg-surface-2">
        <div
          className={cn(
            "h-full rounded-full bg-accent transition-[width] duration-500",
            progress && !reading && "animate-pulse",
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
