import { useLayoutEffect, useRef, useState } from "react";
import { Reorder, useDragControls } from "motion/react";
import { ArrowDown, ArrowUp, ChevronDown, GripVertical, MoreHorizontal, Trash2 } from "lucide-react";
import type { PromptSection } from "../admin-api";
import { cn } from "../../lib/cn";
import { Switch } from "../../components/ui/misc";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "../../components/ui/menu";
import { ConfirmDialog } from "../../components/ui/dialog";

function AutoGrowTextarea({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      autoFocus
      value={value}
      spellCheck
      onChange={(e) => onChange(e.target.value)}
      className="block min-h-24 w-full resize-none rounded-xl border border-line bg-bg px-3.5 py-3 font-mono text-[13px] leading-relaxed text-fg focus:border-accent focus:ring-3 focus:ring-accent/15 focus:outline-none"
    />
  );
}

/** One prompt section: drag to reorder, rename, switch on/off, edit text. */
export function SectionCard({
  section,
  changed,
  isFirst,
  isLast,
  onChange,
  onMove,
  onDelete,
}: {
  section: PromptSection;
  changed: boolean;
  isFirst: boolean;
  isLast: boolean;
  onChange: (next: PromptSection) => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const drag = useDragControls();
  // First line of real text — skip an ALL-CAPS heading like "SAFETY".
  const lines = section.body.split("\n").filter((l) => l.trim());
  const preview = lines.find((l) => !/^[A-Z0-9 &/-]+$/.test(l.trim())) ?? lines[0] ?? "Empty";
  const words = section.body.trim() ? section.body.trim().split(/\s+/).length : 0;

  return (
    <Reorder.Item
      value={section}
      dragListener={false}
      dragControls={drag}
      className={cn(
        "relative rounded-2xl border bg-surface transition-[border-color,box-shadow]",
        open ? "border-line-strong shadow-soft" : "border-line hover:border-line-strong",
        !section.enabled && "opacity-60",
      )}
      whileDrag={{ scale: 1.01, boxShadow: "var(--shadow-lg)", zIndex: 10 }}
    >
      <div className="flex items-center gap-1 py-2 pr-2 pl-1.5">
        <button
          type="button"
          aria-label="Drag to reorder"
          onPointerDown={(e) => drag.start(e)}
          className="inline-flex size-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-faint hover:bg-surface-2 hover:text-muted active:cursor-grabbing"
        >
          <GripVertical className="size-4" />
        </button>
        <input
          value={section.title}
          onChange={(e) => onChange({ ...section, title: e.target.value })}
          aria-label="Section title"
          className="min-w-0 flex-1 rounded-md bg-transparent px-1.5 py-1 text-sm font-medium hover:bg-surface-2 focus:bg-surface-2 focus:outline-none"
        />
        {changed ? <span className="size-1.5 shrink-0 rounded-full bg-accent" title="Unsaved changes" /> : null}
        <span className="hidden shrink-0 px-1 text-xs text-faint sm:inline">{words} words</span>
        <Switch checked={section.enabled} onChange={(enabled) => onChange({ ...section, enabled })} label="Section on or off" />
        <Menu>
          <MenuTrigger asChild>
            <button
              type="button"
              aria-label="Section options"
              className="inline-flex size-7 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg"
            >
              <MoreHorizontal className="size-4" />
            </button>
          </MenuTrigger>
          <MenuContent className="min-w-44">
            {!isFirst ? (
              <MenuItem icon={<ArrowUp />} onSelect={() => onMove(-1)}>
                Move up
              </MenuItem>
            ) : null}
            {!isLast ? (
              <MenuItem icon={<ArrowDown />} onSelect={() => onMove(1)}>
                Move down
              </MenuItem>
            ) : null}
            {!isFirst || !isLast ? <MenuSeparator /> : null}
            <MenuItem icon={<Trash2 />} danger onSelect={() => setConfirmDelete(true)}>
              Delete section
            </MenuItem>
          </MenuContent>
        </Menu>
        <button
          type="button"
          aria-label={open ? "Collapse" : "Edit text"}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="inline-flex size-7 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg"
        >
          <ChevronDown className={cn("size-4 transition-transform duration-200", open && "rotate-180")} />
        </button>
      </div>

      {open ? (
        <div className="px-3 pb-3">
          <AutoGrowTextarea value={section.body} onChange={(body) => onChange({ ...section, body })} />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="block w-full truncate px-4 pb-3 text-left font-mono text-xs text-muted hover:text-fg-2"
        >
          {preview}
        </button>
      )}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete "${section.title}"?`}
        description="It's removed when you save. Older versions stay in History if you need it back."
        confirmLabel="Delete"
        danger
        onConfirm={onDelete}
      />
    </Reorder.Item>
  );
}
