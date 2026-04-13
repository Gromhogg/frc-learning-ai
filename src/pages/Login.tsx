import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const STUDENT_PASSWORD = "1234";

interface User {
  id: number;
  name: string;
}

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);


  useEffect(() => {
    fetch("http://localhost:3001/api/users")
      .then((r) => r.json() as Promise<User[]>)
      .then((data) => setUsers(data))
      .catch(() => setError("Could not reach the server. Make sure it is running on port 3001."))
      .finally(() => setLoadingUsers(false));
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!selectedUserId) {
      setError("Please select your name.");
      return;
    }
    if (!password) {
      setError("Please enter the password.");
      return;
    }

    setSubmitting(true);

    if (password !== STUDENT_PASSWORD) {
      setError("Incorrect password. Try again.");
      setSubmitting(false);
      return;
    }

    const user = users.find((u) => u.id === selectedUserId);
    if (!user) return;

    login({ id: user.id, name: user.name });
    navigate("/");
  }

  return (
    <main className="flex flex-col flex-1 items-center justify-center min-h-screen bg-[var(--bg)] px-4">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4 px-3 py-1 rounded-full border border-[var(--accent-border)] bg-[var(--accent-bg)] text-xs font-semibold tracking-widest uppercase text-[var(--accent)]">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2"/></svg>
            <span>Robotics Team</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-[var(--text-h)]">
            FRC Knowledge Assessment
          </h1>
          <p className="text-sm text-[var(--text)] mt-2">Sign in to begin your session.</p>
        </div>

        {/* Card */}
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] px-6 py-7 flex flex-col gap-5 shadow-xl"
        >
          {/* Name selector */}
          <div>
            <label
              htmlFor="name-select"
              className="block text-xs font-semibold uppercase tracking-widest text-[var(--text)] mb-2"
            >
              Your Name
            </label>
            {loadingUsers ? (
              <div className="h-10 rounded-xl bg-[var(--border)] animate-pulse" />
            ) : (
              <select
                id="name-select"
                value={selectedUserId ?? ""}
                onChange={(e) => {
                  setSelectedUserId(e.target.value ? Number(e.target.value) : null);
                  setError(null);
                }}
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
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Password */}
          <div>
            <label
              htmlFor="password"
              className="block text-xs font-semibold uppercase tracking-widest text-[var(--text)] mb-2"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(null);
              }}
              placeholder="Enter password"
              autoComplete="current-password"
              className={[
                "w-full rounded-xl border-2 px-4 py-2.5 text-sm font-medium",
                "bg-[var(--card-bg)] text-[var(--text-h)]",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
                "transition-colors duration-150 placeholder:text-[var(--text)] placeholder:opacity-40",
                error && password
                  ? "border-red-500/60"
                  : "border-[var(--border)] hover:border-[var(--accent-border)]",
              ].join(" ")}
            />
          </div>

          {/* Error */}
          {error && (
            <p className="text-xs text-red-400 -mt-2">{error}</p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting || loadingUsers}
            className="w-full py-2.5 rounded-xl bg-[var(--accent)] text-white text-sm font-bold hover:opacity-85 disabled:opacity-40 transition-opacity"
          >
            Sign In
          </button>
        </form>
      </div>
    </main>
  );
}
