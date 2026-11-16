import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { KeyRound } from "lucide-react";
import { useAuth } from "../../auth/auth-context";
import { api } from "../../lib/api";
import { buttonClass } from "../ui/button-class";

// Shown on the empty chat screen until there's a Claude API key to answer
// with, so nobody types a question into a bot that's switched off.
export function KeyNotice() {
  const { user } = useAuth();
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    api<{ own: unknown; teamKey: boolean }>("/api/me/api-key")
      .then((data) => setMissing(!data.own && !data.teamKey))
      .catch(() => {});
  }, []);

  if (!missing || !user) return null;

  const admin = user.role === "admin";
  return (
    <div className="mb-4 flex items-start gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-fg-2">
      <KeyRound className="mt-0.5 size-4 shrink-0 text-accent-text" aria-hidden />
      <div className="flex-1">
        {admin ? (
          <>
            <p className="font-medium text-fg">The bot is off until the team's Claude API key is added.</p>
            <p className="mt-0.5">Paste it once and it works for everyone.</p>
          </>
        ) : (
          <p>The bot isn't turned on yet. A mentor needs to add the team's API key first.</p>
        )}
      </div>
      {admin ? (
        <Link to="/admin/settings" className={buttonClass("primary", "sm")}>
          Add the key
        </Link>
      ) : null}
    </div>
  );
}
