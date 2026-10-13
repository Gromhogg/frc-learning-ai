import { createContext, useContext } from "react";

export interface AuthUser {
  id: number;
  name: string;
  email: string | null;
  avatarUrl?: string | null;
  role: "student" | "admin";
}

export interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  setSession: (token: string, user: AuthUser) => void;
  logout: () => void;
}

// Lives in its own file so AuthProvider.tsx only exports a component —
// that's what keeps Vite's fast refresh working.
export const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  setSession: () => {},
  logout: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}
