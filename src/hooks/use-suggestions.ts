import { useEffect, useState } from "react";
import { api } from "../lib/api";

// Starter suggestions for the empty chat screen. Shows the built-in ones
// right away (and if the server can't be reached), then swaps in the
// person's own list when it arrives.

// Keep these in sync with server/lib/suggestions.ts.
export const STUDENT_STARTERS = [
  "How do I safely set up the vertical mill?",
  "Explain how a swerve drive works",
  "What's the difference between a NEO and a Falcon?",
  "Help me debug my command-based robot code",
];

export const MENTOR_STARTERS = [
  "How do I teach a new member to use the mill safely?",
  "Plan a 20-minute intro lesson on swerve drive",
  "How can I tell if a student really understands PID?",
  "What's a good first project for new programmers?",
];

export interface Suggestions {
  suggestions: string[];
  personalized: boolean;
}

// The last answer (and whose it was), so opening another new chat shows it
// straight away.
let last: { userId: number; reply: Suggestions | null } | null = null;

export function useSuggestions(user: { id: number; role: "student" | "admin" } | null) {
  const userId = user?.id ?? 0;
  const fallback: Suggestions = {
    suggestions: user?.role === "admin" ? MENTOR_STARTERS : STUDENT_STARTERS,
    personalized: false,
  };
  const [reply, setReply] = useState<Suggestions | null>(last?.userId === userId ? last.reply : null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api<Suggestions>("/api/suggestions")
      .then((data) => {
        if (cancelled) return;
        const ok = Array.isArray(data.suggestions) && data.suggestions.length === 4;
        const next = ok ? { suggestions: data.suggestions, personalized: !!data.personalized } : null;
        last = { userId, reply: next };
        setReply(next);
      })
      .catch(() => {
        if (!cancelled) setReply(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return { ...(reply ?? fallback), loading };
}
