import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Archive, Brain, Check, Pencil, RotateCcw, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { adminApi, type Fact, type FactSnapshot, type FactsData } from "./admin-api";
import { useAdmin } from "./admin-context";
import { ApiError, errorMessage } from "../lib/api";
import { timeAgo } from "../lib/time";
import { cn } from "../lib/cn";
import { Button } from "../components/ui/button";
import { Dialog } from "../components/ui/dialog";
import { Textarea } from "../components/ui/input";
import { Badge, EmptyState, Skeleton } from "../components/ui/misc";
import { Tooltip } from "../components/ui/tooltip";
import { PageHeader } from "./components/page-header";

type Tab = "waiting" | "memory" | "removed";
const TABS: Tab[] = ["waiting", "memory", "removed"];

const STATUS_LABEL: Record<Fact["status"], string> = {
  pending: "Waiting for review",
  approved: "In the AI's memory",
  rejected: "Removed",
};

/** Someone else changed a fact between this admin loading it and acting on it. */
interface Conflict {
  fact: Fact;
  action: "approve" | "edit";
  /** The wording this admin wanted. */
  mine: string;
  /** The fact as it is now. */
  theirs: FactSnapshot;
}

function FactRow({
  fact,
  pending,
  onApprove,
  onReject,
  onSave,
}: {
  fact: Fact;
  pending: boolean;
  onApprove?: (text?: string) => void;
  onReject: () => void;
  onSave: (text: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(fact.text);

  return (
    <li className="group flex flex-col gap-3 px-4 py-3 animate-[rise-in_200ms_var(--ease-out)] sm:flex-row sm:items-start">
      <div className="min-w-0 flex-1">
        {editing ? (
          <Textarea autoFocus rows={2} value={text} onChange={(e) => setText(e.target.value)} />
        ) : (
          <p className="text-sm">{fact.text}</p>
        )}
        <p className="mt-1 text-xs text-muted">
          {fact.mentionCount > 1 ? `Mentioned in ${fact.mentionCount} chats · ` : ""}
          {fact.sourceUserName ? `from ${fact.sourceUserName}'s chat · ` : ""}
          {timeAgo(fact.createdAt)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {editing ? (
          <>
            <Button variant="ghost" size="sm" onClick={() => (setEditing(false), setText(fact.text))}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={!text.trim()}
              onClick={() => {
                setEditing(false);
                if (pending && onApprove) onApprove(text);
                else onSave(text);
              }}
            >
              {pending ? "Save & approve" : "Save"}
            </Button>
          </>
        ) : (
          <>
            <Tooltip label="Edit wording">
              <Button variant="ghost" size="icon-sm" aria-label="Edit" onClick={() => setEditing(true)}>
                <Pencil />
              </Button>
            </Tooltip>
            {pending ? (
              <>
                <Button variant="ghost" size="sm" onClick={onReject}>
                  <X />
                  Reject
                </Button>
                <Button variant="primary" size="sm" onClick={() => onApprove?.()}>
                  <Check />
                  Approve
                </Button>
              </>
            ) : (
              <Tooltip label="Remove from the AI's memory">
                <Button variant="ghost" size="icon-sm" aria-label="Remove" onClick={onReject}>
                  <Trash2 />
                </Button>
              </Tooltip>
            )}
          </>
        )}
      </div>
    </li>
  );
}

function RemovedRow({ fact, onRestore }: { fact: Fact; onRestore: () => void }) {
  return (
    <li className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start">
      <div className="min-w-0 flex-1">
        <p className="text-sm text-fg-2">{fact.text}</p>
        <p className="mt-1 text-xs text-muted">
          {fact.reviewedByName ? `Removed by ${fact.reviewedByName}` : "Removed"}
          {fact.reviewedAt ? ` ${timeAgo(fact.reviewedAt)}` : ""}
          {fact.sourceUserName ? ` · from ${fact.sourceUserName}'s chat` : ""}
        </p>
      </div>
      <Button variant="outline" size="sm" className="shrink-0" onClick={onRestore}>
        <RotateCcw />
        Restore
      </Button>
    </li>
  );
}

export default function FactsPage() {
  const { refreshCounts } = useAdmin();
  const [data, setData] = useState<FactsData | null>(null);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [params, setParams] = useSearchParams();
  const tabParam = params.get("tab") as Tab | null;
  const tab: Tab = tabParam && TABS.includes(tabParam) ? tabParam : "waiting";

  const load = useCallback(
    () =>
      adminApi
        .facts()
        .then(setData)
        .catch((err) => toast.error(errorMessage(err))),
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Run one change, then reload. A 409 that carries the fact as it is now
   * means someone else changed it first — hand that to `onConflict`.
   */
  async function act(fn: () => Promise<unknown>, message?: string, onConflict?: (theirs: FactSnapshot) => void) {
    try {
      await fn();
      if (message) toast.success(message);
    } catch (err) {
      const theirs = err instanceof ApiError && err.status === 409 ? (err.body as { current?: FactSnapshot } | null)?.current : undefined;
      if (theirs && onConflict) onConflict(theirs);
      else toast.error(errorMessage(err));
    }
    await load();
    refreshCounts();
  }

  function conflictHandler(fact: Fact, action: Conflict["action"], mine: string) {
    return (theirs: FactSnapshot) => {
      // Nothing to choose if they already did exactly what this admin wanted.
      const sameEnd = action === "approve" ? theirs.status === "approved" : theirs.status !== "rejected";
      if (theirs.text === mine && sameEnd) {
        toast.success("Someone else already made this change.");
        return;
      }
      setConflict({ fact, action, mine, theirs });
    };
  }

  function approve(fact: Fact, text?: string, version = fact.version) {
    void act(() => adminApi.approveFact(fact.id, version, text), "Approved.", conflictHandler(fact, "approve", text ?? fact.text));
  }

  function edit(fact: Fact, text: string, message?: string, version = fact.version) {
    void act(() => adminApi.editFact(fact.id, text, version), message, conflictHandler(fact, "edit", text));
  }

  function saveMine() {
    if (!conflict) return;
    const { fact, action, mine, theirs } = conflict;
    setConflict(null);
    // Retry on top of the version we were just shown.
    if (action === "approve") approve(fact, mine, theirs.version);
    else edit(fact, mine, "Saved.", theirs.version);
  }

  const tabLabel = (t: Tab) =>
    t === "waiting"
      ? `Waiting${data && data.pending.length ? ` (${data.pending.length})` : ""}`
      : t === "memory"
        ? `In the AI's memory${data ? ` (${data.approved.length})` : ""}`
        : "Removed";

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        title="Team facts"
        description="Things the AI picked up about your team from student chats — like which motors you use or what you call the router. Approved facts are added to every chat. Rejected ones are never suggested again, unless you restore them."
      />

      <div className="mb-4 inline-flex max-w-full overflow-x-auto rounded-xl bg-surface-2 p-1">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setParams(t === "waiting" ? {} : { tab: t }, { replace: true })}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
              tab === t ? "bg-surface text-fg shadow-soft" : "text-muted hover:text-fg",
            )}
          >
            {tabLabel(t)}
          </button>
        ))}
      </div>

      {data === null ? (
        <Skeleton className="h-48 rounded-2xl" />
      ) : tab === "waiting" ? (
        data.pending.length === 0 ? (
          <EmptyState icon={<Brain />} title="All caught up">
            New facts appear here after students chat.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-accent-line bg-surface">
            {data.pending.map((f) => (
              <FactRow
                // A new version remounts the row, so an open edit box never shows stale text.
                key={`${f.id}-${f.version}`}
                fact={f}
                pending
                onApprove={(text) => approve(f, text)}
                onReject={() => void act(() => adminApi.rejectFact(f.id), "Rejected. You can restore it from Removed.")}
                onSave={(text) => edit(f, text)}
              />
            ))}
          </ul>
        )
      ) : tab === "memory" ? (
        <>
          <p className="mb-2 text-xs text-muted">
            {data.approved.length} of {data.approvedCap} slots used.
          </p>
          {data.approved.length === 0 ? (
            <p className="rounded-2xl border border-line bg-surface px-4 py-6 text-center text-sm text-muted">
              No approved facts yet.
            </p>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
              {data.approved.map((f) => (
                <FactRow
                  key={`${f.id}-${f.version}`}
                  fact={f}
                  pending={false}
                  onReject={() => void act(() => adminApi.removeFact(f.id), "Removed. You can restore it from Removed.")}
                  onSave={(text) => edit(f, text, "Saved.")}
                />
              ))}
            </ul>
          )}
        </>
      ) : (
        <>
          <p className="mb-2 text-xs text-muted">
            Rejected and removed facts. Restoring one puts it back in Waiting, so it can be approved again.
          </p>
          {data.removed.length === 0 ? (
            <EmptyState icon={<Archive />} title="Nothing removed">
              Facts you reject or remove show up here.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
              {data.removed.map((f) => (
                <RemovedRow
                  key={`${f.id}-${f.version}`}
                  fact={f}
                  onRestore={() => void act(() => adminApi.restoreFact(f.id), "Put back in Waiting for review.")}
                />
              ))}
            </ul>
          )}
        </>
      )}

      <Dialog
        open={conflict !== null}
        onOpenChange={(o) => !o && setConflict(null)}
        title="Someone else changed this fact"
        description={
          conflict?.theirs.status === "rejected"
            ? "It was removed while you were looking. You can put it back from the Removed tab."
            : "It changed while you were looking. Pick which version to keep."
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setConflict(null)}>
              Keep theirs
            </Button>
            {conflict?.theirs.status !== "rejected" ? (
              <Button variant="primary" onClick={saveMine}>
                Save mine
              </Button>
            ) : null}
          </>
        }
      >
        {conflict ? (
          <div className="flex flex-col gap-3">
            <div className="rounded-xl border border-line bg-surface-2 p-3">
              <div className="mb-1 flex items-center gap-2">
                <span className="text-xs font-medium text-muted">Theirs</span>
                <Badge tone={conflict.theirs.status === "rejected" ? "warn" : "neutral"}>{STATUS_LABEL[conflict.theirs.status]}</Badge>
              </div>
              <p className="text-sm">{conflict.theirs.text}</p>
            </div>
            <div className="rounded-xl border border-accent-line bg-accent-soft p-3">
              <div className="mb-1 flex items-center gap-2">
                <span className="text-xs font-medium text-accent-text">Yours</span>
                <Badge tone="accent">{conflict.action === "approve" ? "Approve" : "New wording"}</Badge>
              </div>
              <p className="text-sm">{conflict.mine}</p>
            </div>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
