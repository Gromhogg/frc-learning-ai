import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

type Mode = "signin" | "signup";

// Flip to true once real Google OAuth credentials are set in the server's .env
// (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET) and the redirect URI is registered.
const GOOGLE_ENABLED = false;

interface AuthResponse {
  token: string;
  user: {
    id: number;
    name: string;
    email: string | null;
    avatarUrl: string | null;
    role: "student" | "admin" | "manager";
    status: "pending" | "approved" | "rejected";
  };
  firstTime: boolean;
}

export default function Login() {
  const { user, loading, setSession } = useAuth();
  const navigate = useNavigate();

  const params = new URLSearchParams(window.location.search);
  const error = params.get("error");

  const [mode, setMode] = useState<Mode>("signin");
  const [nameInput, setNameInput] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      if (user.status === "approved") {
        navigate(user.role === "admin" || user.role === "manager" ? "/admin" : "/", { replace: true });
      } else if (user.status === "pending") {
        navigate("/pending", { replace: true });
      }
    }
  }, [user, loading, navigate]);

  function applySession(data: AuthResponse) {
    setSession(data.token, {
      id: data.user.id,
      name: data.user.name,
      email: data.user.email ?? "",
      avatarUrl: data.user.avatarUrl,
      role: data.user.role,
      status: data.user.status,
    });
    navigate(data.user.role === "admin" || data.user.role === "manager" ? "/admin" : "/");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const trimmedName = nameInput.trim();
    const trimmedEmail = emailInput.trim();

    if (mode === "signin") {
      if (!trimmedName) { setFormError("Please enter your name or email."); return; }
    } else {
      if (!trimmedName) { setFormError("Please enter your name."); return; }
      if (!trimmedEmail) { setFormError("Please enter your email."); return; }
    }
    if (!password) { setFormError("Please enter your password."); return; }

    setSubmitting(true);

    const endpoint = mode === "signin" ? "/auth/login" : "/auth/register";
    const body = mode === "signin"
      ? { name: trimmedName, password }
      : { name: trimmedName, email: trimmedEmail, password };

    try {
      const res = await fetch(`http://localhost:3001${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const { error: msg } = await res.json().catch(() => ({ error: "Something went wrong." })) as { error?: string };
        setFormError(msg ?? "Something went wrong.");
        setSubmitting(false);
        return;
      }

      applySession(await res.json() as AuthResponse);
    } catch {
      setFormError("Could not reach the server. Make sure it is running on port 3001.");
      setSubmitting(false);
    }
  }

  function switchMode(next: Mode) {
    setMode(next);
    setFormError(null);
    setPassword("");
  }

  function signInWithGoogle() {
    window.location.href = "http://localhost:3001/auth/google";
  }

  return (
    <main className="flex flex-col flex-1 items-center justify-start min-h-screen bg-[var(--bg)] px-4 pt-[15vh]">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4 px-3 py-1 rounded-full border border-[var(--accent-border)] bg-[var(--accent-bg)] text-xs font-semibold tracking-widest uppercase text-[var(--accent)]">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/>
              <path d="M12 2v2M12 20v2M2 12h2M20 12h2"/>
            </svg>
            <span>972 Iron Claw</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-[var(--text-h)]">
            FRC Knowledge Assessment
          </h1>
          <p className="text-sm text-[var(--text)] mt-2">
            {mode === "signin" ? "Sign in to begin your session." : "Create an account to get started."}
          </p>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] px-6 py-7 flex flex-col gap-5 shadow-xl">

          {/* Sign in / Sign up toggle */}
          <div className="flex p-1 rounded-xl bg-[var(--bg)] border border-[var(--border)]">
            {(["signin", "signup"] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => switchMode(m)}
                className={[
                  "flex-1 py-2 rounded-lg text-sm font-semibold transition-colors duration-150",
                  mode === m
                    ? "bg-[var(--accent)] text-white"
                    : "text-[var(--text)] hover:text-[var(--text-h)]",
                ].join(" ")}
              >
                {m === "signin" ? "Sign In" : "Sign Up"}
              </button>
            ))}
          </div>

          {/* Google error banner */}
          {GOOGLE_ENABLED && error === "oauth_failed" && (
            <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">
              Google sign-in failed. Please try again.
            </div>
          )}

          {/* Manual sign-in form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* Name input */}
            <div>
              <label htmlFor="name-input" className="block text-xs font-semibold uppercase tracking-widest text-[var(--text)] mb-2">
                {mode === "signin" ? "Name or Email" : "Your Name"}
              </label>
              <input
                id="name-input"
                type="text"
                value={nameInput}
                onChange={(e) => { setNameInput(e.target.value); setFormError(null); }}
                placeholder={mode === "signin" ? "Type your name or email" : "Type your name"}
                autoComplete={mode === "signin" ? "username" : "name"}
                autoCapitalize={mode === "signin" ? "none" : "words"}
                spellCheck={false}
                className={[
                  "w-full rounded-xl border-2 px-4 py-2.5 text-sm font-medium",
                  "bg-[var(--card-bg)] text-[var(--text-h)]",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
                  "transition-colors duration-150 placeholder:text-[var(--text)] placeholder:opacity-40",
                  nameInput.trim()
                    ? "border-[var(--accent)] bg-[var(--accent-bg)]"
                    : "border-[var(--border)] hover:border-[var(--accent-border)]",
                ].join(" ")}
              />
            </div>

            {/* Email input — sign up only */}
            {mode === "signup" && (
              <div>
                <label htmlFor="email-input" className="block text-xs font-semibold uppercase tracking-widest text-[var(--text)] mb-2">
                  Email
                </label>
                <input
                  id="email-input"
                  type="email"
                  value={emailInput}
                  onChange={(e) => { setEmailInput(e.target.value); setFormError(null); }}
                  placeholder="you@example.com"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  className={[
                    "w-full rounded-xl border-2 px-4 py-2.5 text-sm font-medium",
                    "bg-[var(--card-bg)] text-[var(--text-h)]",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
                    "transition-colors duration-150 placeholder:text-[var(--text)] placeholder:opacity-40",
                    emailInput.trim()
                      ? "border-[var(--accent)] bg-[var(--accent-bg)]"
                      : "border-[var(--border)] hover:border-[var(--accent-border)]",
                  ].join(" ")}
                />
              </div>
            )}

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-xs font-semibold uppercase tracking-widest text-[var(--text)] mb-2">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setFormError(null); }}
                placeholder="Enter password"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                className={[
                  "w-full rounded-xl border-2 px-4 py-2.5 text-sm font-medium",
                  "bg-[var(--card-bg)] text-[var(--text-h)]",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
                  "transition-colors duration-150 placeholder:text-[var(--text)] placeholder:opacity-40",
                  formError && password ? "border-red-500/60" : "border-[var(--border)] hover:border-[var(--accent-border)]",
                ].join(" ")}
              />
            </div>

            {formError && <p className="text-xs text-red-400 -mt-2">{formError}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 rounded-xl bg-[var(--accent)] text-white text-sm font-bold hover:opacity-85 disabled:opacity-40 transition-opacity"
            >
              {submitting ? "Please wait…" : mode === "signin" ? "Sign In" : "Create Account"}
            </button>
          </form>

          {/* Divider + Google button — hidden until OAuth credentials are configured */}
          {GOOGLE_ENABLED && (
            <>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-[var(--border)]" />
                <span className="text-xs text-[var(--text)] opacity-50 font-medium">or</span>
                <div className="flex-1 h-px bg-[var(--border)]" />
              </div>

              <button
                onClick={signInWithGoogle}
                className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-xl border-2 border-[var(--border)] bg-white text-gray-800 font-semibold text-sm hover:border-[var(--accent)] hover:shadow-md transition-all duration-150"
              >
                <svg width="18" height="18" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                  <path fill="none" d="M0 0h48v48H0z"/>
                </svg>
                Sign in with Google
              </button>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
