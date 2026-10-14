import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBlocker } from "react-router-dom";
import { Reorder } from "motion/react";
import { Eye, History, Plus, RotateCcw, Save, TriangleAlert } from "lucide-react";
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

// ─── unsaved edits kept in this browser ────────────────────────────────────
//
// So a refresh or a closed tab doesn't lose work. Stored under a key per base
// version (the version the edits started from), so restored edits still save
// through the normal "someone saved a newer version" check.

const EDITS_KEY_PREFIX = "prompt-edits:v";

interface StoredEdits {
  baseVersion: number;
  sections: PromptSection[];
  note: string;
  savedAt: string;
}

function storedEditKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(EDITS_KEY_PREFIX)) keys.push(key);
  }
  return keys;
}

/** The most recent saved edits, if any. */
function readStoredEdits(): StoredEdits | null {
  try {
    let newest: StoredEdits | null = null;
    for (const key of storedEditKeys()) {
      const value = JSON.parse(localStorage.getItem(key) ?? "null") as StoredEdits | null;
      if (!value || !Array.isArray(value.sections) || !Number.isInteger(value.baseVersion)) continue;
      if (!newest || value.savedAt > newest.savedAt) newest = value;
    }
    return newest;
  } catch {
    return null;
  }
}

function writeStoredEdits(edits: StoredEdits): void {
  try {
    // Only one set of edits at a time: drop any left over from another base version.
    const key = `${EDITS_KEY_PREFIX}${edits.baseVersion}`;
    for (const old of storedEditKeys()) if (old !== key) localStorage.removeItem(old);
    localStorage.setItem(key, JSON.stringify(edits));
  } catch {
    // Storage can be full or blocked (private windows). The editor still works.
  }
}

function clearStoredEdits(): void {
  try {
    for (const key of storedEditKeys()) localStorage.removeItem(key);
  } catch {
    // Same as above.
  }
}

