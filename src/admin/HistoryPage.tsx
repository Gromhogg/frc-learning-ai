import { useCallback, useEffect, useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { adminApi, type LivePrompt, type VersionMeta } from "./admin-api";
import { diffSections } from "./section-diff";
import { errorMessage } from "../lib/api";
import { timeAgo } from "../lib/time";
import { cn } from "../lib/cn";
import { Button } from "../components/ui/button";
import { Badge, Skeleton } from "../components/ui/misc";
import { ConfirmDialog } from "../components/ui/dialog";
import { PageHeader } from "./components/page-header";
import { SectionChanges } from "./components/diff-view";

export default function HistoryPage() {
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
        title="History"
        description="Every saved version of the prompt. Restoring an old one saves it again as the newest version — nothing is ever erased."
      />
      {versions === null ? (
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
