import { useEffect, useRef, useState, type PointerEvent } from "react";
import { cn } from "../../lib/cn";
import { AgentPanel } from "./agent-panel";
import { readStored, STORE_KEY, type Box } from "./assistant-window-state";

// The prompt assistant as a floating window over every admin page. Drag it
// by its top bar; resize it from any edge or corner. It stays open (and
// keeps its chat) while you move between pages, and this browser remembers
// where it was and how big. On phones it fills the screen instead.

const GAP = 12; // closest it gets to the screen edge
const MIN_W = 320;
const MIN_H = 360;

/** Keep the whole window on screen, and no smaller than the minimum. */
function fit(box: Box): Box {
  const maxW = window.innerWidth - 2 * GAP;
  const maxH = window.innerHeight - 2 * GAP;
  const w = Math.min(Math.max(box.w, MIN_W), maxW);
  const h = Math.min(Math.max(box.h, MIN_H), maxH);
  return {
    w,
    h,
    x: Math.min(Math.max(box.x, GAP), window.innerWidth - w - GAP),
    y: Math.min(Math.max(box.y, GAP), window.innerHeight - h - GAP),
  };
}

/** Where it starts: what this browser remembered, or the bottom-right corner. */
function startingBox(): Box {
  const saved = readStored().box;
  const w = saved.w ?? 420;
  const h = saved.h ?? Math.min(640, window.innerHeight - 2 * GAP);
  return fit({ w, h, x: saved.x ?? window.innerWidth, y: saved.y ?? window.innerHeight });
}

// Which edges a handle moves. The top bar moves the whole window.
type Edges = { left?: boolean; right?: boolean; top?: boolean; bottom?: boolean };

// Thin grab strips along each edge, half outside the window so the rounded
// corners don't cut them off.
const HANDLES: { edges: Edges; className: string }[] = [
  { edges: { top: true }, className: "inset-x-4 -top-1 h-2 cursor-ns-resize" },
  { edges: { bottom: true }, className: "inset-x-4 -bottom-1 h-2 cursor-ns-resize" },
  { edges: { left: true }, className: "inset-y-4 -left-1 w-2 cursor-ew-resize" },
  { edges: { right: true }, className: "inset-y-4 -right-1 w-2 cursor-ew-resize" },
  { edges: { top: true, left: true }, className: "-top-1 -left-1 size-5 cursor-nwse-resize" },
  { edges: { top: true, right: true }, className: "-top-1 -right-1 size-5 cursor-nesw-resize" },
  { edges: { bottom: true, left: true }, className: "-bottom-1 -left-1 size-5 cursor-nesw-resize" },
  { edges: { bottom: true, right: true }, className: "-right-1 -bottom-1 size-5 cursor-nwse-resize" },
];

/** The new box after the pointer moved (dx, dy) from where the grab started. */
function moved(start: Box, edges: Edges | "move", dx: number, dy: number): Box {
  if (edges === "move") return fit({ ...start, x: start.x + dx, y: start.y + dy });
  const box = { ...start };
  if (edges.right) box.w = Math.min(Math.max(start.w + dx, MIN_W), window.innerWidth - GAP - start.x);
  if (edges.bottom) box.h = Math.min(Math.max(start.h + dy, MIN_H), window.innerHeight - GAP - start.y);
  // Left and top keep the opposite edge where it was.
  if (edges.left) {
    const rightEdge = start.x + start.w;
    box.x = Math.min(Math.max(start.x + dx, GAP), rightEdge - MIN_W);
    box.w = rightEdge - box.x;
  }
  if (edges.top) {
    const bottomEdge = start.y + start.h;
    box.y = Math.min(Math.max(start.y + dy, GAP), bottomEdge - MIN_H);
    box.h = bottomEdge - box.y;
  }
  return box;
}

function useIsWide() {
  const query = "(min-width: 768px)";
  const [wide, setWide] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const list = window.matchMedia(query);
    const onChange = () => setWide(list.matches);
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }, []);
  return wide;
}

export function AssistantWindow({
  open,
  onClose,
  onApplied,
}: {
  open: boolean;
  onClose: () => void;
  onApplied: () => void;
}) {
  const wide = useIsWide();
  const [box, setBox] = useState<Box>(startingBox);
  const [grabbing, setGrabbing] = useState<"move" | "resize" | null>(null);
  const grab = useRef<{ edges: Edges | "move"; startX: number; startY: number; start: Box } | null>(null);
  // Mount on first open, then keep the chat alive while closed.
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);

  // Stay on screen when the browser window gets smaller.
  useEffect(() => {
    const onResize = () => setBox((b) => fit(b));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Remember open/closed, place and size (not on every move mid-drag).
  useEffect(() => {
    if (grabbing) return;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ open, ...box }));
    } catch {
      // Storage blocked — the window just starts in the corner next time.
    }
  }, [open, box, grabbing]);

  /** Pointer handlers for the top bar (edges = "move") or a resize handle. */
  function grabProps(edges: Edges | "move") {
    return {
      onPointerDown: (e: PointerEvent<HTMLDivElement>) => {
        if (!wide || e.button !== 0) return;
        // Buttons in the top bar keep working as buttons.
        if (edges === "move" && (e.target as HTMLElement).closest("button, a, input, textarea")) return;
        e.preventDefault();
        grab.current = { edges, startX: e.clientX, startY: e.clientY, start: box };
        e.currentTarget.setPointerCapture(e.pointerId);
        setGrabbing(edges === "move" ? "move" : "resize");
      },
      onPointerMove: (e: PointerEvent<HTMLDivElement>) => {
        const g = grab.current;
        if (g) setBox(moved(g.start, g.edges, e.clientX - g.startX, e.clientY - g.startY));
      },
      onPointerUp: () => {
        grab.current = null;
        setGrabbing(null);
      },
      onPointerCancel: () => {
        grab.current = null;
        setGrabbing(null);
      },
    };
  }

  if (!mounted) return null;

  return (
    <div
      role="dialog"
      aria-label="Prompt assistant"
      className={cn("fixed z-40", !wide && "inset-2", !open && "hidden", grabbing && "select-none")}
      style={wide ? { left: box.x, top: box.y, width: box.w, height: box.h } : undefined}
    >
      <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-float">
        <AgentPanel
          onApplied={onApplied}
          onClose={onClose}
          dragHandle={{
            ...grabProps("move"),
            className: wide ? (grabbing === "move" ? "cursor-grabbing touch-none" : "cursor-grab touch-none") : undefined,
          }}
        />
      </div>
      {wide
        ? HANDLES.map((handle) => (
            <div
              key={handle.className}
              aria-hidden
              className={cn("absolute z-10 touch-none", handle.className)}
              {...grabProps(handle.edges)}
            />
          ))
        : null}
    </div>
  );
}
