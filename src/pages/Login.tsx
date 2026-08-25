import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/auth-context";
import { api, API_BASE } from "../lib/api";
import type { AuthUser } from "../context/auth-context";

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, loading, setSession } = useAuth();

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [teacherCode, setTeacherCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Already signed in? Go straight to the chat.
  useEffect(() => {
    if (!loading && user) navigate("/", { replace: true });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (searchParams.get("error") === "oauth_failed") {
      setError("Google sign-in didn't complete. Try again.");
    }
  }, [searchParams]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;

    setBusy(true);
    setError(null);
    try {
      const body =
        mode === "signup"
          ? JSON.stringify({ name, email, password, teacherCode: teacherCode.trim() || undefined })
          : JSON.stringify({ name, password });

      const result = await api<{ token: string; user: AuthUser }>(
        mode === "signup" ? "/auth/register" : "/auth/login",
        { method: "POST", body },
      );

      setSession(result.token, result.user);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    "w-full rounded-xl border-2 border-[var(--border)] bg-[var(--code-bg)] px-4 py-2.5 text-sm text-[var(--text-h)] placeholder:text-[var(--text)] hover:border-[var(--accent-border)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] transition-colors";

  return (
    <main className="min-h-screen flex items-center justify-center bg-[var(--bg)] px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-[var(--text-h)]">Robotics Chat</h1>
          <p className="text-sm text-[var(--text)] mt-2">
            Ask anything about FRC, the shop, or the robot.
          </p>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-6">
          <a
            href={`${API_BASE}/auth/google`}
            className="w-full flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-xl border-2 border-[var(--border)] text-sm font-semibold text-[var(--text-h)] hover:border-[var(--accent-border)] transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1a11 11 0 0 0-9.82 6.05l3.66 2.84C6.71 7.29 9.14 5.38 12 5.38z" />
            </svg>
            Continue with Google
          </a>

          <div className="flex items-center gap-3 my-5">
            <span className="flex-1 h-px bg-[var(--border)]" />
            <span className="text-xs text-[var(--text)]">or</span>
            <span className="flex-1 h-px bg-[var(--border)]" />
          </div>

          <form onSubmit={submit} className="flex flex-col gap-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={mode === "signup" ? "Your name" : "Name or email"}
              className={inputClass}
            />

            {mode === "signup" && (
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                className={inputClass}
              />
            )}

            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className={inputClass}
            />

            {mode === "signup" && (
              <div>
                <input
                  type="password"
                  value={teacherCode}
                  onChange={(e) => setTeacherCode(e.target.value)}
                  placeholder="Teacher code (optional)"
                  className={inputClass}
                />
                <p className="text-xs text-[var(--text)] mt-1.5 px-1">
                  Leave blank if you're a student.
                </p>
              </div>
            )}

            {error && <p className="text-xs text-red-400 px-1">{error}</p>}

            <button
              type="submit"
              disabled={busy}
              className="w-full px-4 py-2.5 rounded-xl bg-[var(--accent)] text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {busy ? "…" : mode === "signup" ? "Create account" : "Sign in"}
            </button>
          </form>

          <button
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setError(null);
            }}
            className="w-full mt-4 text-xs text-[var(--text)] hover:text-[var(--accent)] transition-colors"
          >
            {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
          </button>
        </div>
      </div>
    </main>
  );
}
