import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { FileText, RotateCcw, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { adminApi, type Doc, type TrashedDoc } from "./admin-api";
import { ApiError, errorMessage } from "../lib/api";
import { timeAgo } from "../lib/time";
import { cn } from "../lib/cn";
import { Button } from "../components/ui/button";
import { ConfirmDialog, Dialog } from "../components/ui/dialog";
import { EmptyState, Skeleton, Spinner } from "../components/ui/misc";
import { Markdown } from "../components/markdown";
import { Tooltip } from "../components/ui/tooltip";
import { PageHeader } from "./components/page-header";

function size(bytes: number) {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

export default function DocsPage() {
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [trash, setTrash] = useState<TrashedDoc[] | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "trash" ? "trash" : "docs";
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<(Doc & { content: string }) | null>(null);
  const [toDelete, setToDelete] = useState<Doc | null>(null);
  const [clash, setClash] = useState<{ file: File; queue: File[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const [list, trashed] = await Promise.all([adminApi.docs(), adminApi.docsTrash()]);
      setDocs(list.docs);
      setTrash(trashed.trash);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function upload(files: File[], mode?: "replace" | "keep-both") {
    setUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          await adminApi.uploadDoc(file, i === 0 ? mode : undefined);
          toast.success(`Added ${file.name}`);
        } catch (err) {
          if (err instanceof ApiError && err.status === 409) {
            // Ask what to do, then carry on with the rest.
            setClash({ file, queue: files.slice(i + 1) });
            return;
          }
          toast.error(`${file.name}: ${errorMessage(err)}`);
        }
      }
    } finally {
      setUploading(false);
      void load();
    }
  }

  async function open(doc: Doc) {
    try {
      setPreview(await adminApi.doc(doc.name));
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function remove(doc: Doc) {
    try {
      await adminApi.deleteDoc(doc.name);
      toast.success(`Deleted ${doc.name}. You can restore it from the Trash tab.`);
      void load();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function restore(item: TrashedDoc) {
    setRestoring(item.trashName);
    try {
      const result = await adminApi.restoreDoc(item.trashName);
      toast.success(
        result.renamed
          ? `Restored as ${result.doc.name}, because ${item.name} is already taken.`
          : `Restored ${result.doc.name}.`,
      );
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setRestoring(null);
      void load();
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        title="Reference docs"
        description="Machine procedures, specs, and team guides the AI can open while answering. Plain text or Markdown files, up to 100 KB each. Deleted and replaced files go to the Trash, where you can put them back."
      />

      <div className="mb-4 inline-flex rounded-xl bg-surface-2 p-1">
        {(
          [
            ["docs", `Docs${docs ? ` (${docs.length})` : ""}`],
            ["trash", `Trash${trash && trash.length ? ` (${trash.length})` : ""}`],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setParams(value === "docs" ? {} : { tab: value }, { replace: true })}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              tab === value ? "bg-surface text-fg shadow-soft" : "text-muted hover:text-fg",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "trash" ? (
        trash === null ? (
          <Skeleton className="h-64 rounded-2xl" />
        ) : trash.length === 0 ? (
          <EmptyState icon={<Trash2 />} title="The trash is empty">
            Deleted docs, and old copies of replaced docs, show up here.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {trash.map((item) => (
              <li key={item.trashName} className="flex items-center gap-3 px-4 py-3">
                <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-faint">
                  <FileText className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.title}</p>
                  <p className="truncate text-xs text-muted">
                    <span className="font-mono">{item.name}</span> · {size(item.size)} · deleted {timeAgo(item.deletedAt)}
                  </p>
                  {item.nameTaken ? (
                    <p className="text-xs text-faint">A doc with this name exists now, so restoring keeps both.</p>
                  ) : null}
                </div>
                <Button variant="outline" size="sm" disabled={restoring !== null} onClick={() => void restore(item)}>
                  {restoring === item.trashName ? <Spinner /> : <RotateCcw />}
                  Restore
                </Button>
              </li>
            ))}
          </ul>
        )
      ) : (
        <>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              void upload(Array.from(e.dataTransfer.files));
            }}
            className={cn(
              "mb-6 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-colors",
              dragging ? "border-accent bg-accent-soft" : "border-line bg-surface",
            )}
          >
            <span className="mb-3 inline-flex size-10 items-center justify-center rounded-xl bg-surface-2 text-muted">
              {uploading ? <Spinner /> : <Upload className="size-5" />}
            </span>
            <p className="text-sm font-medium">Drop .md or .txt files here</p>
            <p className="mt-0.5 text-sm text-muted">
              or{" "}
              <button type="button" className="font-medium text-accent-text hover:underline" onClick={() => fileRef.current?.click()}>
                choose files
              </button>
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".md,.txt,text/plain,text/markdown"
              multiple
              hidden
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                e.target.value = "";
                void upload(files);
              }}
            />
          </div>

          {docs === null ? (
            <Skeleton className="h-64 rounded-2xl" />
          ) : docs.length === 0 ? (
            <EmptyState icon={<FileText />} title="No docs yet">
              Upload a machine guide to get started.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
              {docs.map((doc) => (
                <li key={doc.name} className="group flex items-center gap-3 px-4 py-3 hover:bg-surface-2/50">
                  <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-muted">
                    <FileText className="size-4" />
                  </span>
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => void open(doc)}>
                    <p className="truncate text-sm font-medium">{doc.title}</p>
                    <p className="truncate text-xs text-muted">
                      <span className="font-mono">{doc.name}</span> · {size(doc.size)} · {timeAgo(doc.modifiedAt)}
                    </p>
                  </button>
                  <Tooltip label="Delete">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete ${doc.name}`}
                      className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                      onClick={() => setToDelete(doc)}
                    >
                      <Trash2 />
                    </Button>
                  </Tooltip>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <Dialog open={preview !== null} onOpenChange={(o) => !o && setPreview(null)} title={preview?.title ?? ""} description={preview?.name} size="lg">
        {preview ? (
          preview.name.endsWith(".md") ? (
            <Markdown text={preview.content} className="text-sm" />
          ) : (
            <pre className="font-mono text-[12.5px] whitespace-pre-wrap">{preview.content}</pre>
          )
        ) : null}
      </Dialog>

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={`Delete ${toDelete?.name}?`}
        description="The AI won't be able to open it any more. The file moves to the Trash, where you can restore it."
        confirmLabel="Delete"
        danger
        onConfirm={() => toDelete && void remove(toDelete)}
      />

      <Dialog
        open={clash !== null}
        onOpenChange={(o) => !o && setClash(null)}
        title={`${clash?.file.name} already exists`}
        description="Replace the old file (it moves to the Trash), or keep both with a new name?"
        size="sm"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                const c = clash;
                setClash(null);
                if (c?.queue.length) void upload(c.queue);
              }}
            >
              Skip
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                const c = clash!;
                setClash(null);
                void upload([c.file, ...c.queue], "keep-both");
              }}
            >
              Keep both
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                const c = clash!;
                setClash(null);
                void upload([c.file, ...c.queue], "replace");
              }}
            >
              Replace
            </Button>
          </>
        }
      />
    </div>
  );
}
