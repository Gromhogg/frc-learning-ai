import { useState } from "react";
import { ArrowDownUp, Minus, Plus, Power } from "lucide-react";
import type { DiffLine } from "../../lib/diff";
import { cn } from "../../lib/cn";
import { Badge } from "../../components/ui/misc";
import type { SectionChange } from "../section-diff";

/** Line diff with unchanged stretches folded away. */
export function LineDiff({ lines, context = 2 }: { lines: DiffLine[]; context?: number }) {
  const [expanded, setExpanded] = useState(false);
  const keep = new Set<number>();
  lines.forEach((l, i) => {
    if (l.type !== "same") for (let j = i - context; j <= i + context; j++) keep.add(j);
  });

  const rows: ({ line: DiffLine; i: number } | { gap: number; i: number })[] = [];
  let gap = 0;
  lines.forEach((line, i) => {
    if (expanded || keep.has(i)) {
      if (gap) rows.push({ gap, i: i - 1 });
      gap = 0;
      rows.push({ line, i });
    } else gap++;
  });
  if (gap) rows.push({ gap, i: lines.length });

  return (
    <div className="overflow-hidden rounded-xl border border-line font-mono text-[12.5px] leading-[1.6]">
      {rows.map((row) =>
        "gap" in row ? (
          <button
            key={`g${row.i}`}
            type="button"
            onClick={() => setExpanded(true)}
            className="block w-full bg-surface-2 px-3 py-1 text-left text-xs text-muted hover:text-fg"
          >
            ⋯ {row.gap} unchanged line{row.gap === 1 ? "" : "s"}
          </button>
        ) : (
          <div
            key={row.i}
            className={cn(
              "flex gap-2 px-3 whitespace-pre-wrap",
              row.line.type === "add" && "bg-good-soft text-good",
              row.line.type === "remove" && "bg-bad-soft text-bad line-through decoration-bad/40",
            )}
          >
            <span className="w-3 shrink-0 select-none opacity-60">
              {row.line.type === "add" ? "+" : row.line.type === "remove" ? "−" : " "}
            </span>
            <span className="min-w-0 flex-1 break-words">{row.line.text || " "}</span>
          </div>
        ),
      )}
    </div>
  );
}

/** Every section-level change, each with its own little header. */
export function SectionChanges({ changes }: { changes: SectionChange[] }) {
  if (changes.length === 0) return <p className="text-sm text-muted">No differences.</p>;
  return (
    <div className="flex flex-col gap-4">
      {changes.map((c) => {
        if (c.kind === "added") {
          return (
            <div key={`a-${c.section.id}`}>
              <ChangeHeader icon={<Plus />} tone="good" label="New section" title={c.section.title} />
              <LineDiff lines={c.section.body.split("\n").map((text) => ({ type: "add", text }))} />
            </div>
          );
        }
        if (c.kind === "removed") {
          return (
            <div key={`r-${c.section.id}`}>
              <ChangeHeader icon={<Minus />} tone="bad" label="Removed" title={c.section.title} />
            </div>
          );
        }
        if (c.kind === "moved") {
          return (
            <ChangeHeader key={`m-${c.section.id}`} icon={<ArrowDownUp />} tone="neutral" label="Moved" title={c.section.title} />
          );
        }
        return (
          <div key={`c-${c.after.id}`}>
            <ChangeHeader
              icon={c.toggled ? <Power /> : null}
              tone="accent"
              label={
                c.toggled
                  ? c.after.enabled
                    ? "Turned on"
                    : "Turned off"
                  : c.renamed && c.lines.length === 0
                    ? "Renamed"
                    : "Edited"
              }
              title={c.renamed ? `${c.before.title} → ${c.after.title}` : c.after.title}
            />
            {c.lines.length > 0 ? <LineDiff lines={c.lines} /> : null}
          </div>
        );
      })}
    </div>
  );
}

function ChangeHeader({
  icon,
  tone,
  label,
  title,
}: {
  icon: React.ReactNode;
  tone: "good" | "bad" | "accent" | "neutral";
  label: string;
  title: string;
}) {
  return (
    <div className="mb-1.5 flex items-center gap-2 text-sm">
      <Badge tone={tone} className="[&_svg]:size-3">
        {icon}
        {label}
      </Badge>
      <span className="truncate font-medium">{title}</span>
    </div>
  );
}
