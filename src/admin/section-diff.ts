import { diffLines, diffStat, type DiffLine } from "../lib/diff";
import type { PromptSection } from "./admin-api";

// What changed between two versions of the prompt, section by section — far
// easier to read than one long text diff.

export type SectionChange =
  | { kind: "added"; section: PromptSection }
  | { kind: "removed"; section: PromptSection }
  | {
      kind: "changed";
      before: PromptSection;
      after: PromptSection;
      lines: DiffLine[];
      renamed: boolean;
      toggled: boolean;
    }
  | { kind: "moved"; section: PromptSection };

export function diffSections(before: PromptSection[], after: PromptSection[]): SectionChange[] {
  const out: SectionChange[] = [];
  const beforeById = new Map(before.map((s) => [s.id, s]));
  const afterIds = new Set(after.map((s) => s.id));
  const keptBefore = before.filter((s) => afterIds.has(s.id)).map((s) => s.id);
  const keptAfter = after.filter((s) => beforeById.has(s.id)).map((s) => s.id);

  for (const s of after) {
    const old = beforeById.get(s.id);
    if (!old) {
      out.push({ kind: "added", section: s });
      continue;
    }
    const bodyChanged = old.body !== s.body;
    const renamed = old.title !== s.title;
    const toggled = old.enabled !== s.enabled;
    if (bodyChanged || renamed || toggled) {
      out.push({
        kind: "changed",
        before: old,
        after: s,
        lines: bodyChanged ? diffLines(old.body, s.body) : [],
        renamed,
        toggled,
      });
    } else if (keptBefore.indexOf(s.id) !== keptAfter.indexOf(s.id)) {
      out.push({ kind: "moved", section: s });
    }
  }
  for (const s of before) {
    if (!afterIds.has(s.id)) out.push({ kind: "removed", section: s });
  }
  return out;
}

/** "+12 −3" across every section. */
export function totalStat(changes: SectionChange[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const c of changes) {
    if (c.kind === "added") added += c.section.body.split("\n").length;
    else if (c.kind === "removed") removed += c.section.body.split("\n").length;
    else if (c.kind === "changed") {
      const s = diffStat(c.lines);
      added += s.added;
      removed += s.removed;
    }
  }
  return { added, removed };
}
