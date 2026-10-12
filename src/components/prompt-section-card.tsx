import { useId, useLayoutEffect, useRef, useState } from "react";
import type { PromptSection } from "../lib/prompt-api";
import { buttonClass } from "../lib/button-styles";
import Collapse from "./collapse";

interface Props {
  section: PromptSection;
  index: number;
  count: number;
  /** Differs from the saved version — shown as a dot so nothing is lost silently. */
  dirty: boolean;
  /** Freshly added sections open ready to type in; loaded ones start closed. */
  defaultOpen?: boolean;
  onChange: (patch: Partial<PromptSection>) => void;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
}

const ICON = {
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  viewBox: "0 0 24 24",
} as const;

/**
 * One editable section of the AI's instructions: rename, rewrite, reorder
 * with the arrow buttons, or switch off without deleting. The title is only
 * a label for this page — the AI reads the body text exactly as written.
 */
export default function PromptSectionCard({
  section,
  index,
  count,
  dirty,
  defaultOpen = false,
  onChange,
  onMove,
  onDelete,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const bodyId = useId();
  /** Whether the next open should put the cursor in the textarea. */
  const focusOnOpen = useRef(defaultOpen);

  function toggle() {
    focusOnOpen.current = !open;
    setOpen((v) => !v);
  }

  // Grow the textarea with its content — a scrollbar inside a section inside
  // a page is one scrollbar too many. Measured before paint so the expand
  // animation knows its final height from the first frame.
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el || !open) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight + 2, 96)}px`;
    if (focusOnOpen.current) {
      focusOnOpen.current = false;
      el.focus({ preventScroll: true });
      // Caret at the end, ready to keep writing — not at the top of the text.
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, [section.body, open]);

  const preview = section.body.split("\n").find((l) => l.trim());

  return (
    <li
      data-open={open || undefined}
      className={[
        "group rounded-xl border bg-[var(--card-bg)] animate-rise-in",
        "transition-[border-color,opacity,box-shadow] duration-200",
        "hover:border-[var(--border-hover)]",
        "data-open:border-[var(--accent-border)] data-open:shadow-lg data-open:shadow-black/30",
        section.enabled ? "border-[var(--border)]" : "border-[var(--border)] opacity-60",
      ].join(" ")}
    >
      <div className="flex items-center gap-1 pl-1.5 pr-2 py-1.5">
        <button
          type="button"
          onClick={toggle}
          aria-label={open ? `Collapse ${section.title}` : `Expand ${section.title}`}
          aria-expanded={open}
          aria-controls={bodyId}
          className={buttonClass("ghost", "icon-sm", "flex-shrink-0")}
        >
          <svg
            {...ICON}
            width="16"
            height="16"
            strokeWidth="2.5"
            className={`transition-transform duration-200 ease-out-quart ${open ? "rotate-90" : ""}`}
          >
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>

        <div className="relative flex-1 min-w-0">
          <input
            value={section.title}
            onChange={(e) => onChange({ title: e.target.value })}
            aria-label="Section title"
            placeholder="Section title"
            title="Click to rename"
            className="peer w-full bg-transparent text-sm font-semibold text-[var(--text-h)] rounded-lg pl-2 pr-2 sm:pr-7 py-1 border border-transparent hover:border-[var(--border)] focus:border-[var(--accent-border)] focus:bg-[var(--bg)] focus:outline-none transition-colors"
          />
          {/* Pencil hint that the title is editable; hidden on phones where the row is tight. */}
          <svg
            {...ICON}
            aria-hidden
            width="13"
            height="13"
            strokeWidth="2"
            className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 hidden sm:block text-[var(--text)] opacity-40 group-hover:opacity-70 peer-focus:opacity-0 transition-opacity"
          >
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
        </div>

        <span
          aria-hidden
          title={dirty ? "Unsaved changes" : undefined}
          className={[
            "w-1.5 h-1.5 rounded-full bg-[var(--accent)] flex-shrink-0 transition-transform duration-200 ease-spring",
            dirty ? "scale-100" : "scale-0",
          ].join(" ")}
        />

        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={bodyId}
          className={buttonClass(open ? "primary" : "outline", "xs", "flex-shrink-0 min-w-[3.5rem]")}
        >
          {open ? "Done" : "Edit"}
        </button>

        <button
          type="button"
          onClick={() => onChange({ enabled: !section.enabled })}
          aria-pressed={section.enabled}
          title={section.enabled ? "The AI sees this section" : "Hidden from the AI until switched on"}
          className={buttonClass(
            "bare",
            "pill",
            [
              "border font-semibold flex-shrink-0",
              section.enabled
                ? "bg-[var(--accent-bg)] text-[var(--accent)] border-[var(--accent-border)]"
                : "text-[var(--text)] border-[var(--border)] hover:text-[var(--text-h)] hover:border-[var(--border-hover)]",
            ].join(" "),
          )}
        >
          {section.enabled ? "On" : "Off"}
        </button>

        <div className="flex flex-shrink-0">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            aria-label={`Move ${section.title} up`}
            className={buttonClass("ghost", "icon-xs")}
          >
            <svg {...ICON} width="14" height="14" strokeWidth="2.5">
              <path d="m18 15-6-6-6 6" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={index === count - 1}
            aria-label={`Move ${section.title} down`}
            className={buttonClass("ghost", "icon-xs")}
          >
            <svg {...ICON} width="14" height="14" strokeWidth="2.5">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`Delete the "${section.title}" section? Old versions keep it in History.`)) {
                onDelete();
              }
            }}
            aria-label={`Delete ${section.title}`}
            className={buttonClass("danger", "icon-xs")}
          >
            <svg {...ICON} width="14" height="14" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* The whole preview line opens the section. It duplicates the chevron
          and Edit button, so it's hidden from keyboard and screen readers. */}
      <button
        type="button"
        tabIndex={-1}
        aria-hidden
        onClick={toggle}
        className={[
          // pl lines the preview up with the title text: 6px row padding + 32px chevron + 4px gap + 8px input padding.
          "w-full text-left pl-[50px] pr-3 pb-2.5 -mt-0.5 text-xs font-mono truncate",
          "text-[var(--text)] hover:text-[var(--text-h)] transition-colors",
          open ? "hidden" : "",
        ].join(" ")}
      >
        {preview ?? "(empty — click to write)"}
      </button>

      <Collapse open={open} id={bodyId}>
        <div className="px-3 pb-3">
          <textarea
            ref={bodyRef}
            value={section.body}
            onChange={(e) => onChange({ body: e.target.value })}
            spellCheck={false}
            aria-label={`${section.title} text`}
            className="w-full resize-none rounded-lg border-2 border-[var(--border)] bg-[var(--code-bg)] px-3 py-2.5 text-sm leading-relaxed text-[var(--text-h)] font-mono focus:outline-none focus:border-[var(--accent-border)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] transition-colors"
          />
        </div>
      </Collapse>
    </li>
  );
}
