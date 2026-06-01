import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  avatarUrl?: string | null;
  role: "student" | "admin" | "manager";
  status: "pending" | "approved" | "rejected";
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  setSession: (token: string, user: AuthUser) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  loading: true,
  setSession: () => {},
  logout: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // On mount, restore session from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("auth_token");
    if (!saved) { setLoading(false); return; }

    // Legacy (password) sessions store the user directly as JSON
    if (saved === "legacy") {
      const savedUser = localStorage.getItem("auth_user");
      if (savedUser) {
        try { setUser(JSON.parse(savedUser) as AuthUser); } catch { /* ignore */ }
      }
      setToken("legacy");
      setLoading(false);
      return;
    }

    // Google JWT sessions — verify with server
    fetch("http://localhost:3001/auth/me", {
      headers: { Authorization: `Bearer ${saved}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: AuthUser | null) => {
        if (data) { setToken(saved); setUser(data); }
        else { localStorage.removeItem("auth_token"); }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function setSession(newToken: string, newUser: AuthUser) {
    localStorage.setItem("auth_token", newToken);
    if (newToken === "legacy") {
      localStorage.setItem("auth_user", JSON.stringify(newUser));
    }
    setToken(newToken);
    setUser(newUser);
  }

  function logout() {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_user");
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, setSession, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
