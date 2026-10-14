import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { useAuth, type AuthUser } from "../auth/auth-context";
import { api, ApiError, API_BASE, errorMessage } from "../lib/api";
import { cn } from "../lib/cn";
import { Button } from "../components/ui/button";
import { Input, Label } from "../components/ui/input";
import { Logo, Spinner } from "../components/ui/misc";

// Same list and message as server/lib/school-email.ts — change both together.
// The server checks too; this is just so people see the problem right away.
const SCHOOL_DOMAINS = ["lghsstudent.org", "lghsuhsd.org"];
const SCHOOL_EMAIL_ERROR = "Please input your school email";
const MIN_PASSWORD = 6;
const CODE_LENGTH = 6;

function isSchoolEmail(email: string): boolean {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0 || /\s/.test(trimmed.slice(0, at))) return false;
  return SCHOOL_DOMAINS.includes(trimmed.slice(at + 1));
}

function emptyCode(): string[] {
  return Array<string>(CODE_LENGTH).fill("");
}

/** The server's "wait N seconds" replies also say how long, as resendIn. */
function waitSeconds(err: unknown): number | null {
  if (!(err instanceof ApiError)) return null;
  const value = (err.body as { resendIn?: unknown } | null)?.resendIn;
  return typeof value === "number" ? value : null;
}

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

type Step = "signin" | "signup" | "code";

