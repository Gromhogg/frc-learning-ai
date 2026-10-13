import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { useAuth, type AuthUser } from "../auth/auth-context";
import { api, API_BASE, errorMessage } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input, Label } from "../components/ui/input";
import { Logo } from "../components/ui/misc";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.77.42 3.45 1.18 4.94l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38z" />
    </svg>
  );
}

export default function Login() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user, loading, setSession } = useAuth();

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [adminCode, setAdminCode] = useState("");
  const [error, setError] = useState<string | null>(
    params.get("error") === "oauth_failed" ? "Google sign-in didn't finish. Try again." : null,
  );
  const [busy, setBusy] = useState(false);

  // Already signed in? Go straight to the chat.
  useEffect(() => {
    if (!loading && user) navigate("/", { replace: true });
  }, [loading, user, navigate]);

  const signup = mode === "signup";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ token: string; user: AuthUser }>(signup ? "/auth/register" : "/auth/login", {
        method: "POST",
        body: JSON.stringify(
          signup ? { name, email, password, adminCode: adminCode.trim() || undefined } : { name, password },
        ),
      });
      setSession(result.token, result.user);
      navigate("/", { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative flex min-h-full items-center justify-center overflow-hidden px-4 py-10">
      {/* Soft accent glow behind the card. */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-[-20%] left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full opacity-60 blur-3xl"
        style={{ background: "radial-gradient(closest-side, var(--accent-soft), transparent)" }}
      />
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-[380px]"
      >
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo size={44} />
          <h1 className="mt-5 text-2xl font-semibold tracking-tight">
            {signup ? "Create your account" : "Welcome back"}
          </h1>
          <p className="mt-1.5 text-sm text-muted">Your team's robotics mentor — the shop, the robot, FRC.</p>
        </div>

        <div className="rounded-2xl border border-line bg-surface p-6 shadow-float">
          <Button
            variant="outline"
            size="lg"
            className="w-full"
            onClick={() => {
              window.location.href = `${API_BASE}/auth/google`;
            }}
          >
            <GoogleIcon />
            Continue with Google
          </Button>

          <div className="my-5 flex items-center gap-3 text-xs text-faint">
            <span className="h-px flex-1 bg-line" />
            or
            <span className="h-px flex-1 bg-line" />
          </div>

          <form onSubmit={submit} className="flex flex-col gap-4">
            <div>
              <Label htmlFor="name">{signup ? "Name" : "Name or email"}</Label>
              <Input id="name" autoComplete="username" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <AnimatePresence initial={false}>
              {signup ? (
                <motion.div
                  key="email"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="-m-1 overflow-hidden p-1"
                >
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </motion.div>
              ) : null}
            </AnimatePresence>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete={signup ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <AnimatePresence initial={false}>
              {signup ? (
                <motion.div
                  key="code"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="-m-1 overflow-hidden p-1"
                >
                  <Label htmlFor="code">
                    Admin code <span className="font-normal text-faint">(mentors only)</span>
                  </Label>
                  <Input id="code" type="password" value={adminCode} onChange={(e) => setAdminCode(e.target.value)} />
                </motion.div>
              ) : null}
            </AnimatePresence>

            {error ? <p className="rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p> : null}

            <Button type="submit" variant="primary" size="lg" disabled={busy} className="mt-1 w-full">
              {busy ? "One moment…" : signup ? "Create account" : "Sign in"}
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-muted">
          {signup ? "Already have an account?" : "New here?"}{" "}
          <button
            type="button"
            onClick={() => {
              setMode(signup ? "signin" : "signup");
              setError(null);
            }}
            className="font-medium text-accent hover:underline"
          >
            {signup ? "Sign in" : "Create an account"}
          </button>
        </p>
      </motion.div>
    </main>
  );
}
