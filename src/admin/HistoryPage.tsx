import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Activity, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { adminApi, type AdminEvent, type LivePrompt, type VersionMeta } from "./admin-api";
import { diffSections } from "./section-diff";
import { errorMessage } from "../lib/api";
import { timeAgo } from "../lib/time";
import { cn } from "../lib/cn";
import { Button } from "../components/ui/button";
import { Badge, EmptyState, Skeleton } from "../components/ui/misc";
import { ConfirmDialog } from "../components/ui/dialog";
import { PageHeader } from "./components/page-header";
import { SectionChanges } from "./components/diff-view";

/** Plain names for the actions in the activity log. */
const ACTION_LABELS: Record<string, string> = {
  "prompt.save": "Saved prompt",
  "prompt.rollback": "Restored version",
  "draft.create": "New suggestion",
  "draft.apply": "Applied suggestion",
  "draft.dismiss": "Dismissed suggestion",
  "fact.approve": "Approved fact",
  "fact.reject": "Rejected fact",
  "fact.remove": "Removed fact",
  "fact.edit": "Edited fact",
  "fact.restore": "Restored fact",
  "doc.upload": "Added doc",
  "doc.delete": "Deleted doc",
  "doc.restore": "Restored doc",
  "settings.model": "Changed model",
  "admin.grant": "Added admin",
};

/** Things that took something away get a warning color; everything else is plain. */
function actionTone(action: string): "warn" | "neutral" {
  return /\.(reject|remove|delete|dismiss)$/.test(action) ? "warn" : "neutral";
}

function ActivityList() {
  const [events, setEvents] = useState<AdminEvent[] | null>(null);

  useEffect(() => {
    adminApi
      .events()
      .then(({ events }) => setEvents(events))
      .catch((err) => toast.error(errorMessage(err)));
  }, []);

  if (events === null) return <Skeleton className="h-80 rounded-2xl" />;
  if (events.length === 0) {
    return (
      <EmptyState icon={<Activity />} title="No activity yet">
        Changes to the prompt, suggestions, facts, docs, and settings show up here.
      </EmptyState>
    );
  }
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
      {events.map((e) => (
        <li key={e.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:gap-3">
          <Badge tone={actionTone(e.action)} className="self-start sm:mt-0.5">
            {ACTION_LABELS[e.action] ?? e.action}
          </Badge>
          <div className="min-w-0 flex-1">
            <p className="text-sm break-words">{e.summary}</p>
            <p className="mt-0.5 text-xs text-muted">
              {e.actorName}
              {e.target ? ` · ${e.target}` : ""}
            </p>
          </div>
          <span className="shrink-0 text-xs text-faint">{timeAgo(e.createdAt)}</span>
        </li>
      ))}
    </ul>
  );
}

export default function HistoryPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "activity" ? "activity" : "versions";
  const [versions, setVersions] = useState<VersionMeta[] | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [pair, setPair] = useState<{ v: LivePrompt; prev: LivePrompt | null } | null>(null);
  const [confirm, setConfirm] = useState(false);

  const load = useCallback(
    () =>
      adminApi
        .history()
        .then(({ versions }) => {
          setVersions(versions);
          setSelected((s) => s ?? versions[0]?.version ?? null);
        })
        .catch((err) => toast.error(errorMessage(err))),
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (selected === null) return;
    let cancelled = false;
    Promise.all([adminApi.version(selected), selected > 1 ? adminApi.version(selected - 1) : Promise.resolve(null)])
      .then(([v, prev]) => !cancelled && setPair({ v, prev }))
      .catch((err) => toast.error(errorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const changes = useMemo(() => (pair ? diffSections(pair.prev?.sections ?? [], pair.v.sections) : []), [pair]);
  const latest = versions?.[0]?.version;

  async function restore() {
    if (selected === null) return;
    try {
      const result = await adminApi.rollback(selected);
      toast.success(`Restored — saved as v${result.version}.`);
      setSelected(null);
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        title="Versions"
        description={
          tab === "versions"
            ? "Every saved version of the prompt. Restoring an old one saves it again as the newest version — nothing is ever erased."
            : "Who changed what, newest first: the prompt, suggestions, team facts, docs, and settings."
        }
      />

      <div className="mb-4 inline-flex rounded-xl bg-surface-2 p-1">
        {(
          [
            ["versions", "Prompt versions"],
            ["activity", "Activity"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setParams(value === "versions" ? {} : { tab: value }, { replace: true })}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              tab === value ? "bg-surface text-fg shadow-soft" : "text-muted hover:text-fg",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "activity" ? (
        <ActivityList />
      ) : versions === null ? (
        <Skeleton className="h-80 rounded-2xl" />
      ) : (
        <div className="grid gap-4 md:grid-cols-[260px_1fr]">
          <ul className="flex max-h-[70vh] flex-col gap-1 overflow-y-auto rounded-2xl border border-line bg-surface p-1.5">
            {versions.map((v) => (
              <li key={v.version}>
                <button
                  type="button"
                  onClick={() => setSelected(v.version)}
                  className={cn(
                    "w-full rounded-xl px-3 py-2 text-left transition-colors",
                    v.version === selected ? "bg-surface-2" : "hover:bg-surface-2/60",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-medium">v{v.version}</span>
                    {v.version === latest ? <Badge tone="accent">Live</Badge> : null}
                    <span className="ml-auto text-xs text-faint">{timeAgo(v.createdAt)}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted">
                    {v.authorName}
                    {v.note ? ` — ${v.note}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <div className="min-w-0 rounded-2xl border border-line bg-surface p-4">
            {!pair || pair.v.version !== selected ? (
              <Skeleton className="h-48" />
            ) : (
              <>
                <div className="mb-4 flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      v{pair.v.version} <span className="font-normal text-muted">by {pair.v.authorName}</span>
                    </p>
                    <p className="text-sm text-muted">{pair.v.note ?? "No note"}</p>
                  </div>
                  {pair.v.version !== latest ? (
                    <Button variant="outline" size="sm" onClick={() => setConfirm(true)}>
                      <RotateCcw />
                      Restore this version
                    </Button>
                  ) : null}
                </div>
                <p className="mb-2 text-xs font-medium text-muted">
                  {pair.prev ? `Changes from v${pair.prev.version}` : "First version"}
                </p>
                <SectionChanges changes={changes} />
              </>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Restore v${selected}?`}
        description="It will be saved as a new version and the AI will use it from the next message."
        confirmLabel="Restore"
        onConfirm={() => void restore()}
      />
    </div>
  );
}
