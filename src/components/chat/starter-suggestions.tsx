import { Sparkles } from "lucide-react";
import { useAuth } from "../../auth/auth-context";
import { useSuggestions } from "../../hooks/use-suggestions";

// Starter chips on the empty chat screen. Everyone starts with the built-in
// ones; once the AI has learned what someone is into, they get their own.

export function StarterSuggestions({ onPick }: { onPick: (text: string) => void }) {
  const { user } = useAuth();
  const { suggestions, personalized } = useSuggestions(user);

  return (
    <div className="relative mt-4">
      <div className="grid gap-2 sm:grid-cols-2">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            className="rounded-2xl border border-line bg-surface px-4 py-3 text-left text-sm text-fg-2 transition-colors hover:border-line-strong hover:bg-surface-2 hover:text-fg"
          >
            {s}
          </button>
        ))}
      </div>
      {/* Sits below the chips without taking space, so nothing moves when it appears. */}
      {personalized ? (
        <p className="absolute top-full left-1 mt-2 flex items-center gap-1 text-xs text-faint">
          <Sparkles className="size-3" aria-hidden />
          Picked for you
        </p>
      ) : null}
    </div>
  );
}
