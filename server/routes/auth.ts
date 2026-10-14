import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { Hono, type Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { Google, generateState, generateCodeVerifier } from "arctic";
import bcrypt from "bcryptjs";
import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "../../db/index.ts";
import { emailCodes, users } from "../../db/schema.ts";
import { signToken } from "../lib/jwt.ts";
import { getAuth } from "../lib/require-auth.ts";
import { logEvent } from "../lib/events.ts";
import { sendCodeEmail } from "../lib/email.ts";
import { emailDomain, isSchoolEmail, SCHOOL_EMAIL_ERROR } from "../lib/school-email.ts";
import { FRONTEND_URL, SERVER_PORT } from "../lib/config.ts";

const app = new Hono();

// ── Limits ───────────────────────────────────────────────────────────────────

const MIN_PASSWORD = 6;
const MAX_NAME = 80;
const CODE_TTL_MS = 10 * 60_000; // a signup code works for 10 minutes
const RESEND_WAIT_SECONDS = 60; // one email per minute
const MAX_SENDS_PER_HOUR = 5; // per email address
const MAX_CODE_TRIES = 5; // wrong guesses allowed per code
const MAX_ADMIN_TRIES = 5; // wrong admin passwords per person...
const ADMIN_TRIES_WINDOW_MS = 15 * 60_000; // ...per 15 minutes

const ALREADY_EXISTS = "An account with that email already exists. Sign in instead.";
const TOO_MANY_CODES = "Too many wrong codes. Ask for a new one.";
const NO_SIGNUP = "No signup is waiting for that email. Go back and start again.";
const START_AGAIN = "This code doesn't work any more. Go back and start again.";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Everything except secrets — never send the password hash to the client. */
const safeColumns = {
  id: users.id,
  name: users.name,
  email: users.email,
  avatarUrl: users.avatarUrl,
  role: users.role,
  createdAt: users.createdAt,
};

type UserRow = typeof users.$inferSelect;

function safeUser(user: UserRow) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl,
    role: user.role,
    createdAt: user.createdAt,
  };
}

