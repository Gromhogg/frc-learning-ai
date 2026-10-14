import { useMemo, useState } from "react";
import { AlertTriangle, Bot, Check, ChevronDown, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { adminApi, type Draft } from "../admin-api";
import { diffSections, totalStat } from "../section-diff";
import { ApiError, errorMessage } from "../../lib/api";
import { timeAgo } from "../../lib/time";
import { cn } from "../../lib/cn";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/misc";
import { ConfirmDialog } from "../../components/ui/dialog";
import { SectionChanges } from "./diff-view";

/**
 * One proposed prompt change: why, what changes, and Apply / Dismiss.
 * Nothing reaches students until an admin presses Apply.
 */
export function DraftCard({
  draft,
  onChanged,
  defaultOpen = false,
  compact = false,
}: {
  draft: Draft;
  onChanged: (draft: Draft) => void;
  defaultOpen?: boolean;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [busy, setBusy] = useState(false);
  const [staleConfirm, setStaleConfirm] = useState(false);
  const changes = useMemo(() => diffSections(draft.baseSections, draft.sections), [draft]);
  const stat = useMemo(() => totalStat(changes), [changes]);
  const pending = draft.status === "pending";

  async function apply(onTopOfLatest = false) {
    setBusy(true);
    try {
      const result = await adminApi.applyDraft(draft.id, onTopOfLatest);
      toast.success(`Applied — the AI now uses v${result.version}.`);
      onChanged({ ...draft, status: "applied", appliedVersion: result.version, stale: false });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && (err.body as { stale?: boolean })?.stale) {
        setStaleConfirm(true);
      } else {
        toast.error(errorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  }

  async function dismiss() {
    setBusy(true);
    try {
      await adminApi.dismissDraft(draft.id);
      onChanged({ ...draft, status: "dismissed" });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border bg-surface transition-colors",
        pending ? "border-accent-line shadow-soft" : "border-line",
      )}
    >
      <div className={cn("flex items-start gap-3", compact ? "p-3.5" : "p-4")}>
        <span
          className={cn(
            "mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-xl",
            pending ? "bg-accent-soft text-accent-text" : "bg-surface-2 text-muted",
          )}
        >
          {draft.source === "review" ? <Sparkles className="size-4" /> : <Bot className="size-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="font-medium">{draft.title}</p>
            {draft.status === "applied" ? (
              <Badge tone="good">Applied{draft.appliedVersion ? ` · v${draft.appliedVersion}` : ""}</Badge>
            ) : draft.status === "dismissed" ? (
              <Badge>Dismissed</Badge>
            ) : draft.stale ? (
              <Badge tone="warn">Prompt changed since</Badge>
            ) : (
              <Badge tone="accent">Waiting for you</Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-fg-2">{draft.reason}</p>
          <p className="mt-1.5 text-xs text-muted">
            {draft.source === "review" ? "From the chat reviewer" : `Asked by ${draft.createdByName ?? "an admin"}`} ·{" "}
            {timeAgo(draft.createdAt)} · based on v{draft.baseVersion}
            {draft.evidence.length > 0 ? ` · ${draft.evidence.length} chat${draft.evidence.length === 1 ? "" : "s"} as examples` : ""}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 border-t border-line px-4 py-2 text-left text-sm text-muted hover:bg-surface-2 hover:text-fg"
      >
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
        {open ? "Hide changes" : "Show changes"}
        <span className="ml-auto font-mono text-xs">
          <span className="text-good">+{stat.added}</span> <span className="text-bad">−{stat.removed}</span>
        </span>
      </button>
      {open ? (
        <div className="border-t border-line bg-bg/50 p-4">
          <SectionChanges changes={changes} />
        </div>
      ) : null}

      {pending ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">
          {draft.stale ? (
            <span className="mr-auto flex items-center gap-1.5 text-xs text-warn">
              <AlertTriangle className="size-3.5" />
              Someone saved a newer prompt after this was written.
            </span>
          ) : (
            <span className="mr-auto text-xs text-muted">Students won't see this until you apply it.</span>
          )}
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => void dismiss()}>
            <X />
            Dismiss
          </Button>
          <Button variant="primary" size="sm" disabled={busy} onClick={() => (draft.stale ? setStaleConfirm(true) : void apply())}>
            <Check />
            Apply
          </Button>
        </div>
      ) : null}

      <ConfirmDialog
        open={staleConfirm}
        onOpenChange={setStaleConfirm}
        title="Apply on top of the newer prompt?"
        description={`This was drafted from v${draft.baseVersion}, but the prompt has changed since. Applying it will replace the newest version with this draft — any edits made after v${draft.baseVersion} will be undone. You can always restore them from History.`}
        confirmLabel="Apply anyway"
        onConfirm={() => void apply(true)}
      />
    </div>
  );
}
