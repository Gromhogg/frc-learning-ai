import { useState, useEffect, type ReactNode } from "react";
import { AuthContext, type AuthUser } from "./auth-context";
import { API_BASE } from "../lib/api";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);

  // Start in the loading state only if there's actually a token to check.
  const [loading, setLoading] = useState(() => localStorage.getItem("auth_token") !== null);

  // On page load, confirm the saved token still works.
  useEffect(() => {
    const saved = localStorage.getItem("auth_token");
    if (!saved) return;

    let cancelled = false;

    fetch(`${API_BASE}/auth/me`, { headers: { Authorization: `Bearer ${saved}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: AuthUser | null) => {
        if (cancelled) return;
        if (data) {
          setToken(saved);
          setUser(data);
        } else {
          localStorage.removeItem("auth_token");
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function setSession(newToken: string, newUser: AuthUser) {
    localStorage.setItem("auth_token", newToken);
    setToken(newToken);
    setUser(newUser);
  }

  function logout() {
    localStorage.removeItem("auth_token");
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, setSession, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
