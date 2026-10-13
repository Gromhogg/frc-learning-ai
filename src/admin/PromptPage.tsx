import { useCallback, useEffect, useMemo, useState } from "react";
import { useBlocker } from "react-router-dom";
import { Reorder } from "motion/react";
import { Eye, Plus, RotateCcw, Save, ScrollText, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { adminApi, type LivePrompt, type PromptSection } from "./admin-api";
import { useAdmin } from "./admin-context";
import { diffSections } from "./section-diff";
import { ApiError, errorMessage } from "../lib/api";
import { timeAgo } from "../lib/time";
import { cn } from "../lib/cn";
import { Button } from "../components/ui/button";
import { Badge, Skeleton } from "../components/ui/misc";
import { ConfirmDialog, Dialog } from "../components/ui/dialog";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "../components/ui/menu";
import { SectionCard } from "./components/section-card";
import { SectionChanges } from "./components/diff-view";
import { AgentPanel } from "./components/agent-panel";

const TEMPLATES: { label: string; title: string; body: string }[] = [
  { label: "Blank section", title: "New section", body: "" },
  {
    label: "Teaching style",
    title: "Teaching style",
    body: "TEACHING STYLE\n- Check what the student already knows before explaining.\n- Give one step at a time and ask if it makes sense.",
  },
  {
    label: "Safety rule",
    title: "Safety",
    body: "SAFETY\n- Before any machine step, remind the student to get a mentor's sign-off.",
  },
  {
    label: "Team context",
    title: "About our team",
    body: "ABOUT OUR TEAM\n- (Team number, robot name, what subsystems you're building this season.)",
  },
];

function slug(title: string, taken: Set<string>): string {
  const base =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "section";
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

export default function PromptPage() {
  const { refreshCounts } = useAdmin();
  const [live, setLive] = useState<LivePrompt | null>(null);
  const [sections, setSections] = useState<PromptSection[]>([]);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [conflict, setConflict] = useState<LivePrompt | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [mobileTab, setMobileTab] = useState<"sections" | "assistant">("sections");

  const load = useCallback(async () => {
    try {
      const data = await adminApi.prompt();
      setLive(data);
      setSections(data.sections);
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't load the prompt."));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const changes = useMemo(() => (live ? diffSections(live.sections, sections) : []), [live, sections]);
  const dirty = changes.length > 0;
  const changedIds = useMemo(
    () =>
      new Set(
        changes.flatMap((c) => (c.kind === "changed" ? [c.after.id] : c.kind === "added" || c.kind === "moved" ? [c.section.id] : [])),
      ),
    [changes],
  );

  // Don't lose edits by leaving the page.
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  async function save(baseVersion = live?.version) {
    if (!live || baseVersion === undefined) return;
    setSaving(true);
    try {
      const saved = await adminApi.savePrompt(sections, baseVersion, note.trim() || undefined);
      setLive(saved);
      setSections(saved.sections);
      setNote("");
      setConflict(null);
      toast.success(`Saved as v${saved.version}. The AI uses it from the next message.`);
      refreshCounts();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setConflict((err.body as { current: LivePrompt }).current);
      } else {
        toast.error(errorMessage(err));
      }
    } finally {
      setSaving(false);
    }
  }

  function update(index: number, next: PromptSection) {
    setSections((prev) => prev.map((s, i) => (i === index ? next : s)));
  }

  function move(index: number, dir: -1 | 1) {
    setSections((prev) => {
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(index + dir, 0, item);
      return next;
    });
  }

  function add(template: (typeof TEMPLATES)[number]) {
    setSections((prev) => [
      ...prev,
      { id: slug(template.title, new Set(prev.map((s) => s.id))), title: template.title, body: template.body, enabled: true },
    ]);
  }

  async function openPreview() {
    if (dirty) {
      // The server only knows the saved version; build the unsaved one here.
      setPreview(
        sections
          .filter((s) => s.enabled)
          .map((s) => s.body)
          .join("\n\n") + "\n\n(+ reference doc list and approved team facts, added automatically)",
      );
      return;
    }
    try {
      setPreview((await adminApi.preview()).text);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  const sectionsColumn = (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">Prompt</h1>
            {live ? <Badge>v{live.version}</Badge> : null}
          </div>
          <p className="mt-1 max-w-xl text-sm text-muted">
            What the AI is told before every chat. Sections are joined top to bottom; switched-off ones are skipped.
            {live ? (
              <span className="text-faint">
                {" "}
                Last saved by {live.authorName} {timeAgo(live.updatedAt)}.
              </span>
            ) : null}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void openPreview()} disabled={!live}>
          <Eye />
          Preview
        </Button>
      </div>

      {!live ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      ) : (
        <>
          <Reorder.Group axis="y" values={sections} onReorder={setSections} className="flex flex-col gap-2.5">
            {sections.map((section, i) => (
              <SectionCard
                key={section.id}
                section={section}
                changed={changedIds.has(section.id)}
                isFirst={i === 0}
                isLast={i === sections.length - 1}
                onChange={(next) => update(i, next)}
                onMove={(dir) => move(i, dir)}
                onDelete={() => setSections((prev) => prev.filter((_, j) => j !== i))}
              />
            ))}
          </Reorder.Group>

          <Menu>
            <MenuTrigger asChild>
              <button
                type="button"
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-line py-3 text-sm text-muted transition-colors hover:border-line-strong hover:bg-surface hover:text-fg"
              >
                <Plus className="size-4" />
                Add section
              </button>
            </MenuTrigger>
            <MenuContent align="center">
              {TEMPLATES.map((t) => (
                <MenuItem key={t.label} onSelect={() => add(t)}>
                  {t.label}
                </MenuItem>
              ))}
            </MenuContent>
          </Menu>
        </>
      )}

      {/* Room for the save bar */}
      <div className="h-24" />
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Phone/tablet: switch between the editor and the assistant */}
      <div className="flex gap-1 border-b border-line p-2 xl:hidden">
        {(
          [
            ["sections", "Sections", ScrollText],
            ["assistant", "Assistant", Wand2],
          ] as const
        ).map(([tab, label, Icon]) => (
          <button
            key={tab}
            type="button"
            onClick={() => setMobileTab(tab)}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-lg py-1.5 text-sm",
              mobileTab === tab ? "bg-surface-2 font-medium" : "text-muted",
            )}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1">
        <div className={cn("relative min-w-0 flex-1 overflow-y-auto", mobileTab !== "sections" && "hidden xl:block")}>
          {sectionsColumn}

          {/* Save bar */}
          <div
            className={cn(
              "pointer-events-none sticky bottom-0 flex justify-center px-4 pb-5 transition-all duration-300",
              dirty ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0",
            )}
          >
            <div className="pointer-events-auto flex w-full max-w-2xl flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface/95 p-2 pl-4 shadow-float backdrop-blur">
              <span className="text-sm font-medium">
                {changes.length} unsaved change{changes.length === 1 ? "" : "s"}
              </span>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What changed? (optional)"
                className="min-w-0 flex-1 rounded-lg bg-surface-2 px-3 py-1.5 text-sm placeholder:text-faint focus:outline-none"
              />
              <Button variant="ghost" size="sm" onClick={() => setConfirmDiscard(true)} disabled={saving}>
                <RotateCcw />
                Discard
              </Button>
              <Button variant="primary" size="sm" onClick={() => void save()} disabled={saving}>
                <Save />
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </div>

        <aside
          className={cn(
            "min-h-0 w-full shrink-0 border-l border-line bg-surface xl:w-[420px]",
            mobileTab !== "assistant" && "hidden xl:block",
          )}
        >
          <AgentPanel
            onApplied={() => {
              if (dirty) toast("A change was applied. Save or discard your edits to see it.");
              else void load();
              refreshCounts();
            }}
          />
        </aside>
      </div>

      <Dialog open={preview !== null} onOpenChange={(o) => !o && setPreview(null)} title="What the AI sees" description="The full instructions sent before every chat." size="lg">
        <pre className="rounded-xl border border-line bg-bg p-4 font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap">{preview}</pre>
      </Dialog>

      <Dialog
        open={conflict !== null}
        onOpenChange={(o) => !o && setConflict(null)}
        title={`${conflict?.authorName ?? "Someone"} saved a newer version`}
        description={`While you were editing, v${conflict?.version} was saved. Here's how it differs from yours.`}
        size="lg"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                if (!conflict) return;
                setLive(conflict);
                setSections(conflict.sections);
                setConflict(null);
              }}
            >
              Use theirs (drop mine)
            </Button>
            <Button variant="primary" onClick={() => void save(conflict?.version)} disabled={saving}>
              Save mine on top
            </Button>
          </>
        }
      >
        {conflict ? <SectionChanges changes={diffSections(conflict.sections, sections)} /> : null}
      </Dialog>

      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="Discard your changes?"
        description="Every section goes back to the saved version."
        confirmLabel="Discard"
        danger
        onConfirm={() => live && setSections(live.sections)}
      />

      <ConfirmDialog
        open={blocker.state === "blocked"}
        onOpenChange={(o) => !o && blocker.state === "blocked" && blocker.reset()}
        title="Leave without saving?"
        description="Your prompt edits haven't been saved."
        confirmLabel="Leave"
        danger
        onConfirm={() => blocker.state === "blocked" && blocker.proceed()}
      />
    </div>
  );
}
