import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError } from "../lib/api";
import {
  assembleSections,
  fetchLive,
  saveSections as putSections,
  timeAgo,
  type LivePrompt,
  type PromptSection,
} from "../lib/prompt-api";
import { buttonClass } from "../lib/button-styles";
import Collapse from "../components/collapse";
import PromptConflict from "../components/prompt-conflict";
import PromptHistory from "../components/prompt-history";
import PromptSectionCard from "../components/prompt-section-card";
import DocsPanel from "../components/docs-panel";
import FactsPanel from "../components/facts-panel";

/** Starter sections teachers can add with one click. Bodies are suggestions —
 * the AI reads them exactly as written, headings and all. */
const SECTION_TEMPLATES: { label: string; title: string; body: string }[] = [
  {
    label: "Persona",
    title: "Persona",
    body: "PERSONA\nYou are a friendly, patient mentor for this FRC team. Talk like a knowledgeable shop teacher, not a textbook.",
  },
  {
    label: "Teaching style",
    title: "Teaching style",
    body: "TEACHING STYLE\nGuide students toward the answer instead of handing it over. Ask what they've tried, explain the why, and keep answers short enough to read at a workbench.",
  },
  {
    label: "Safety",
    title: "Safety",
    body: "SAFETY\nNever skip a safety warning to save space. When a question involves a machine or tool, state the relevant precautions before the procedure.",
  },
  { label: "Custom", title: "New section", body: "" },
];

/** Everything that makes two section lists "the same save". */
function keyOf(sections: PromptSection[]): string {
  return JSON.stringify(sections.map((s) => [s.id, s.title, s.body, s.enabled]));
}

