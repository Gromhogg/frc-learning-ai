import { useState } from "react";
import { api } from "../lib/api";
import type { AuthUser } from "../context/auth-context";

interface Props {
  onClose: () => void;
  onSuccess: (token: string, user: AuthUser) => void;
}

/** The teacher code is the only way to become a teacher. */
export default function TeacherCodeDialog({ onClose, onSuccess }: Props) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || busy) return;

    setBusy(true);
    setError(null);
    try {
      const result = await api<{ token: string; user: AuthUser }>("/auth/teacher-code", {
        method: "POST",
        body: JSON.stringify({ code: code.trim() }),
      });
      onSuccess(result.token, result.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-6 shadow-2xl"
      >
        <h2 className="text-base font-bold text-[var(--text-h)]">Enter teacher code</h2>
        <p className="text-sm text-[var(--text)] mt-1.5 leading-relaxed">
          Teachers can edit the AI's instructions. Ask a mentor for the code.
        </p>

        <input
          type="password"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoFocus
          placeholder="Teacher code"
          className="w-full mt-4 rounded-xl border-2 border-[var(--border)] bg-[var(--code-bg)] px-4 py-2.5 text-sm text-[var(--text-h)] placeholder:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        />

        {error && <p className="text-xs text-red-400 mt-2">{error}</p>}

        <div className="flex gap-2 mt-5">
          <button
            type="submit"
            disabled={!code.trim() || busy}
            className="flex-1 px-4 py-2.5 rounded-xl bg-[var(--accent)] text-white text-sm font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            {busy ? "Checking…" : "Confirm"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-[var(--border)] text-[var(--text-h)] text-sm font-semibold hover:bg-[var(--bg)] transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
