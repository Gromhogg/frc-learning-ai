import { BrowserRouter, Routes, Route, useNavigate, useLocation, Navigate } from "react-router-dom";
import type { ReactNode } from "react";
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

// ── Mode toggle button — rendered on every page ───────────────────────────────

function ModeToggle() {
  const { isAdmin, setIsAdmin } = useModeContext();
  const navigate = useNavigate();
  const location = useLocation();
  const onChat = location.pathname === "/chat";

  function handleToggle() {
    const next = !isAdmin;
    setIsAdmin(next);
    navigate(next ? "/admin" : "/");
  }

  return (
    <button
      onClick={handleToggle}
      title={isAdmin ? "Switch to student mode" : "Switch to admin mode"}
      className={[
        `fixed ${onChat ? "top-16" : "top-4"} right-4 z-50 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all duration-150 shadow-lg`,
        isAdmin
          ? "bg-[var(--accent)] text-white border-[var(--accent)] hover:opacity-85"
          : "bg-[var(--card-bg)] text-[var(--text)] border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--accent)]",
      ].join(" ")}
    >
      {isAdmin ? (
        <>
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
          Student Mode
        </>
      ) : (
        <>
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          Admin Mode
        </>
      )}
    </button>
  );
}

// ── App layout ────────────────────────────────────────────────────────────────

function AppLayout() {
  return (
    <div className="min-h-screen bg-[#0f172a] text-[var(--text)] flex flex-col">
      <ModeToggle />
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
