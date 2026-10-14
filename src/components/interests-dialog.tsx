import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, errorMessage } from "../lib/api";
import { ConfirmDialog, Dialog } from "./ui/dialog";
import { Button } from "./ui/button";
import { Badge, Skeleton } from "./ui/misc";

interface Interests {
  topics: { topic: string; strong: boolean }[];
  statedFocus: string | null;
}

/**
 * What the AI has picked up about this person's interests from their chats
 * (it shapes their starter suggestions), with a button to clear it.
 */
export function InterestsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [data, setData] = useState<Interests | null>(null);
  const [failed, setFailed] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  // Fresh copy each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    api<Interests>("/api/me/interests")
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setFailed(false);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function clear() {
    setClearing(true);
    try {
      await api("/api/me/interests", { method: "DELETE" });
      setData({ topics: [], statedFocus: null });
      toast.success("Cleared. The AI will start fresh.");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setClearing(false);
    }
  }

  const empty = !!data && data.topics.length === 0 && !data.statedFocus;
  // Strong topics first, then the lighter ones.
  const topics = data ? [...data.topics.filter((t) => t.strong), ...data.topics.filter((t) => !t.strong)] : [];

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        title="Your interests"
        size="sm"
        footer={
          data && !empty ? (
            <Button variant="ghost" onClick={() => setConfirmOpen(true)} disabled={clearing}>
              Clear
            </Button>
          ) : undefined
        }
      >
        {data === null && failed ? (
          <p className="text-sm text-muted">Couldn't load your interests. Try again in a bit.</p>
        ) : data === null ? (
          <div className="flex flex-wrap gap-1.5">
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-6 w-24 rounded-full" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
        ) : empty ? (
          <p className="text-sm text-muted">Nothing yet — chat a bit and check back.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {data.statedFocus ? (
              <p className="text-sm text-fg-2">
                You said you focus on: <span className="font-medium text-fg">{data.statedFocus}</span>
              </p>
            ) : null}
            {topics.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {topics.map((t) =>
                  t.strong ? (
                    <Badge key={t.topic} tone="accent">
                      {t.topic}
                    </Badge>
                  ) : (
                    <span
                      key={t.topic}
                      className="inline-flex items-center rounded-full border border-line px-2 py-0.5 text-xs whitespace-nowrap text-muted"
                    >
                      {t.topic}
                    </span>
                  ),
                )}
              </div>
            ) : null}
          </div>
        )}
        <p className="mt-4 text-xs text-muted">
          The AI picks this up from your chats to suggest questions. Only you can see it.
        </p>
      </Dialog>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Clear your interests?"
        description="The AI forgets what it picked up and goes back to the usual suggestions. It starts learning again from new chats."
        confirmLabel="Clear"
        danger
        onConfirm={() => void clear()}
      />
    </>
  );
}
