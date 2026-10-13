import { useCallback, useEffect, useState } from "react";
import { Brain, Check, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { adminApi, type Fact } from "./admin-api";
import { useAdmin } from "./admin-context";
import { errorMessage } from "../lib/api";
import { timeAgo } from "../lib/time";
import { Button } from "../components/ui/button";
import { Textarea } from "../components/ui/input";
import { Badge, EmptyState, Skeleton } from "../components/ui/misc";
import { Tooltip } from "../components/ui/tooltip";
import { PageHeader } from "./components/page-header";

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

export default function FactsPage() {
  const { refreshCounts } = useAdmin();
  const [data, setData] = useState<{ pending: Fact[]; approved: Fact[]; approvedCap: number } | null>(null);

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

  async function act(fn: () => Promise<unknown>, message?: string) {
    try {
      await fn();
      if (message) toast.success(message);
      await load();
      refreshCounts();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        title="Team facts"
        description="Things the AI picked up about your team from student chats — like which motors you use or what you call the router. Approved facts are added to every chat. Rejected ones are never suggested again."
      />

      {data === null ? (
        <Skeleton className="h-48 rounded-2xl" />
      ) : (
        <div className="flex flex-col gap-8">
          <section>
            <div className="mb-2 flex items-center gap-2">
              <h2 className="text-sm font-semibold">Waiting for review</h2>
              {data.pending.length > 0 ? <Badge tone="accent">{data.pending.length}</Badge> : null}
            </div>
            {data.pending.length === 0 ? (
              <EmptyState icon={<Brain />} title="All caught up">
                New facts appear here after students chat.
              </EmptyState>
            ) : (
              <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-accent-line bg-surface">
                {data.pending.map((f) => (
                  <FactRow
                    key={f.id}
                    fact={f}
                    pending
                    onApprove={(text) => void act(() => adminApi.approveFact(f.id, text), "Approved.")}
                    onReject={() => void act(() => adminApi.rejectFact(f.id))}
                    onSave={(text) => void act(() => adminApi.editFact(f.id, text))}
                  />
                ))}
              </ul>
            )}
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">In the AI's memory</h2>
              <span className="text-xs text-muted">
                {data.approved.length} / {data.approvedCap}
              </span>
            </div>
            {data.approved.length === 0 ? (
              <p className="rounded-2xl border border-line bg-surface px-4 py-6 text-center text-sm text-muted">
                No approved facts yet.
              </p>
            ) : (
              <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
                {data.approved.map((f) => (
                  <FactRow
                    key={f.id}
                    fact={f}
                    pending={false}
                    onReject={() => void act(() => adminApi.removeFact(f.id), "Removed.")}
                    onSave={(text) => void act(() => adminApi.editFact(f.id, text), "Saved.")}
                  />
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
