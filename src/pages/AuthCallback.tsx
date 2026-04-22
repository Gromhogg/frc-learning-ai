import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import type { AuthUser } from "../context/AuthContext";

export default function AuthCallback() {
  const { setSession } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    const status = params.get("status");

    if (!token) {
      navigate("/login?error=oauth_failed", { replace: true });
      return;
    }

    // Fetch full user info from the backend using the token
    fetch("http://localhost:3001/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((user: AuthUser) => {
        setSession(token, user);
        if (status === "pending") {
          navigate("/pending", { replace: true });
        } else {
          navigate("/", { replace: true });
        }
      })
      .catch(() => {
        navigate("/login?error=oauth_failed", { replace: true });
      });
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
