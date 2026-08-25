import { createBrowserRouter, RouterProvider, Navigate, useNavigate, useRouteError, isRouteErrorResponse } from "react-router-dom";
import type { ReactNode } from "react";
import Chat from "./pages/Chat";
import Login from "./pages/Login";
import Prompt from "./pages/Prompt";
import AuthCallback from "./pages/AuthCallback";
import { AuthProvider } from "./context/AuthContext";
import { useAuth } from "./context/auth-context";

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequireTeacher({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "teacher") return <Navigate to="/" replace />;
  return <>{children}</>;
}

function RouteErrorBoundary() {
  const error = useRouteError();
  const navigate = useNavigate();

  let title = "Something went wrong";
  let message = "An unexpected error occurred.";

  if (isRouteErrorResponse(error)) {
    title = `${error.status} — ${error.statusText}`;
    if (typeof error.data === "string") message = error.data;
  } else if (error instanceof Error) {
    message = error.message;
  }

  return (
    <main className="flex flex-col flex-1 items-center justify-center min-h-screen bg-[var(--bg)] px-4">
      <div className="w-full max-w-md rounded-2xl border-2 border-red-500/40 bg-red-500/10 px-6 py-6 text-center">
        <h1 className="text-lg font-bold text-[var(--text-h)]">{title}</h1>
        <p className="text-sm text-[var(--text)] mt-2 break-words">{message}</p>
        <div className="flex gap-2 justify-center mt-5">
          <button
            onClick={() => navigate("/")}
            className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-semibold hover:opacity-85 transition-opacity"
          >
            Back to chat
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

const router = createBrowserRouter([
  { path: "/login", element: <Login />, errorElement: <RouteErrorBoundary /> },
  { path: "/auth/callback", element: <AuthCallback />, errorElement: <RouteErrorBoundary /> },
  {
    path: "/prompt",
    element: <RequireTeacher><Prompt /></RequireTeacher>,
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: "/",
    element: <RequireAuth><Chat /></RequireAuth>,
    errorElement: <RouteErrorBoundary />,
  },
]);

export default function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}
