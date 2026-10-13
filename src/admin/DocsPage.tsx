import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { adminApi, type Doc } from "./admin-api";
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
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<(Doc & { content: string }) | null>(null);
  const [toDelete, setToDelete] = useState<Doc | null>(null);
  const [clash, setClash] = useState<{ file: File; queue: File[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      setDocs((await adminApi.docs()).docs);
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
      toast.success(`Deleted ${doc.name}`);
      void load();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        title="Reference docs"
        description="Machine procedures, specs, and team guides the AI can open while answering. Plain text or Markdown files, up to 100 KB each. Deleted files go to a trash folder on the server, never gone for good."
      />

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
          <button type="button" className="font-medium text-accent hover:underline" onClick={() => fileRef.current?.click()}>
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
        description="The AI won't be able to open it any more. The file moves to the server's trash folder."
        confirmLabel="Delete"
        danger
        onConfirm={() => toDelete && void remove(toDelete)}
      />

      <Dialog
        open={clash !== null}
        onOpenChange={(o) => !o && setClash(null)}
        title={`${clash?.file.name} already exists`}
        description="Replace the old file (it moves to trash), or keep both with a new name?"
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
