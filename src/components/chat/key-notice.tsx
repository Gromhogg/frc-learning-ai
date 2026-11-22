import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { KeyRound } from "lucide-react";
import { useAuth } from "../../auth/auth-context";
import { api } from "../../lib/api";
import { buttonClass } from "../ui/button-class";

// Shown on the empty chat screen when the team's free AI has used up its
// daily allowance, so nobody types a question that can't be answered.
export function KeyNotice() {
  const { user } = useAuth();
  const [backAt, setBackAt] = useState<string | null>(null);

  useEffect(() => {
    api<{ own: unknown; team: { usedUp: boolean; backAt: string } }>("/api/me/api-key")
      .then((data) => setBackAt(!data.own && data.team.usedUp ? data.team.backAt : null))
      .catch(() => {});
  }, []);

  if (!backAt || !user) return null;

  const admin = user.role === "admin";
  return (
    <div className="mb-4 flex items-start gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-fg-2">
      <KeyRound className="mt-0.5 size-4 shrink-0 text-accent-text" aria-hidden />
      <div className="flex-1">
        <p className="font-medium text-fg">The free AI is used up for today. It's back at {backAt}.</p>
        <p className="mt-0.5">
          {admin
            ? "To keep going, add a Claude or OpenAI key in Settings."
            : "To keep going now, add your own Claude or OpenAI key under API key in the menu."}
        </p>
      </div>
      {admin ? (
        <Link to="/admin/settings" className={buttonClass("primary", "sm")}>
          Add a key
        </Link>
      ) : null}
    </div>
  );
}