export default function Login() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user, loading, setSession } = useAuth();
  const urlError = params.get("error");

  const [step, setStep] = useState<Step>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(
    urlError === "oauth_failed" ? "Google sign-in didn't finish. Try again." : null,
  );
  const [busy, setBusy] = useState(false);

  // "Continue with Google" asks for the school email first.
  const [googleOpen, setGoogleOpen] = useState(urlError === "school_email");
  const [googleEmail, setGoogleEmail] = useState("");
  const [googleError, setGoogleError] = useState<string | null>(
    urlError === "school_email" ? SCHOOL_EMAIL_ERROR : null,
  );

  // The "Check your email" step.
  const [sentTo, setSentTo] = useState("");
  // Proves this browser started the signup. The server needs it with the code.
  const [signupKey, setSignupKey] = useState("");
  const [digits, setDigits] = useState<string[]>(emptyCode);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [resending, setResending] = useState(false);
  const [focusFirst, setFocusFirst] = useState(0);

  // Already signed in? Go straight to the chat.
  useEffect(() => {
    if (!loading && user) navigate("/", { replace: true });
  }, [loading, user, navigate]);

  // Count down to when "Resend code" works again.
  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const signup = step === "signup";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (signup) {
      if (!isSchoolEmail(email)) {
        setEmailError(SCHOOL_EMAIL_ERROR);
        return;
      }
      if (password.length < MIN_PASSWORD) {
        setError(`Password must be at least ${MIN_PASSWORD} characters.`);
        return;
      }
    }

    setBusy(true);
    try {
      if (signup) {
        const result = await api<{ ok: true; email: string; resendIn: number; signupKey: string }>(
          "/auth/register/start",
          { method: "POST", body: JSON.stringify({ name, email, password }) },
        );
        setSentTo(result.email);
        setSignupKey(result.signupKey);
        setDigits(emptyCode());
        setCodeError(null);
        setResendIn(result.resendIn);
        setStep("code");
      } else {
        const result = await api<{ token: string; user: AuthUser }>("/auth/login", {
          method: "POST",
          body: JSON.stringify({ name, password }),
        });
        setSession(result.token, result.user);
        navigate("/", { replace: true });
      }
    } catch (err) {
      const message = errorMessage(err);
      if (message === SCHOOL_EMAIL_ERROR) setEmailError(message);
      else setError(message);
    } finally {
      setBusy(false);
    }
  }

  async function verify(code: string) {
    if (busy) return;
    setBusy(true);
    setCodeError(null);
    try {
      const result = await api<{ token: string; user: AuthUser }>("/auth/register/verify", {
        method: "POST",
        body: JSON.stringify({ email: sentTo, code, signupKey }),
      });
      setSession(result.token, result.user);
      navigate("/", { replace: true });
    } catch (err) {
      setCodeError(errorMessage(err));
      setDigits(emptyCode());
      setFocusFirst((n) => n + 1);
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (resending || resendIn > 0) return;
    setResending(true);
    setCodeError(null);
    try {
      const result = await api<{ ok: true; resendIn: number }>("/auth/register/resend", {
        method: "POST",
        body: JSON.stringify({ email: sentTo, signupKey }),
      });
      setResendIn(result.resendIn);
      setDigits(emptyCode());
      setFocusFirst((n) => n + 1);
      toast.success("We sent a new code.");
    } catch (err) {
      const wait = waitSeconds(err);
      if (wait !== null) setResendIn(wait);
      setCodeError(errorMessage(err));
    } finally {
      setResending(false);
    }
  }

  function openGoogle() {
    if (googleOpen) return;
    setGoogleOpen(true);
    setGoogleError(null);
    // Save some typing if they already entered their school email.
    if (!googleEmail) {
      const known = [email, name].find(isSchoolEmail);
      if (known) setGoogleEmail(known.trim());
    }
  }

  function continueWithGoogle(e: React.FormEvent) {
    e.preventDefault();
    if (!isSchoolEmail(googleEmail)) {
      setGoogleError(SCHOOL_EMAIL_ERROR);
      return;
    }
    window.location.href = `${API_BASE}/auth/google?email=${encodeURIComponent(googleEmail.trim())}`;
  }

  const heading = step === "code" ? "Check your email" : signup ? "Create your account" : "Welcome back";

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
          <p className="mt-5 text-[13px] font-semibold tracking-tight text-accent-text">972 Chat Bot</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{heading}</h1>
          {step === "code" ? (
            <p className="mt-1.5 text-sm text-muted">
              We sent a 6-digit code to <span className="font-medium break-all text-fg">{sentTo}</span>. Check your
              spam folder if you don't see it — it can land there.
            </p>
          ) : (
            <p className="mt-1.5 text-sm text-muted">Your team's robotics mentor — the shop, the robot, FRC.</p>
          )}
        </div>

        <div className="rounded-2xl border border-line bg-surface p-6 shadow-float">
          {step === "code" ? (
            <motion.form
              key="code"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
              onSubmit={(e) => {
                e.preventDefault();
                if (digits.every(Boolean)) void verify(digits.join(""));
              }}
              className="flex flex-col gap-4"
            >
              <CodeBoxes
                digits={digits}
                onChange={(next) => {
                  setDigits(next);
                  if (codeError) setCodeError(null);
                }}
                onComplete={(code) => void verify(code)}
                busy={busy}
                invalid={codeError !== null}
                focusSignal={focusFirst}
              />

              {codeError ? <p className="rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">{codeError}</p> : null}

              <Button type="submit" variant="primary" size="lg" disabled={busy || !digits.every(Boolean)} className="w-full">
                {busy ? (
                  <>
                    <Spinner /> Checking…
                  </>
                ) : (
                  "Create account"
                )}
              </Button>

              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <button
                  type="button"
                  onClick={() => void resend()}
                  disabled={resendIn > 0 || resending}
                  className="font-medium text-accent-text hover:underline disabled:cursor-default disabled:text-faint disabled:no-underline"
                >
                  {resending ? "Sending…" : resendIn > 0 ? `Resend code in ${resendIn}s` : "Resend code"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStep("signup");
                    setCodeError(null);
                    setError(null);
                  }}
                  className="text-muted hover:text-fg hover:underline"
                >
                  Use a different email
                </button>
              </div>
            </motion.form>
          ) : (
            <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
              <Button variant="outline" size="lg" className="w-full" onClick={openGoogle} aria-expanded={googleOpen}>
                <GoogleIcon />
                Continue with Google
              </Button>
              <AnimatePresence initial={false}>
                {googleOpen ? (
                  <motion.form
                    key="google"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    onSubmit={continueWithGoogle}
                    className="-m-1 overflow-hidden p-1"
                  >
                    <div className="pt-3">
                      <Label htmlFor="google-email">Your school email</Label>
                      <div className="flex gap-2">
                        <Input
                          id="google-email"
                          type="email"
                          autoFocus={!googleEmail}
                          autoComplete="email"
                          placeholder="you@lghsstudent.org"
                          value={googleEmail}
                          onChange={(e) => {
                            setGoogleEmail(e.target.value);
                            setGoogleError(null);
                          }}
                          aria-invalid={googleError !== null}
                          className={googleError ? "border-bad!" : undefined}
                        />
                        <Button type="submit" variant="primary" className="h-10">
                          Continue
                        </Button>
                      </div>
                      {googleError ? <p className="mt-1.5 text-sm text-bad">{googleError}</p> : null}
                    </div>
                  </motion.form>
                ) : null}
              </AnimatePresence>

              <div className="my-5 flex items-center gap-3 text-xs text-faint">
                <span className="h-px flex-1 bg-line" />
                or
                <span className="h-px flex-1 bg-line" />
              </div>

              <form onSubmit={submit} className="flex flex-col gap-4">
                <div>
                  <Label htmlFor="name">{signup ? "Name" : "Name or email"}</Label>
                  <Input
                    id="name"
                    autoComplete={signup ? "name" : "username"}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
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
                      <Label htmlFor="email">School email</Label>
                      <Input
                        id="email"
                        type="email"
                        autoComplete="email"
                        placeholder="you@lghsstudent.org"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          setEmailError(null);
                        }}
                        onBlur={() => {
                          if (email.trim() && !isSchoolEmail(email)) setEmailError(SCHOOL_EMAIL_ERROR);
                        }}
                        aria-invalid={emailError !== null}
                        className={emailError ? "border-bad!" : undefined}
                        required
                      />
                      {emailError ? <p className="mt-1.5 text-sm text-bad">{emailError}</p> : null}
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
                  {signup ? <p className="mt-1.5 text-xs text-faint">At least {MIN_PASSWORD} characters.</p> : null}
                </div>

                {error ? <p className="rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p> : null}

                <Button type="submit" variant="primary" size="lg" disabled={busy} className="mt-1 w-full">
                  {busy ? "One moment…" : signup ? "Create account" : "Sign in"}
                </Button>
              </form>
            </motion.div>
          )}
        </div>

        {step !== "code" ? (
          <p className="mt-6 text-center text-sm text-muted">
            {signup ? "Already have an account?" : "New here?"}{" "}
            <button
              type="button"
              onClick={() => {
                setStep(signup ? "signin" : "signup");
                setError(null);
                setEmailError(null);
              }}
              className="font-medium text-accent-text hover:underline"
            >
              {signup ? "Sign in" : "Create an account"}
            </button>
          </p>
        ) : null}
      </motion.div>
    </main>
  );
}

