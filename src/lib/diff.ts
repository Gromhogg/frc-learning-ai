// A minimal line diff. The prompt is a few hundred lines at most, so a plain
// longest-common-subsequence table is fast enough and saves pulling in a
// dependency for one screen.

export type DiffLine = {
  type: "same" | "add" | "remove";
  text: string;
};

/** Above this, the LCS table gets big enough to feel slow in the browser. */
const MAX_LINES = 2000;

export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.split("\n");
  const b = after.split("\n");

  // Bail out to a whole-file replace rather than locking up the tab.
  if (a.length > MAX_LINES || b.length > MAX_LINES) {
    return [
      ...a.map((text): DiffLine => ({ type: "remove", text })),
      ...b.map((text): DiffLine => ({ type: "add", text })),
    ];
  }

  // lengths[i][j] = length of the longest common subsequence of a[i:] and b[j:]
  const lengths: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );

  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lengths[i][j] =
        a[i] === b[j]
          ? lengths[i + 1][j + 1] + 1
          : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
    }
  }

  // Walk the table forwards, emitting removals before additions so a changed
  // line reads as "old, then new".
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;

  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ type: "same", text: a[i] });
      i++;
      j++;
    } else if (lengths[i + 1][j] >= lengths[i][j + 1]) {
      out.push({ type: "remove", text: a[i] });
      i++;
    } else {
      out.push({ type: "add", text: b[j] });
      j++;
    }
  }

  while (i < a.length) out.push({ type: "remove", text: a[i++] });
  while (j < b.length) out.push({ type: "add", text: b[j++] });

  return out;
}

/** Counts for a one-line summary like "+12 −3". */
export function diffStat(lines: DiffLine[]): { added: number; removed: number } {
  return {
    added: lines.filter((l) => l.type === "add").length,
    removed: lines.filter((l) => l.type === "remove").length,
  };
}
