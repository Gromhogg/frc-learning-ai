import { createBrowserRouter, RouterProvider, Outlet, useNavigate, Navigate, useLocation, useRouteError, isRouteErrorResponse } from "react-router-dom";
import type { ReactNode } from "react";
import { useState, useEffect, useRef } from "react";
import Home from "./pages/Home";
import Chat from "./pages/Chat";
import Results from "./pages/Results";
import Admin from "./pages/Admin";
import Login from "./pages/Login";
import Topics from "./pages/Topics";
import AuthCallback from "./pages/AuthCallback";
import Pending from "./pages/Pending";
import AskPanel from "./components/ask-panel";
import { ModeProvider, useModeContext } from "./context/ModeContext";
import { AuthProvider, useAuth } from "./context/AuthContext";

// ── Route guards ──────────────────────────────────────────────────────────────

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.status === "pending" || user.status === "rejected") return <Navigate to="/pending" replace />;
  if (user.role === "admin" || user.role === "manager") return <Navigate to="/admin" replace />;
  return <>{children}</>;
}

function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "admin" && user.role !== "manager") return <Navigate to="/" replace />;
  return <>{children}</>;
}

// ── Hamburger menu ────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  {
    label: "Topics",
    path: "/topics",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
      </svg>
    ),
  },
  {
    label: "My Results",
    path: "/results",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
      </svg>
    ),
  },
  {
    label: "New Assessment",
    path: "/",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
      </svg>
    ),
  },
];

