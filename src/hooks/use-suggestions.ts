import { useEffect, useState } from "react";
import { api } from "../lib/api";

// Starter suggestions for the empty chat screen. There are none until the
// AI has learned what this person is into; then they get their own 4.

export interface Suggestions {
  suggestions: string[];
  personalized: boolean;
}

// The last answer (and whose it was), so opening another new chat shows it
// straight away.
let last: { userId: number; reply: Suggestions | null } | null = null;

export function useSuggestions(user: { id: number; role: "student" | "admin" } | null) {
  const userId = user?.id ?? 0;
  const fallback: Suggestions = { suggestions: [], personalized: false };
  const [reply, setReply] = useState<Suggestions | null>(last?.userId === userId ? last.reply : null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api<Suggestions>("/api/suggestions")
      .then((data) => {
        if (cancelled) return;
        const ok = data.personalized && Array.isArray(data.suggestions) && data.suggestions.length === 4;
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
