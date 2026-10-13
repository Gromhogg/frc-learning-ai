import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { Google, generateState, generateCodeVerifier } from "arctic";
import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { db } from "../../db/index.ts";
import { users } from "../../db/schema.ts";
import { signToken } from "../lib/jwt.ts";
import { getAuth } from "../lib/require-auth.ts";
import { FRONTEND_URL, SERVER_PORT } from "../lib/config.ts";

const app = new Hono();

/** Everything except the password hash — never send that to the client. */
const safeColumns = {
  id: users.id,
  name: users.name,
  email: users.email,
  avatarUrl: users.avatarUrl,
  role: users.role,
  createdAt: users.createdAt,
};

function getGoogle() {
  return new Google(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    `http://localhost:${SERVER_PORT}/auth/google/callback`,
  );
}

/**
 * True only if an admin code is configured AND the supplied one matches.
 * TEACHER_CODE is the pre-redesign name — still read so old .env files work.
 */
function isValidAdminCode(code: string | undefined): boolean {
  const expected = process.env.ADMIN_CODE || process.env.TEACHER_CODE;
  if (!expected) return false;
  return typeof code === "string" && code.trim() === expected;
}

// ── Google sign-in ───────────────────────────────────────────────────────────

app.get("/google", (c) => {
  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const url = getGoogle().createAuthorizationURL(state, codeVerifier, [
    "openid",
    "email",
    "profile",
  ]);
  url.searchParams.set("prompt", "select_account");

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
    const { sub: googleId, name, email, picture } = (await res.json()) as {
      sub: string;
      name: string;
      email: string;
      picture: string;
    };

    let [user] = await db.select().from(users).where(eq(users.email, email));

    if (!user) {
      // New Google users always start as students. To become an admin they
      // enter the admin code from inside the app.
      [user] = await db
        .insert(users)
        .values({ name, email, googleId, avatarUrl: picture, role: "student" })
        .returning();
    } else {
      [user] = await db
        .update(users)
        .set({ name, avatarUrl: picture, googleId })
        .where(eq(users.id, user.id))
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

// ── Name + password ──────────────────────────────────────────────────────────

app.post("/login", async (c) => {
  const { name, password } = await c.req.json<{ name: string; password: string }>();
  const trimmedName = (name ?? "").trim();

  if (!trimmedName || !password) {
    return c.json({ error: "Name and password are required." }, 400);
  }

  const identifier = trimmedName.toLowerCase();
  const [user] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.name}) = ${identifier} OR lower(${users.email}) = ${identifier}`);

  if (!user) {
    return c.json({ error: "No account found. Check your details or sign up." }, 401);
  }

  let firstTime = false;

  if (!user.passwordHash) {
    // Account was created via Google — the first password they type becomes theirs.
    await db
      .update(users)
      .set({ passwordHash: await bcrypt.hash(password, 10) })
      .where(eq(users.id, user.id));
    firstTime = true;
  } else if (!(await bcrypt.compare(password, user.passwordHash))) {
    return c.json({ error: "Incorrect password." }, 401);
  }

  const token = await signToken({ userId: user.id, role: user.role });
  const { passwordHash: _omit, ...safeUser } = user;
  void _omit;
  return c.json({ token, user: safeUser, firstTime });
});

app.post("/register", async (c) => {
  const { name, email, password, adminCode } = await c.req.json<{
    name: string;
    email: string;
    password: string;
    adminCode?: string;
  }>();

  const trimmedName = (name ?? "").trim();
  const trimmedEmail = (email ?? "").trim().toLowerCase();

  if (!trimmedName || !trimmedEmail || !password) {
    return c.json({ error: "Name, email, and password are all required." }, 400);
  }
  if (password.length < 4) {
    return c.json({ error: "Password must be at least 4 characters." }, 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    return c.json({ error: "Please enter a valid email address." }, 400);
  }

  // A wrong admin code is an error, not a quiet downgrade to student —
  // otherwise a mentor with a typo silently gets the wrong account.
  const wantsAdmin = typeof adminCode === "string" && adminCode.trim().length > 0;
  if (wantsAdmin && !isValidAdminCode(adminCode)) {
    return c.json({ error: "That admin code isn't right." }, 400);
  }

  const [existing] = await db.select().from(users).where(eq(users.email, trimmedEmail));
  if (existing) {
    return c.json({ error: "An account with that email already exists." }, 409);
  }

  let user;
  try {
    [user] = await db
      .insert(users)
      .values({
        name: trimmedName,
        email: trimmedEmail,
        passwordHash: await bcrypt.hash(password, 10),
        role: wantsAdmin ? "admin" : "student",
      })
      .returning();
  } catch {
    return c.json({ error: "Could not create the account. The email may already be in use." }, 409);
  }

  const token = await signToken({ userId: user.id, role: user.role });
  const { passwordHash: _omit, ...safeUser } = user;
  void _omit;
  return c.json({ token, user: safeUser, firstTime: false }, 201);
});

// ── Becoming an admin ────────────────────────────────────────────────────────

// The admin code is the ONLY way to become an admin. This endpoint covers
// people who signed in with Google (no signup form to type a code into).
app.post("/admin-code", async (c) => {
  const auth = await getAuth(c);
  if (!auth) return c.json({ error: "Not signed in." }, 401);

  const { code } = await c.req.json<{ code: string }>();
  if (!isValidAdminCode(code)) {
    return c.json({ error: "That admin code isn't right." }, 400);
  }

  await db.update(users).set({ role: "admin" }).where(eq(users.id, auth.userId));

  const [user] = await db.select(safeColumns).from(users).where(eq(users.id, auth.userId));
  const token = await signToken({ userId: auth.userId, role: "admin" });
  return c.json({ token, user });
});

app.post("/logout", (c) => c.json({ ok: true }));

export default app;
