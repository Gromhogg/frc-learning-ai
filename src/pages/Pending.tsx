import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Pending() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  if (user?.status === "rejected") {
    return (
      <main className="flex flex-col flex-1 items-center justify-center min-h-screen bg-[var(--bg)] px-4">
        <div className="w-full max-w-sm text-center flex flex-col gap-6">
          <div className="mx-auto w-14 h-14 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-400">
              <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-h)]">Access Denied</h1>
            <p className="text-sm text-[var(--text)] mt-2">
              Your account request was not approved. Contact your team admin if you think this is a mistake.
            </p>
          </div>
          <button onClick={handleLogout} className="mx-auto text-sm text-[var(--text)] hover:text-red-400 transition-colors">
            Sign out
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-col flex-1 items-center justify-center min-h-screen bg-[var(--bg)] px-4">
      <div className="w-full max-w-sm text-center flex flex-col gap-6">
        <div className="mx-auto w-14 h-14 rounded-full bg-[var(--accent-bg)] border border-[var(--accent-border)] flex items-center justify-center">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--accent)]">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-h)]">Awaiting Approval</h1>
          <p className="text-sm text-[var(--text)] mt-2">
            Hi <strong>{user?.name}</strong> — your account is pending admin approval.
            You'll be able to sign in once a team admin approves your request.
          </p>
        </div>
        {user?.avatarUrl && (
          <img
            src={user.avatarUrl}
            alt={user.name}
            className="mx-auto w-12 h-12 rounded-full border-2 border-[var(--accent-border)]"
          />
        )}
        <button onClick={handleLogout} className="mx-auto text-sm text-[var(--text)] hover:text-red-400 transition-colors">
          Sign out and use a different account
        </button>
      </div>
    </main>
  );
}