/** How often to check whether someone else saved a newer version. */
const CHECK_EVERY_MS = 30_000;

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
  const { refreshCounts, appliedCount } = useAdmin();
  const [live, setLive] = useState<LivePrompt | null>(null);
  const [sections, setSections] = useState<PromptSection[]>([]);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [conflict, setConflict] = useState<LivePrompt | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  // Edits found in this browser after a refresh, waiting for Restore / Discard.
  const [storedEdits, setStoredEdits] = useState<StoredEdits | null>(null);
  const [confirmDropStored, setConfirmDropStored] = useState(false);
  // A newer version someone else saved while this admin had unsaved edits.
  const [newer, setNewer] = useState<LivePrompt | null>(null);

  const load = useCallback(async (checkStored = false) => {
    try {
      const data = await adminApi.prompt();
      setLive(data);
      setSections(data.sections);
      if (checkStored) {
        const saved = readStoredEdits();
        // Edits that match what's live aren't edits any more.
        if (saved && saved.baseVersion === data.version && diffSections(data.sections, saved.sections).length === 0) {
          clearStoredEdits();
        } else {
          setStoredEdits(saved);
        }
      }
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't load the prompt."));
    }
  }, []);

  useEffect(() => {
    void load(true);
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

  // The prompt assistant (a floating window on every admin page) applied a
  // change: show it, unless that would wipe unsaved edits.
  const seenApplied = useRef(appliedCount);
  useEffect(() => {
    if (appliedCount === seenApplied.current) return;
    seenApplied.current = appliedCount;
    if (dirty) toast("A change was applied. Save or discard your edits to see it.");
    else void load();
  }, [appliedCount, dirty, load]);

  // A newer version only matters while it's still ahead of what we're editing.
  const newerShown = newer && live && newer.version > live.version ? newer : null;

  // Keep unsaved edits in this browser, a moment after typing stops. Paused
  // while old edits are waiting for Restore / Discard, so they aren't overwritten.
  // `wroteEdits` stops a second open tab with no edits from wiping this one's.
  const wroteEdits = useRef(false);
  useEffect(() => {
    if (!live || storedEdits) return;
    const timer = window.setTimeout(() => {
      if (dirty) {
        writeStoredEdits({ baseVersion: live.version, sections, note, savedAt: new Date().toISOString() });
        wroteEdits.current = true;
      } else if (wroteEdits.current) {
        clearStoredEdits();
        wroteEdits.current = false;
      }
    }, 600);
    return () => window.clearTimeout(timer);
  }, [live, sections, note, dirty, storedEdits]);

  // Don't lose edits by leaving the page.
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      // Write right away in case the timer above hasn't fired yet.
      if (live && !storedEdits) {
        writeStoredEdits({ baseVersion: live.version, sections, note, savedAt: new Date().toISOString() });
      }
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty, live, sections, note, storedEdits]);

  // Every 30 seconds while the tab is visible, check whether someone else
  // saved. No edits here: quietly load it. Unsaved edits: show a banner.
  const latest = useRef({ live, dirty });
  useEffect(() => {
    latest.current = { live, dirty };
  });
  useEffect(() => {
    let timer: number | undefined;
    async function check() {
      if (!latest.current.live) return;
      try {
        const fresh = await adminApi.prompt();
        const now = latest.current;
        if (!now.live || fresh.version <= now.live.version) return;
        if (now.dirty) {
          setNewer(fresh);
        } else {
          setLive(fresh);
          setSections(fresh.sections);
          setNewer(null);
        }
      } catch {
        // Try again next time.
      }
    }
    function stop() {
      if (timer !== undefined) window.clearInterval(timer);
      timer = undefined;
    }
    function start() {
      stop();
      timer = window.setInterval(() => void check(), CHECK_EVERY_MS);
    }
    function onVisibility() {
      if (document.visibilityState === "visible") {
        void check();
        start();
      } else {
        stop();
      }
    }
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  /** Bring back edits found in this browser, on top of the version they started from. */
  async function restoreStoredEdits() {
    const saved = storedEdits;
    if (!saved || !live) return;
    let base = live;
    if (saved.baseVersion !== live.version) {
      try {
        base = await adminApi.version(saved.baseVersion);
      } catch {
        toast.error(`Couldn't load v${saved.baseVersion}. Your edits are shown on top of v${live.version} instead.`);
      }
    }
    setLive(base);
    setSections(saved.sections);
    setNote(saved.note ?? "");
    // If the prompt moved on since, say so now — saving will show both side by side.
    setNewer(live.version > base.version ? live : null);
    setStoredEdits(null);
  }

  function dropStoredEdits() {
    clearStoredEdits();
    setStoredEdits(null);
  }

  /** Throw away unsaved edits, landing on the newest version we know of. */
  function discardEdits() {
    const target = newerShown ?? live;
    if (!target) return;
    clearStoredEdits();
    setLive(target);
    setSections(target.sections);
    setNote("");
    setNewer(null);
  }

  async function save(baseVersion = live?.version) {
    if (!live || baseVersion === undefined) return;
    setSaving(true);
    try {
      const saved = await adminApi.savePrompt(sections, baseVersion, note.trim() || undefined);
      clearStoredEdits();
      setLive(saved);
      setSections(saved.sections);
      setNote("");
      setConflict(null);
      setNewer(null);
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

      {storedEdits ? (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-accent-line bg-accent-soft px-4 py-3">
          <History className="size-4 shrink-0 text-accent-text" />
          <p className="min-w-0 flex-1 text-sm">
            You have unsaved edits from {timeAgo(storedEdits.savedAt)} (based on v{storedEdits.baseVersion}).
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setConfirmDropStored(true)}>
              Discard
            </Button>
            <Button variant="primary" size="sm" onClick={() => void restoreStoredEdits()}>
              Restore
            </Button>
          </div>
        </div>
      ) : null}

      {newerShown && dirty ? (
        <div className="mb-4 flex items-start gap-3 rounded-2xl border border-warn/30 bg-warn-soft px-4 py-3">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" />
          <p className="min-w-0 flex-1 text-sm">
            {newerShown.authorName} saved v{newerShown.version} while you were editing. When you save, you'll see both
            versions side by side.
          </p>
        </div>
      ) : null}

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
      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1 overflow-y-auto">
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
                clearStoredEdits();
                setLive(conflict);
                setSections(conflict.sections);
                setNote("");
                setConflict(null);
                setNewer(null);
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
        onConfirm={discardEdits}
      />

      <ConfirmDialog
        open={confirmDropStored}
        onOpenChange={setConfirmDropStored}
        title="Discard your unsaved edits?"
        description="The edits kept in this browser will be deleted. The saved prompt doesn't change."
        confirmLabel="Discard"
        danger
        onConfirm={dropStoredEdits}
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
