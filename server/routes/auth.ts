import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { Google, generateState, generateCodeVerifier } from "arctic";
import { db } from "../../db/index.ts";
import { users } from "../../db/schema.ts";
import { eq } from "drizzle-orm";
import { signToken } from "../lib/jwt.ts";

const ALLOWED_DOMAIN = "lgsstudent.org";
const ADMIN_EMAIL = "swec8946@lgsstudent.org";
const FRONTEND_URL = "http://localhost:5173";

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
  // Hint to use the school domain — only @lgsstudent.org accounts will show
  url.searchParams.set("hd", "lgsstudent.org");

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

    // Only allow @lgsstudent.org addresses
    if (!email.toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`)) {
      return c.redirect(`${FRONTEND_URL}/login?error=wrong_domain`);
    }

    // Find or create user
    let [user] = await db.select().from(users).where(eq(users.email, email));

    if (!user) {
      const isAdmin = email.toLowerCase() === ADMIN_EMAIL;
      [user] = await db
        .insert(users)
        .values({
          name,
          email,
          googleId,
          avatarUrl: picture,
          status: isAdmin ? "approved" : "pending",
          role: isAdmin ? "admin" : "student",
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
      role: user.role as "student" | "admin",
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
  return user ? c.json(user) : c.json(null, 401);
});

// POST /auth/logout — client just discards the token; this is a no-op
app.post("/logout", (c) => c.json({ ok: true }));

export default app;