/**
 * Six one-digit boxes for the email code. Typing moves to the next box,
 * Backspace goes back, and pasting the whole code fills every box. Calls
 * onComplete as soon as all six are filled.
 */
function CodeBoxes({
  digits,
  onChange,
  onComplete,
  busy,
  invalid,
  focusSignal,
}: {
  digits: string[];
  onChange: (digits: string[]) => void;
  onComplete: (code: string) => void;
  busy: boolean;
  invalid: boolean;
  focusSignal: number;
}) {
  const boxes = useRef<(HTMLInputElement | null)[]>([]);

  // After a wrong code or a resend, the boxes are cleared — start over at the first.
  useEffect(() => {
    if (focusSignal > 0) boxes.current[0]?.focus();
  }, [focusSignal]);

  function focusBox(index: number) {
    boxes.current[Math.max(0, Math.min(CODE_LENGTH - 1, index))]?.focus();
  }

  /** Put digits into the boxes starting at `start`, then move on. */
  function fill(start: number, text: string) {
    let typed = text.replace(/\D/g, "");
    // Typing into a box that already has a digit: keep only the new one.
    if (typed.length === 2 && digits[start]) typed = typed.replace(digits[start], "");
    const next = [...digits];
    if (!typed) {
      next[start] = "";
      onChange(next);
      return;
    }
    // A whole code (pasted, or filled in by the phone) always starts at box one.
    const from = typed.length >= CODE_LENGTH ? 0 : start;
    let i = from;
    for (const d of typed) {
      if (i >= CODE_LENGTH) break;
      next[i++] = d;
    }
    onChange(next);
    if (next.every(Boolean)) {
      focusBox(CODE_LENGTH - 1);
      onComplete(next.join(""));
    } else {
      focusBox(i);
    }
  }

  function onKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      e.preventDefault();
      const next = [...digits];
      next[index - 1] = "";
      onChange(next);
      focusBox(index - 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      focusBox(index - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      focusBox(index + 1);
    }
  }

  return (
    <div role="group" aria-label="6-digit code" className="flex justify-between gap-2">
      {digits.map((digit, i) => (
        <input
          key={i}
          ref={(el) => {
            boxes.current[i] = el;
          }}
          value={digit}
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          autoFocus={i === 0}
          aria-label={`Digit ${i + 1}`}
          aria-invalid={invalid}
          readOnly={busy}
          onFocus={(e) => e.target.select()}
          onChange={(e) => fill(i, e.target.value)}
          onKeyDown={(e) => onKeyDown(i, e)}
          onPaste={(e) => {
            e.preventDefault();
            if (!busy) fill(i, e.clipboardData.getData("text"));
          }}
          className={cn(
            "h-12 w-full min-w-0 rounded-xl border bg-surface text-center font-mono text-xl font-semibold text-fg",
            "transition-colors focus:border-accent focus:ring-3 focus:ring-accent/15 focus:outline-none",
            invalid ? "border-bad" : "border-line hover:border-line-strong",
          )}
        />
      ))}
    </div>
  );
}
