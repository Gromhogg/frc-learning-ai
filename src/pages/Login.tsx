import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const STUDENT_PASSWORD = "1234";

interface User {
  id: number;
  name: string;
}

export default function Login() {
  const { user, loading, setSession } = useAuth();
  const navigate = useNavigate();

  const params = new URLSearchParams(window.location.search);
  const error = params.get("error");

  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      if (user.status === "approved") navigate("/", { replace: true });
      else if (user.status === "pending") navigate("/pending", { replace: true });
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    fetch("http://localhost:3001/api/users")
      .then((r) => r.json() as Promise<User[]>)
      .then(setUsers)
      .catch(() => setFormError("Could not reach the server. Make sure it is running on port 3001."))
      .finally(() => setLoadingUsers(false));
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!selectedUserId) { setFormError("Please select your name."); return; }
    if (!password) { setFormError("Please enter the password."); return; }

    setSubmitting(true);

    if (password !== STUDENT_PASSWORD) {
      setFormError("Incorrect password. Try again.");
      setSubmitting(false);
      return;
    }

    const u = users.find((u) => u.id === selectedUserId);
    if (!u) return;

    // Log in directly via the legacy path — synthesise an AuthUser
    setSession("legacy", {
      id: u.id,
      name: u.name,
      email: "",
      role: "student",
      status: "approved",
    });
    navigate("/");
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
            <span>Robotics Team</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-[var(--text-h)]">
            FRC Knowledge Assessment
          </h1>
          <p className="text-sm text-[var(--text)] mt-2">Sign in to begin your session.</p>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] px-6 py-7 flex flex-col gap-5 shadow-xl">

          {/* Google error banners */}
          {error === "wrong_domain" && (
            <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">
              Only <strong>@lgsstudent.org</strong> accounts are allowed.
            </div>
          )}
          {error === "oauth_failed" && (
            <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">
              Google sign-in failed. Please try again.
            </div>
          )}

          {/* Manual sign-in form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* Name selector */}
            <div>
              <label htmlFor="name-select" className="block text-xs font-semibold uppercase tracking-widest text-[var(--text)] mb-2">
                Your Name
              </label>
              {loadingUsers ? (
                <div className="h-10 rounded-xl bg-[var(--border)] animate-pulse" />
              ) : (
                <select
                  id="name-select"
                  value={selectedUserId ?? ""}
                  onChange={(e) => { setSelectedUserId(e.target.value ? Number(e.target.value) : null); setFormError(null); }}
                  className={[
                    "w-full rounded-xl border-2 px-4 py-2.5 text-sm font-medium appearance-none",
                    "bg-[var(--card-bg)] text-[var(--text-h)]",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
                    "transition-colors duration-150 cursor-pointer",
                    selectedUserId
                      ? "border-[var(--accent)] bg-[var(--accent-bg)]"
                      : "border-[var(--border)] hover:border-[var(--accent-border)]",
                  ].join(" ")}
                >
                  <option value="">— Select your name —</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              )}
            </div>

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
                autoComplete="current-password"
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
              disabled={submitting || loadingUsers}
              className="w-full py-2.5 rounded-xl bg-[var(--accent)] text-white text-sm font-bold hover:opacity-85 disabled:opacity-40 transition-opacity"
            >
              Sign In
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-[var(--border)]" />
            <span className="text-xs text-[var(--text)] opacity-50 font-medium">or</span>
            <div className="flex-1 h-px bg-[var(--border)]" />
          </div>

          {/* Google button */}
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
        </div>
      </div>
    </main>
  );
}
