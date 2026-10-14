import { lazy, Suspense, type ReactNode } from "react";
import { createBrowserRouter, Navigate, RouterProvider, useRouteError } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider } from "./auth/AuthProvider";
import { useAuth } from "./auth/auth-context";
import { TooltipProvider } from "./components/ui/tooltip";
import { Spinner } from "./components/ui/misc";
import { Button } from "./components/ui/button";
import Login from "./pages/Login";
import AuthCallback from "./pages/AuthCallback";
import ChatPage from "./pages/Chat";

// Admin pages are a separate download — students never load them.
const AdminLayout = lazy(() => import("./admin/AdminLayout"));
const PromptPage = lazy(() => import("./admin/PromptPage"));
const SuggestionsPage = lazy(() => import("./admin/SuggestionsPage"));
const FactsPage = lazy(() => import("./admin/FactsPage"));
const DocsPage = lazy(() => import("./admin/DocsPage"));
const HistoryPage = lazy(() => import("./admin/HistoryPage"));
const AdminsPage = lazy(() => import("./admin/AdminsPage"));
const SettingsPage = lazy(() => import("./admin/SettingsPage"));

function FullPageSpinner() {
  return (
    <div className="flex h-full items-center justify-center text-muted">
      <Spinner />
    </div>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <FullPageSpinner />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

// The real check is on the server; this just keeps students out of pages
// that would only show "Admins only" errors.
function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <FullPageSpinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "admin") return <Navigate to="/" replace />;
  return <Suspense fallback={<FullPageSpinner />}>{children}</Suspense>;
}

function RouteError() {
  const error = useRouteError();
  console.error(error);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-lg font-semibold">Something broke on this page.</p>
      <p className="max-w-sm text-sm text-muted">Reloading usually fixes it. If it keeps happening, tell a mentor.</p>
      <Button variant="primary" onClick={() => window.location.reload()}>
        Reload
      </Button>
    </div>
  );
}

const router = createBrowserRouter([
  { path: "/login", element: <Login />, errorElement: <RouteError /> },
  { path: "/auth/callback", element: <AuthCallback />, errorElement: <RouteError /> },
  {
    path: "/",
    element: (
      <RequireAuth>
        <ChatPage />
      </RequireAuth>
    ),
    errorElement: <RouteError />,
  },
  {
    path: "/c/:id",
    element: (
      <RequireAuth>
        <ChatPage />
      </RequireAuth>
    ),
    errorElement: <RouteError />,
  },
  {
    path: "/admin",
    element: (
      <RequireAdmin>
        <AdminLayout />
      </RequireAdmin>
    ),
    errorElement: <RouteError />,
    children: [
      { index: true, element: <Navigate to="prompt" replace /> },
      { path: "prompt", element: <PromptPage /> },
      { path: "suggestions", element: <SuggestionsPage /> },
      { path: "facts", element: <FactsPage /> },
      { path: "docs", element: <DocsPage /> },
      { path: "history", element: <HistoryPage /> },
      { path: "admins", element: <AdminsPage /> },
      { path: "settings", element: <SettingsPage /> },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);

export default function App() {
  return (
    <AuthProvider>
      <TooltipProvider>
        <RouterProvider router={router} />
        <Toaster
          position="bottom-center"
          toastOptions={{
            className: "!rounded-xl !border-line !bg-surface !text-fg !shadow-float !font-sans",
          }}
        />
      </TooltipProvider>
    </AuthProvider>
  );
}
