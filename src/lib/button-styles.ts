/**
 * Shared button styling. Pure class strings — no component — so the same
 * look works on <button> and on an <a> styled as a button, and every call
 * site keeps its own props, handlers, and aria attributes untouched.
 *
 * `extra` is for layout only (w-full, ml-auto, flex-shrink-0, -ml-2). Never
 * pass colour, border, or radius classes through it on a coloured variant:
 * Tailwind's output order decides the winner, not the class-attribute order.
 * Use the `bare` variant and spell the colours out instead.
 */
export type ButtonVariant = "primary" | "ghost" | "outline" | "danger" | "bare";
export type ButtonSize = "xs" | "sm" | "md" | "pill" | "icon-xs" | "icon-sm" | "icon-md";

// Font weight lives in the variants (not here) so `bare` callers can set
// their own without two font-weight utilities competing.
const BASE = [
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap select-none",
  // `scale`, not `transform`: Tailwind v4 writes the standalone `scale`
  // property, so listing `transform` here would make active:scale-* snap.
  "transition-[color,background-color,border-color,opacity,box-shadow,scale] duration-150",
  "active:duration-75",
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
  "disabled:pointer-events-none disabled:opacity-40",
].join(" ");

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--accent)] text-white font-semibold hover:bg-[var(--accent-hover)] " +
    "focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--card-bg)]",
  ghost: "font-medium text-[var(--text)] hover:text-[var(--text-h)] hover:bg-[var(--code-bg)]",
  outline:
    "font-medium border border-[var(--border)] text-[var(--text-h)] hover:bg-[var(--code-bg)] hover:border-[var(--border-hover)]",
  danger: "font-medium text-[var(--text)] hover:text-red-400 hover:bg-red-500/10",
  bare: "",
};

// `md` is 44px tall — the same height as the app's border-2 py-2.5 inputs, so
// buttons sitting next to a text field line up with it.
const SIZES: Record<ButtonSize, string> = {
  xs: "h-7 px-2.5 text-xs rounded-lg active:scale-[0.95]",
  sm: "h-8 px-3 text-sm rounded-lg active:scale-[0.97]",
  md: "h-11 px-4 text-sm rounded-xl active:scale-[0.98]",
  pill: "h-7 px-2.5 text-xs rounded-full active:scale-[0.95]",
  "icon-xs": "h-7 w-7 text-xs rounded-lg active:scale-[0.92]",
  "icon-sm": "h-8 w-8 text-sm rounded-lg active:scale-[0.92]",
  "icon-md": "h-11 w-11 rounded-xl active:scale-[0.94]",
};

export function buttonClass(variant: ButtonVariant, size: ButtonSize, extra = ""): string {
  return [BASE, VARIANTS[variant], SIZES[size], extra].filter(Boolean).join(" ");
}
