import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/auth-context";
import type { AuthUser } from "../context/auth-context";
import { API_BASE } from "../lib/api";

/** Where Google sends people back to after they sign in. */
export default function AuthCallback() {
  const { setSession } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");

    if (!token) {
      navigate("/login?error=oauth_failed", { replace: true });
      return;
    }

    fetch(`${API_BASE}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("bad token"))))
      .then((user: AuthUser) => {
        setSession(token, user);
        navigate("/", { replace: true });
      })
      .catch(() => navigate("/login?error=oauth_failed", { replace: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="flex flex-col flex-1 items-center justify-center min-h-screen bg-[var(--bg)]">
      <div className="flex flex-col items-center gap-4 text-[var(--text)]">
        <div className="w-8 h-8 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin" />
        <p className="text-sm">Signing you in…</p>
      </div>
    </main>
  );
}