export default function Prompt() {
  const navigate = useNavigate();

  const [sections, setSections] = useState<PromptSection[]>([]);
  const [savedSections, setSavedSections] = useState<PromptSection[]>([]);
  /** The version this editor was loaded from — sent on save to catch stale writes. */
  const [live, setLive] = useState<LivePrompt | null>(null);
  const [conflict, setConflict] = useState<LivePrompt | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  /** Sections added in this session, so their cards open ready to type in. */
  const newIds = useRef(new Set<string>());

  useEffect(() => {
    void (async () => {
      try {
        const data = await fetchLive();
        adopt(data);
      } catch (err) {
        setStatus(err instanceof Error ? err.message : "Could not load the prompt.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /** Adopt whatever the server says is current, and clear any conflict. */
  function adopt(next: LivePrompt) {
    setLive(next);
    setSections(next.sections);
    setSavedSections(next.sections);
    setConflict(null);
  }

  /**
   * Save against `baseVersion`. A 409 means someone else got there first —
   * we surface both texts rather than clobbering theirs.
   */
  async function save(baseVersion?: number) {
    const base = baseVersion ?? live?.version;
    if (base === undefined) return;

    setSaving(true);
    setStatus(null);
    try {
      const result = await putSections(sections, base);
      setLive(result);
      setSavedSections(sections);
      setConflict(null);
      setStatus(`Saved as v${result.version}. New messages will use these instructions.`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const body = err.body as { current?: LivePrompt } | null;
        if (body?.current) {
          setConflict(body.current);
          setStatus(null);
          return;
        }
      }
      setStatus(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  function updateSection(id: string, patch: Partial<PromptSection>) {
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  function moveSection(index: number, direction: -1 | 1) {
    setSections((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function addSection(template: (typeof SECTION_TEMPLATES)[number]) {
    setSections((prev) => {
      const base =
        template.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "") || "section";
      let id = base;
      for (let n = 2; prev.some((s) => s.id === id); n++) id = `${base}-${n}`;
      newIds.current.add(id);
      return [...prev, { id, title: template.title, body: template.body, enabled: true }];
    });
    setAddOpen(false);
  }

  const savedById = new Map(savedSections.map((s) => [s.id, s]));
  const unsaved = keyOf(sections) !== keyOf(savedSections);

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <header className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-[var(--card-bg)] sticky top-0 z-10">
        <button onClick={() => navigate("/")} className={buttonClass("ghost", "sm", "-ml-2")}>
          ← Back to chat
        </button>

        <div className="flex items-center gap-2">
          {live && (
            <button onClick={() => setHistoryOpen(true)} className={buttonClass("ghost", "sm")}>
              v{live.version} · History
            </button>
          )}
          <button
            onClick={() => void save()}
            disabled={saving || !unsaved}
            className={buttonClass("primary", "sm", "min-w-[7.5rem]")}
          >
            {/* Keyed so the label crossfades instead of snapping between states. */}
            <span key={saving ? "saving" : unsaved ? "save" : "saved"} className="animate-fade-in">
              {saving ? "Saving…" : unsaved ? "Save changes" : "Saved"}
            </span>
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        {loading ? (
          <p className="text-sm text-[var(--text)]">Loading…</p>
        ) : (
          <>
            {status && (
              <p
                key={status}
                className="mb-4 text-sm text-[var(--accent)] bg-[var(--accent-bg)] border border-[var(--accent-border)] rounded-lg px-4 py-2.5 animate-rise-in"
              >
                {status}
              </p>
            )}

            {conflict && (
              <PromptConflict
                theirs={conflict}
                mine={assembleSections(sections)}
                busy={saving}
                onKeepMine={() => void save(conflict.version)}
                onTakeTheirs={() => adopt(conflict)}
                onDismiss={() => setConflict(null)}
              />
            )}

            <section>
              <h1 className="text-xl font-bold text-[var(--text-h)]">AI instructions</h1>
              <p className="text-sm text-[var(--text)] mt-1.5 leading-relaxed">
                This is what the AI is told before every conversation, split into sections you can
                edit, reorder, or switch off one at a time. Section titles are labels for this
                page — the AI reads the text inside, top to bottom.
              </p>
              {live && (
                <p className="text-xs text-[var(--text)] mt-1.5">
                  Version {live.version} · last edited by {live.authorName}{" "}
                  {timeAgo(live.updatedAt)}
                </p>
              )}

              <ul className="mt-4 space-y-2">
                {sections.map((section, index) => (
                  <PromptSectionCard
                    key={section.id}
                    section={section}
                    index={index}
                    count={sections.length}
                    dirty={keyOf([section]) !== keyOf([savedById.get(section.id) ?? section])}
                    defaultOpen={newIds.current.has(section.id)}
                    onChange={(patch) => updateSection(section.id, patch)}
                    onMove={(direction) => moveSection(index, direction)}
                    onDelete={() => setSections((prev) => prev.filter((s) => s.id !== section.id))}
                  />
                ))}
              </ul>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {addOpen ? (
                  <>
                    {SECTION_TEMPLATES.map((template, i) => (
                      <button
                        key={template.label}
                        onClick={() => addSection(template)}
                        style={{ animationDelay: `${i * 35}ms` }}
                        className={buttonClass("outline", "sm", "animate-pop-in")}
                      >
                        {template.label}
                      </button>
                    ))}
                    <button
                      onClick={() => setAddOpen(false)}
                      aria-label="Cancel adding a section"
                      style={{ animationDelay: `${SECTION_TEMPLATES.length * 35}ms` }}
                      className={buttonClass("ghost", "icon-sm", "animate-pop-in")}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" width="14" height="14">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setAddOpen(true)}
                    className={buttonClass(
                      "bare",
                      "sm",
                      "font-medium border border-dashed border-[var(--border)] text-[var(--text)] hover:text-[var(--text-h)] hover:border-[var(--accent-border)] hover:bg-[var(--accent-bg)]",
                    )}
                  >
                    + Add section
                  </button>
                )}
                <button
                  onClick={() => setShowPreview((v) => !v)}
                  aria-expanded={showPreview}
                  aria-controls="prompt-preview"
                  className={buttonClass("ghost", "sm", "ml-auto")}
                >
                  {showPreview ? "Hide preview" : "Preview what the AI sees"}
                </button>
              </div>

              <Collapse open={showPreview} id="prompt-preview">
                <pre className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--code-bg)] px-4 py-3 max-h-96 overflow-auto text-xs leading-relaxed text-[var(--text-h)] font-mono whitespace-pre-wrap break-words">
                  {assembleSections(sections) || "(no enabled sections — the AI would get empty instructions)"}
                </pre>
              </Collapse>
            </section>

            <DocsPanel />

            <FactsPanel />
          </>
        )}
      </main>

      {historyOpen && live && (
        <PromptHistory
          liveVersion={live.version}
          onClose={() => setHistoryOpen(false)}
          onRestored={(restored) => {
            adopt(restored);
            setHistoryOpen(false);
            setStatus(`Restored as v${restored.version}.`);
          }}
        />
      )}
    </div>
  );
}
