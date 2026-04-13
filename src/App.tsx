import { BrowserRouter, Routes, Route, useNavigate, Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useState, useEffect, useRef } from "react";
import Home from "./pages/Home";
import Chat from "./pages/Chat";
import Results from "./pages/Results";
import Admin from "./pages/Admin";
import Login from "./pages/Login";
import { ModeProvider, useModeContext } from "./context/ModeContext";
import { AuthProvider, useAuth } from "./context/AuthContext";

// ── Require login for student routes ─────────────────────────────────────────

function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

// ── Dev Mode panel — bottom left, always visible ──────────────────────────────

interface DevUser { id: number; name: string; }

function DevMode() {
  const { isAdmin, setIsAdmin } = useModeContext();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<DevUser[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);

  // Fetch student list when panel opens
  useEffect(() => {
    if (!open) return;
    fetch("http://localhost:3001/api/users")
      .then((r) => r.json() as Promise<DevUser[]>)
      .then(setUsers)
      .catch(() => {});
  }, [open]);

  // Close panel on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function goAdmin() {
    setIsAdmin(true);
    navigate("/admin");
    setOpen(false);
  }

  function goStudent(u: DevUser) {
    setIsAdmin(false);
    login({ id: u.id, name: u.name });
    navigate("/");
    setOpen(false);
  }

  return (
    <div ref={panelRef} className="fixed bottom-4 left-4 z-50 flex flex-col items-start gap-2">
      {/* Panel */}
      {open && (
        <div className="mb-1 w-52 rounded-xl border border-[var(--border)] bg-[var(--card-bg)] shadow-2xl overflow-hidden">
          <p className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-[var(--text)] opacity-50 border-b border-[var(--border)]">
            Dev Mode
          </p>

          {/* Admin */}
          <button
            onClick={goAdmin}
            className={[
              "w-full flex items-center gap-2 px-3 py-2.5 text-xs font-semibold text-left transition-colors",
              isAdmin
                ? "text-[var(--accent)] bg-[var(--accent-bg)]"
                : "text-[var(--text-h)] hover:bg-[var(--accent-bg)] hover:text-[var(--accent)]",
            ].join(" ")}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            Admin
            {isAdmin && <span className="ml-auto text-[10px] opacity-60">active</span>}
          </button>

          {/* Students */}
          {users.length > 0 && (
            <>
              <p className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-[var(--text)] opacity-50 border-t border-[var(--border)]">
                Students
              </p>
              {users.map((u) => (
                <button
                  key={u.id}
                  onClick={() => goStudent(u)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[var(--text-h)] text-left hover:bg-[var(--accent-bg)] hover:text-[var(--accent)] transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  {u.name}
                </button>
              ))}
            </>
          )}
        </div>
      )}

      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={[
          "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all duration-150 shadow-lg",
          open
            ? "bg-[var(--accent)] text-white border-[var(--accent)]"
            : "bg-[var(--card-bg)] text-[var(--text)] border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--accent)]",
        ].join(" ")}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14" />
        </svg>
        Dev Mode
      </button>
    </div>
  );
}

// ── App layout ────────────────────────────────────────────────────────────────

function AppLayout() {
  return (
    <div className="min-h-screen bg-[#0f172a] text-[var(--text)] flex flex-col">
      <DevMode />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/" element={<RequireAuth><Home /></RequireAuth>} />
        <Route path="/chat" element={<RequireAuth><Chat /></RequireAuth>} />
        <Route path="/results" element={<RequireAuth><Results /></RequireAuth>} />
      </Routes>
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────

function App() {
  return (
    <AuthProvider>
      <ModeProvider>
        <BrowserRouter>
          <AppLayout />
        </BrowserRouter>
      </ModeProvider>
    </AuthProvider>
  );
}

export default App;
