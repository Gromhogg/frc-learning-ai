import { useEffect, useState, type ReactNode } from "react";
import { AuthContext, type AuthUser } from "./auth-context";
import { api, getToken, setToken } from "../lib/api";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  // Only show the loading state if there's a saved token to check.
  const [loading, setLoading] = useState(() => getToken() !== null);

  // On page load, confirm the saved token still works.
  useEffect(() => {
    if (!getToken()) return;
    let cancelled = false;
    api<AuthUser>("/auth/me")
      .then((me) => {
        if (!cancelled) setUser(me);
      })
      .catch(() => {
        if (!cancelled) setToken(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function setSession(token: string, next: AuthUser) {
    setToken(token);
    setUser(next);
  }

  function logout() {
    setToken(null);
    setUser(null);
  }

  return <AuthContext.Provider value={{ user, loading, setSession, logout }}>{children}</AuthContext.Provider>;
}
