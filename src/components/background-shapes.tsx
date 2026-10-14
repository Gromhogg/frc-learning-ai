import { useEffect, useState } from "react";

// Calm, solid shapes (circles, squares and diamonds) behind the chat so the
// page feels less empty. Each page load gets a new random layout, which then
// stays put while the page is open. Colors come from theme tokens, so the
// shapes follow light and dark mode on their own.

type Kind = "circle" | "square" | "diamond";

interface Shape {
  kind: Kind;
  /** Which edge of the chat area the shape hangs off. */
  side: "left" | "right";
  /** Distance in px from that edge to the shape's center (can be negative: partly off screen). */
  x: number;
  /** How far down the chat area the center sits, from 0 (top) to 1 (bottom). */
  y: number;
  w: number;
  h: number;
  /** Rotation in degrees. */
  turn: number;
  /** A solid fill color, or null for an outline-only shape. */
  fill: string | null;
}

const PHONE_QUERY = "(max-width: 639px)";
const SIDEBAR_WIDTH = 272; // matches the desktop sidebar in Chat.tsx
const READING_WIDTH = 768; // max-w-3xl, the centered message column
const HEADER_HEIGHT = 56;

const FILLS = ["var(--surface-2)", "var(--surface-3)", "var(--line)"];

function random(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Half the width of the smallest circle that holds the shape at any rotation. */
function reach(kind: Kind, w: number, h: number) {
  if (kind === "square") return (w * Math.SQRT2) / 2;
  return Math.max(w, h) / 2;
}

function makeShapes(phone: boolean): Shape[] {
  const viewW = window.innerWidth;
  const viewH = window.innerHeight;
  // The chat area loses the sidebar's width on wide screens.
  const mainW = viewW >= 900 ? viewW - SIDEBAR_WIDTH : viewW;
  // Free space on each side of the centered message column.
  const gutter = Math.max(0, (mainW - READING_WIDTH) / 2);

  const count = phone ? 8 : gutter >= 100 ? 18 : 12;
  const minSize = phone ? 20 : 24;
  const maxSize = phone ? 56 : gutter >= 180 ? 120 : gutter >= 100 ? 88 : 64;
  const gap = phone ? 12 : 18;

  // Fixed share of each paint and kind, handed out in random order.
  const outlines = Math.round(count * 0.18);
  const oranges = Math.round(count * 0.14);
  const paints: (string | null)[] = [];
  for (let i = 0; i < count; i++) {
    if (i < outlines) paints.push(null);
    else if (i < outlines + oranges) paints.push("var(--accent-soft)");
    else paints.push(FILLS[i % FILLS.length]);
  }
  const kinds = shuffle(Array.from({ length: count }, (_, i): Kind => (["circle", "square", "diamond"] as const)[i % 3]));
  const sides = shuffle(Array.from({ length: count }, (_, i) => (i % 2 ? "left" : "right") as Shape["side"]));
  const fills = shuffle(paints);

  // Place big shapes first: they are the hardest to fit.
  const sizes = Array.from({ length: count }, () => minSize + (maxSize - minSize) * Math.random() ** 1.6).sort(
    (a, b) => b - a,
  );

  const placed: (Shape & { cx: number; cy: number; r: number })[] = [];

  sizes.forEach((startSize, i) => {
    const kind = kinds[i];
    const side = sides[i];
    let size = startSize;

    // Try random spots; if none is free, shrink the shape a little and try again.
    for (let round = 0; round < 3; round++, size *= 0.85) {
      const w = kind === "diamond" ? size * 0.78 : size;
      const h = size;
      const r = reach(kind, w, h);

      // Keep the shape in the side space, hanging a bit off the edge when that space is thin.
      const xMin = phone ? -0.4 * r : -0.35 * r;
      const xMax = phone ? 0.3 * r : Math.max(xMin + 0.5 * r, Math.min(gutter - r - 16, 340));
      // Stay below the header; shapes may drop slightly past the bottom edge.
      const yMin = HEADER_HEIGHT + r;
      const yMax = viewH - 0.35 * r;

      for (let tries = 0; tries < 150; tries++) {
        // Squaring pulls shapes toward the edge; the cosine curve pulls them toward the corners.
        const x = xMin + (xMax - xMin) * Math.random() ** 2;
        const y = yMin + ((yMax - yMin) * (1 - Math.cos(Math.PI * Math.random()))) / 2;
        const cx = side === "left" ? x : mainW - x;
        const free = placed.every((p) => Math.hypot(p.cx - cx, p.cy - y) >= p.r + r + gap);
        if (!free) continue;

        placed.push({
          kind,
          side,
          x,
          y: y / viewH,
          w,
          h,
          turn: kind === "square" ? random(0, 90) : kind === "diamond" ? random(-10, 10) : 0,
          fill: fills[i],
          cx,
          cy: y,
          r,
        });
        return;
      }
    }
  });

  return placed.map((p) => ({
    kind: p.kind,
    side: p.side,
    x: p.x,
    y: p.y,
    w: p.w,
    h: p.h,
    turn: p.turn,
    fill: p.fill,
  }));
}

function usePhone() {
  const [phone, setPhone] = useState(() => window.matchMedia(PHONE_QUERY).matches);
  useEffect(() => {
    const media = window.matchMedia(PHONE_QUERY);
    const onChange = () => setPhone(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
  return phone;
}

/**
 * Fills its nearest positioned parent, behind everything else. The parent
 * should be `relative isolate` so the shapes stay behind its content.
 */
export function BackgroundShapes() {
  const phone = usePhone();
  // A new key makes a fresh layout when switching between phone and desktop sizes.
  return <ShapeLayer key={phone ? "phone" : "desktop"} phone={phone} />;
}

function ShapeLayer({ phone }: { phone: boolean }) {
  const [shapes] = useState(() => makeShapes(phone));

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden select-none">
      {shapes.map((s, i) => (
        <svg
          key={i}
          width={s.w}
          height={s.h}
          viewBox={`0 0 ${s.w} ${s.h}`}
          className="absolute"
          style={{
            [s.side]: s.x - s.w / 2,
            top: `calc(${(s.y * 100).toFixed(2)}% - ${s.h / 2}px)`,
            transform: s.turn ? `rotate(${s.turn.toFixed(1)}deg)` : undefined,
          }}
        >
          <ShapeOutline shape={s} />
        </svg>
      ))}
    </div>
  );
}

function ShapeOutline({ shape }: { shape: Shape }) {
  const { kind, w, h, fill } = shape;
  // Outline shapes are pulled in by half the line width so the line isn't cut off.
  const inset = fill ? 0 : 0.75;
  const style = fill ? { fill } : { fill: "none", stroke: "var(--line-strong)", strokeWidth: 1.5 };

  if (kind === "circle") return <circle cx={w / 2} cy={h / 2} r={w / 2 - inset} style={style} />;
  if (kind === "square") {
    return (
      <rect
        x={inset}
        y={inset}
        width={w - inset * 2}
        height={h - inset * 2}
        rx={Math.round(w * 0.12)}
        style={style}
      />
    );
  }
  const points = [
    [w / 2, inset],
    [w - inset, h / 2],
    [w / 2, h - inset],
    [inset, h / 2],
  ]
    .map((p) => p.join(","))
    .join(" ");
  return <polygon points={points} strokeLinejoin="round" style={style} />;
}
