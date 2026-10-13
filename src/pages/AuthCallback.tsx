import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, type AuthUser } from "../auth/auth-context";
import { API_BASE } from "../lib/api";
import { Spinner } from "../components/ui/misc";

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
    <main className="flex min-h-full items-center justify-center gap-3 text-sm text-muted">
      <Spinner /> Signing you in…
    </main>
  );
}