function HamburgerMenu({ onOpenAsk }: { onOpenAsk: () => void }) {
  const { user, logout } = useAuth();
  const { isAdmin, setIsAdmin } = useModeContext();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleOutsideClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [open]);

  const hidden = location.pathname === "/chat";
  if (hidden) return null;

  function go(path: string) {
    navigate(path);
    setOpen(false);
  }

  function goAdmin() {
    setIsAdmin(true);
    navigate("/admin");
    setOpen(false);
  }

  function handleLogout() {
    logout();
    navigate("/login");
    setOpen(false);
  }


  return (
    <div ref={menuRef} className="fixed top-4 left-4 z-50">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Open menu"
        className={[
          "flex flex-col justify-center items-center w-10 h-10 rounded-xl border transition-all duration-150 shadow-lg gap-1.5",
          open
            ? "bg-[var(--accent)] border-[var(--accent)]"
            : "bg-[var(--card-bg)] border-[var(--border)] hover:border-[var(--accent)]",
        ].join(" ")}
      >
        <span className={`block w-5 h-0.5 rounded-full transition-all duration-200 ${open ? "bg-white rotate-45 translate-y-2" : "bg-[var(--text-h)]"}`} />
        <span className={`block w-5 h-0.5 rounded-full transition-all duration-200 ${open ? "bg-white opacity-0" : "bg-[var(--text-h)]"}`} />
        <span className={`block w-5 h-0.5 rounded-full transition-all duration-200 ${open ? "bg-white -rotate-45 -translate-y-2" : "bg-[var(--text-h)]"}`} />
      </button>

      {open && (
        <div className="mt-2 w-56 rounded-xl border border-[var(--border)] bg-[var(--card-bg)] shadow-2xl overflow-hidden">
          {/* User badge */}
          {user && (
            <div className="px-4 py-3 border-b border-[var(--border)] flex items-center gap-2">
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt={user.name} className="w-7 h-7 rounded-full" />
              ) : (
                <span className="w-7 h-7 rounded-full bg-[var(--accent-bg)] border border-[var(--accent-border)] flex items-center justify-center text-xs font-bold text-[var(--accent)]">
                  {user.name.charAt(0).toUpperCase()}
                </span>
              )}
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-semibold text-[var(--text-h)] truncate">{user.name}</span>
                {(user.role === "admin" || user.role === "manager") && (
                  <span className="text-[10px] text-[var(--accent)] font-semibold uppercase tracking-wide">
                    {user.id === 0 ? "Developer" : user.role === "manager" ? "Manager" : "Admin"}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Nav links */}
          {user && (
            <nav className="py-1">
              {NAV_ITEMS.map((item) => (
                <button
                  key={item.label}
                  onClick={() => go(item.path)}
                  className={[
                    "w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors duration-100",
                    location.pathname === item.path
                      ? "text-[var(--accent)] bg-[var(--accent-bg)]"
                      : "text-[var(--text-h)] hover:bg-[var(--accent-bg)] hover:text-[var(--accent)]",
                  ].join(" ")}
                >
                  <span className="opacity-70">{item.icon}</span>
                  {item.label}
                </button>
              ))}

              <button
                onClick={() => { onOpenAsk(); setOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left text-[var(--text-h)] hover:bg-[var(--accent-bg)] hover:text-[var(--accent)] transition-colors duration-100"
              >
                <span className="opacity-70">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  </svg>
                </span>
                Ask AI
              </button>

              {/* Admin panel link — for admins and managers */}
              {(user.role === "admin" || user.role === "manager") && (
                <button
                  onClick={goAdmin}
                  className={[
                    "w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors duration-100",
                    isAdmin
                      ? "text-[var(--accent)] bg-[var(--accent-bg)]"
                      : "text-[var(--text-h)] hover:bg-[var(--accent-bg)] hover:text-[var(--accent)]",
                  ].join(" ")}
                >
                  <span className="opacity-70">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                    </svg>
                  </span>
                  Admin Panel
                </button>
              )}
            </nav>
          )}

          {/* Sign out */}
          {user && (
            <div className="border-t border-[var(--border)] py-1">
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left text-[var(--text)] hover:bg-red-500/10 hover:text-red-400 transition-colors duration-100"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16" className="opacity-70">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
                Sign out
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── App layout ────────────────────────────────────────────────────────────────

function AppLayout() {
  const location = useLocation();
  const [askOpen, setAskOpen] = useState(false);
  const askHidden = ["/login", "/chat", "/pending", "/auth/callback"].includes(location.pathname);

  useEffect(() => {
    if (askHidden && askOpen) setAskOpen(false);
  }, [askHidden, askOpen]);

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] flex flex-col">
      <HamburgerMenu onOpenAsk={() => setAskOpen(true)} />
      {!askHidden && <AskPanel open={askOpen} onClose={() => setAskOpen(false)} />}
      <Outlet />
    </div>
  );
}

// ── Error boundary ────────────────────────────────────────────────────────────

function RouteErrorBoundary() {
  const error = useRouteError();
  const navigate = useNavigate();

  let title = "Something went wrong";
  let message = "An unexpected error occurred.";

  if (isRouteErrorResponse(error)) {
    title = `${error.status} — ${error.statusText}`;
    message = typeof error.data === "string" ? error.data : message;
  } else if (error instanceof Error) {
    message = error.message;
  }

  return (
    <main className="flex flex-col flex-1 items-center justify-center min-h-screen bg-[var(--bg)] px-4">
      <div className="w-full max-w-md rounded-2xl border-2 border-red-500/40 bg-red-500/10 px-6 py-6 text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center mb-4">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-400">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <h1 className="text-lg font-bold text-[var(--text-h)]">{title}</h1>
        <p className="text-sm text-[var(--text)] mt-2 break-words">{message}</p>
        <div className="flex gap-2 justify-center mt-5">
          <button
            onClick={() => navigate("/")}
            className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-semibold hover:opacity-85 transition-opacity"
          >
            Go Home
          </button>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-lg border border-[var(--border)] text-[var(--text)] text-sm font-semibold hover:text-[var(--text-h)] transition-colors"
          >
            Reload
          </button>
        </div>
      </div>
    </main>
  );
}

// ── Router ────────────────────────────────────────────────────────────────────

const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    errorElement: <RouteErrorBoundary />,
    children: [
      { path: "login", element: <Login /> },
      { path: "auth/callback", element: <AuthCallback /> },
      { path: "pending", element: <Pending /> },
      { path: "admin", element: <RequireAdmin><Admin /></RequireAdmin> },
      { index: true, element: <RequireAuth><Home /></RequireAuth> },
      { path: "topics", element: <RequireAuth><Topics /></RequireAuth> },
      { path: "chat", element: <RequireAuth><Chat /></RequireAuth> },
      { path: "results", element: <RequireAuth><Results /></RequireAuth> },
    ],
  },
]);

// ── Root ──────────────────────────────────────────────────────────────────────

function App() {
  return (
    <AuthProvider>
      <ModeProvider>
        <RouterProvider router={router} />
      </ModeProvider>
    </AuthProvider>
  );
}

export default App;