/** The request body as an object. A broken body counts as empty. */
async function readBody(c: Context): Promise<Record<string, unknown>> {
  try {
    const body = await c.req.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function normalizeEmail(value: unknown): string {
  return str(value).trim().toLowerCase();
}

function sha256(text: string): Buffer {
  return createHash("sha256").update(text).digest();
}

/** Compare two secrets without leaking how much of them matched. */
function sameSecret(a: string, b: string): boolean {
  return timingSafeEqual(sha256(a), sha256(b));
}

// A waiting signup stores "<key hash>.<code hash>" in code_hash. The key is a
// random secret only the browser that started the signup has. Without it,
// someone who knows a student's email can't swap in their own password and
// wait for the student to type the code.
function hashKey(key: string): string {
  return sha256(`key:${key}`).toString("hex");
}

function hashCode(email: string, code: string): string {
  return sha256(`${email}:${code}`).toString("hex");
}

function storedHashes(pending: { codeHash: string }): { keyHash: string; codeHash: string } {
  const [keyHash = "", codeHash = ""] = pending.codeHash.split(".");
  return { keyHash, codeHash };
}

function keyMatches(pending: { codeHash: string }, key: string): boolean {
  const { keyHash } = storedHashes(pending);
  return key.length > 0 && keyHash.length > 0 && sameSecret(hashKey(key), keyHash);
}

/** Timestamps we write are ISO; SQLite's own defaults are "YYYY-MM-DD HH:MM:SS" in UTC. */
function parseTime(value: string | null | undefined): number {
  if (!value) return 0;
  const iso = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

async function findUserByEmail(email: string): Promise<UserRow | undefined> {
  const [user] = await db.select().from(users).where(sql`lower(${users.email}) = ${email}`);
  return user;
}

function isUniqueError(err: unknown): boolean {
  return err instanceof Error && /UNIQUE/i.test(err.message);
}

function getGoogle() {
  return new Google(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    `http://localhost:${SERVER_PORT}/auth/google/callback`,
  );
}

// ── Google sign-in ───────────────────────────────────────────────────────────

// The login page asks for the school email first and passes it here. Telling
// Google which account we want (and showing the account picker) stops the
// browser from quietly signing in with someone's personal Gmail.
app.get("/google", (c) => {
  const email = normalizeEmail(c.req.query("email"));
  if (!isSchoolEmail(email)) {
    return c.redirect(`${FRONTEND_URL}/login?error=school_email`);
  }

  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const url = getGoogle().createAuthorizationURL(state, codeVerifier, ["openid", "email", "profile"]);
  url.searchParams.set("prompt", "select_account");
  url.searchParams.set("login_hint", email);
  url.searchParams.set("hd", emailDomain(email));

  setCookie(c, "google_oauth_state", state, { httpOnly: true, path: "/", maxAge: 600, sameSite: "Lax" });
  setCookie(c, "google_code_verifier", codeVerifier, { httpOnly: true, path: "/", maxAge: 600, sameSite: "Lax" });

  return c.redirect(url.toString());
});

app.get("/google/callback", async (c) => {
  const { code, state } = c.req.query();
  const storedState = getCookie(c, "google_oauth_state");
  const codeVerifier = getCookie(c, "google_code_verifier");

  if (!code || !state || state !== storedState || !codeVerifier) {
    return c.redirect(`${FRONTEND_URL}/login?error=oauth_failed`);
  }

  try {
    const tokens = await getGoogle().validateAuthorizationCode(code, codeVerifier);
    const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${tokens.accessToken()}` },
    });
    if (!res.ok) throw new Error(`userinfo failed (${res.status})`);
    const info = (await res.json()) as {
      sub: string;
      name?: string;
      email?: string;
      email_verified?: boolean;
      picture?: string;
    };

    // The hd= hint above only steers the picker; the real check is here.
    const email = normalizeEmail(info.email);
    if (info.email_verified !== true || !isSchoolEmail(email)) {
      return c.redirect(`${FRONTEND_URL}/login?error=school_email`);
    }

    const googleId = info.sub;
    const name = (info.name ?? "").trim() || email.split("@")[0];
    const avatarUrl = info.picture ?? null;

    let user = await findUserByEmail(email);
    if (user) {
      [user] = await db
        .update(users)
        .set({
          name,
          avatarUrl,
          googleId,
          emailVerifiedAt: user.emailVerifiedAt ?? sql`CURRENT_TIMESTAMP`,
        })
        .where(eq(users.id, user.id))
        .returning();
    } else {
      // New Google users start as students. Google already proved they own
      // the email, so no email code is needed. To become an admin they enter
      // the admin password from inside the app.
      [user] = await db
        .insert(users)
        .values({ name, email, googleId, avatarUrl, role: "student", emailVerifiedAt: sql`CURRENT_TIMESTAMP` })
        .returning();
    }

    const token = await signToken({ userId: user.id, role: user.role });
    return c.redirect(`${FRONTEND_URL}/auth/callback?token=${token}`);
  } catch (err) {
    console.error("OAuth callback error:", err);
    return c.redirect(`${FRONTEND_URL}/login?error=oauth_failed`);
  }
});

// ── Who am I ─────────────────────────────────────────────────────────────────

app.get("/me", async (c) => {
  const auth = await getAuth(c);
  if (!auth) return c.json(null, 401);

  const [user] = await db.select(safeColumns).from(users).where(eq(users.id, auth.userId));
  if (!user) return c.json(null, 401);
  return c.json(user);
});

// ── Name or email + password ─────────────────────────────────────────────────

// Works for every account that has a password, whatever its email is —
// the school email rule only applies to new accounts and Google sign-in.
app.post("/login", async (c) => {
  const body = await readBody(c);
  const identifier = str(body.name).trim().toLowerCase();
  const password = str(body.password);

  if (!identifier || !password) {
    return c.json({ error: "Name and password are required." }, 400);
  }

  const matches = await db
    .select()
    .from(users)
    .where(sql`lower(${users.name}) = ${identifier} OR lower(${users.email}) = ${identifier}`);

  // An email match is exact. Names aren't unique, so two people can share one.
  const byEmail = matches.find((u) => u.email?.toLowerCase() === identifier);
  if (!byEmail && matches.length > 1) {
    return c.json({ error: "More than one account has that name. Sign in with your email instead." }, 400);
  }
  const user = byEmail ?? matches[0];

  if (!user) {
    return c.json({ error: "No account found. Check your details or sign up." }, 401);
  }

  // Accounts made with Google have no password. Never let the first password
  // someone types become the password — that would let anyone take the account.
  if (!user.passwordHash) {
    return c.json({ error: "This account uses Google sign-in. Use Continue with Google." }, 400);
  }
  if (!(await bcrypt.compare(password, user.passwordHash))) {
    return c.json({ error: "Incorrect password." }, 401);
  }

  const token = await signToken({ userId: user.id, role: user.role });
  return c.json({ token, user: safeUser(user) });
});

// ── Signing up (with a 6-digit email code) ───────────────────────────────────
//
// 1. /register/start saves the signup (password already hashed), emails a
//    code, and gives the browser a signupKey. No account exists yet.
// 2. /register/verify checks the key and the code, then creates the account.
// /register/resend sends a new code for a signup that's waiting (key needed).

type PendingSignup = typeof emailCodes.$inferSelect;

/**
 * Check the resend limits for a waiting signup. Returns an error reply to
 * send, or null when another email is allowed. Also says whether the hourly
 * count starts over.
 */
function checkSendLimits(
  c: Context,
  pending: PendingSignup | undefined,
): { blocked: Response } | { blocked: null; newHour: boolean } {
  if (!pending) return { blocked: null, newHour: true };
  const now = Date.now();

  const waited = (now - parseTime(pending.lastSentAt)) / 1000;
  if (waited < RESEND_WAIT_SECONDS) {
    const left = Math.ceil(RESEND_WAIT_SECONDS - waited);
    return {
      blocked: c.json({ error: `Wait ${left} seconds before asking for a new code.`, resendIn: left }, 429),
    };
  }

  // The hour is counted from the first email in it (stored in created_at).
  const hourStart = parseTime(pending.createdAt);
  const newHour = now - hourStart >= 3_600_000;
  if (!newHour && pending.sentCount >= MAX_SENDS_PER_HOUR) {
    const minutes = Math.max(1, Math.ceil((hourStart + 3_600_000 - now) / 60_000));
    return {
      blocked: c.json(
        { error: `Too many codes sent to this email. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.` },
        429,
      ),
    };
  }
  return { blocked: null, newHour };
}

/**
 * Save a new code for this email (replacing any old one) and send it. If the
 * email can't be sent, the waiting signup is removed so no code is left that
 * could work.
 */
async function saveAndSendCode(
  c: Context,
  email: string,
  pending: PendingSignup | undefined,
  newHour: boolean,
  signup: { name: string; passwordHash: string; signupKey: string },
) {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const now = new Date();
  const fields = {
    codeHash: `${hashKey(signup.signupKey)}.${hashCode(email, code)}`,
    name: signup.name,
    passwordHash: signup.passwordHash,
    expiresAt: new Date(now.getTime() + CODE_TTL_MS).toISOString(),
    attempts: 0,
    sentCount: newHour || !pending ? 1 : pending.sentCount + 1,
    lastSentAt: now.toISOString(),
    createdAt: newHour || !pending ? now.toISOString() : (pending.createdAt ?? now.toISOString()),
  };

  await db
    .insert(emailCodes)
    .values({ email, ...fields })
    .onConflictDoUpdate({ target: emailCodes.email, set: fields });

  try {
    await sendCodeEmail(email, code);
  } catch (err) {
    console.error("Sending the signup code failed:", err);
    await db.delete(emailCodes).where(eq(emailCodes.email, email));
    return c.json(
      { error: "We couldn't send the email. Try again in a minute, or ask a mentor to check the email settings." },
      502,
    );
  }

  return c.json({ ok: true, email, resendIn: RESEND_WAIT_SECONDS, signupKey: signup.signupKey });
}

/** Clear out signups that were never finished. */
async function dropOldSignups() {
  const dayAgo = new Date(Date.now() - 24 * 3_600_000).toISOString();
  await db.delete(emailCodes).where(lt(emailCodes.expiresAt, dayAgo));
}

app.post("/register/start", async (c) => {
  const body = await readBody(c);
  const name = str(body.name).trim();
  const email = normalizeEmail(body.email);
  const password = str(body.password);

  if (!name) return c.json({ error: "Please enter your name." }, 400);
  if (name.length > MAX_NAME) return c.json({ error: `Names can be at most ${MAX_NAME} characters.` }, 400);
  if (!isSchoolEmail(email)) return c.json({ error: SCHOOL_EMAIL_ERROR }, 400);
  if (password.length < MIN_PASSWORD) {
    return c.json({ error: `Password must be at least ${MIN_PASSWORD} characters.` }, 400);
  }
  if (await findUserByEmail(email)) return c.json({ error: ALREADY_EXISTS }, 409);

  await dropOldSignups();
  const [pending] = await db.select().from(emailCodes).where(eq(emailCodes.email, email));
  const limits = checkSendLimits(c, pending);
  if (limits.blocked) return limits.blocked;

  // Starting again (say, after "Use a different email") makes a new key, so
  // an older tab or anyone else's copy of this signup stops working.
  const passwordHash = await bcrypt.hash(password, 10);
  const signupKey = randomBytes(18).toString("base64url");
  return saveAndSendCode(c, email, pending, limits.newHour, { name, passwordHash, signupKey });
});

app.post("/register/resend", async (c) => {
  const body = await readBody(c);
  const email = normalizeEmail(body.email);
  const signupKey = str(body.signupKey);

  const [pending] = email ? await db.select().from(emailCodes).where(eq(emailCodes.email, email)) : [];
  if (!pending) return c.json({ error: NO_SIGNUP }, 404);
  if (!keyMatches(pending, signupKey)) return c.json({ error: START_AGAIN }, 400);
  if (await findUserByEmail(email)) {
    await db.delete(emailCodes).where(eq(emailCodes.id, pending.id));
    return c.json({ error: ALREADY_EXISTS }, 409);
  }

  const limits = checkSendLimits(c, pending);
  if (limits.blocked) return limits.blocked;

  return saveAndSendCode(c, email, pending, limits.newHour, {
    name: pending.name,
    passwordHash: pending.passwordHash,
    signupKey,
  });
});

app.post("/register/verify", async (c) => {
  const body = await readBody(c);
  const email = normalizeEmail(body.email);
  const code = str(body.code).replace(/\s/g, "");
  const signupKey = str(body.signupKey);

  if (!/^\d{6}$/.test(code)) {
    return c.json({ error: "Enter the 6-digit code from the email." }, 400);
  }

  const [pending] = email ? await db.select().from(emailCodes).where(eq(emailCodes.email, email)) : [];
  if (!pending) return c.json({ error: NO_SIGNUP }, 404);
  if (!keyMatches(pending, signupKey)) return c.json({ error: START_AGAIN }, 400);
  if (Date.now() > parseTime(pending.expiresAt)) {
    return c.json({ error: "That code has expired. Ask for a new one." }, 400);
  }

  // Use up one try before checking, in a single step, so many guesses sent
  // at the same moment still can't get past the limit.
  const [claimed] = await db
    .update(emailCodes)
    .set({ attempts: sql`${emailCodes.attempts} + 1` })
    .where(and(eq(emailCodes.id, pending.id), lt(emailCodes.attempts, MAX_CODE_TRIES)))
    .returning({ attempts: emailCodes.attempts });
  if (!claimed) return c.json({ error: TOO_MANY_CODES }, 429);

  if (!sameSecret(hashCode(email, code), storedHashes(pending).codeHash)) {
    if (claimed.attempts >= MAX_CODE_TRIES) return c.json({ error: TOO_MANY_CODES }, 429);
    return c.json({ error: "That code isn't right. Check the email and try again." }, 400);
  }

  // The code is right. Make the account, unless someone beat us to this email
  // (say, by signing in with Google in the meantime).
  if (await findUserByEmail(email)) {
    await db.delete(emailCodes).where(eq(emailCodes.id, pending.id));
    return c.json({ error: ALREADY_EXISTS }, 409);
  }
  let user: UserRow;
  try {
    [user] = await db
      .insert(users)
      .values({
        name: pending.name,
        email,
        passwordHash: pending.passwordHash,
        role: "student",
        emailVerifiedAt: sql`CURRENT_TIMESTAMP`,
      })
      .returning();
  } catch (err) {
    await db.delete(emailCodes).where(eq(emailCodes.id, pending.id));
    if (isUniqueError(err)) return c.json({ error: ALREADY_EXISTS }, 409);
    throw err;
  }
  await db.delete(emailCodes).where(eq(emailCodes.id, pending.id));

  const token = await signToken({ userId: user.id, role: user.role });
  return c.json({ token, user: safeUser(user) }, 201);
});

// ── Becoming an admin ────────────────────────────────────────────────────────

// Entering the admin password is the ONLY way to become an admin, and there
// is deliberately no way to remove admin access in the app.

// Wrong tries per person, kept in memory (a restart clears them).
const adminTries = new Map<number, { count: number; since: number }>();

/** ADMIN_CODE in .env. TEACHER_CODE is the old name — still read so old .env files work. */
function adminPassword(): string {
  return (process.env.ADMIN_CODE || process.env.TEACHER_CODE || "").trim();
}

app.post("/admin-code", async (c) => {
  const auth = await getAuth(c);
  if (!auth) return c.json({ error: "Not signed in." }, 401);

  const [current] = await db.select().from(users).where(eq(users.id, auth.userId));
  if (!current) return c.json({ error: "Not signed in." }, 401);

  // Already an admin: nothing to check, just hand back a fresh token.
  if (current.role === "admin") {
    const token = await signToken({ userId: current.id, role: "admin" });
    return c.json({ token, user: safeUser(current) });
  }

  const now = Date.now();
  let tries = adminTries.get(current.id);
  if (tries && now - tries.since > ADMIN_TRIES_WINDOW_MS) {
    adminTries.delete(current.id);
    tries = undefined;
  }
  if (tries && tries.count >= MAX_ADMIN_TRIES) {
    return c.json({ error: "Too many tries. Wait 15 minutes and try again." }, 429);
  }

  const expected = adminPassword();
  if (!expected) {
    return c.json({ error: "The admin password isn't set up yet. Add ADMIN_CODE to the server's .env file." }, 400);
  }

  const typed = str((await readBody(c)).code).trim();
  if (!typed || !sameSecret(typed, expected)) {
    if (tries) tries.count += 1;
    else adminTries.set(current.id, { count: 1, since: now });
    return c.json({ error: "That password isn't right." }, 400);
  }

  adminTries.delete(current.id);
  const [user] = await db
    .update(users)
    .set({ role: "admin", adminSince: sql`coalesce(${users.adminSince}, CURRENT_TIMESTAMP)` })
    .where(eq(users.id, current.id))
    .returning();
  await logEvent({
    actorId: user.id,
    action: "admin.grant",
    target: user.name,
    summary: `${user.name} became an admin`,
  });

  const token = await signToken({ userId: user.id, role: "admin" });
  return c.json({ token, user: safeUser(user) });
});

app.post("/logout", (c) => c.json({ ok: true }));

export default app;
