import { useState } from "react";

// What this browser remembers about the floating prompt assistant: whether
// it was open, where it was, and how big. Kept apart from the window
// component so the admin layout can read "open" without loading the window.

export const STORE_KEY = "assistant-window";

/** The window's top-left corner and size, in pixels. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function readStored(): { open: boolean; box: Partial<Box> } {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? "null") as Record<string, unknown> | null;
    const box: Partial<Box> = {};
    for (const key of ["x", "y", "w", "h"] as const) {
      if (typeof saved?.[key] === "number") box[key] = saved[key];
    }
    return { open: saved?.open === true, box };
  } catch {
    return { open: false, box: {} };
  }
}

export function useAssistantWindow() {
  const [open, setOpen] = useState(() => readStored().open);
  return { open, setOpen, toggle: () => setOpen((o) => !o) };
}
