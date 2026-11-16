import type { Context, MiddlewareHandler } from "hono";
import { verifyToken, type TokenPayload } from "./jwt.ts";
import { currentRole } from "./admin-access.ts";

/**
 * Pull the signed-in user out of the Authorization header.
 * Returns null when there is no valid token.
 */
export async function getAuth(c: Context): Promise<TokenPayload | null> {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return verifyToken(header.slice(7));
}

/**
 * Same, but for admin-only endpoints.
 *
 * This check has to live on the server. Hiding the button in the UI stops
 * an honest student, not someone poking at the API with curl.
 */
export async function getAdmin(c: Context): Promise<TokenPayload | null> {
  const auth = await getAuth(c);
  if (!auth) return null;
  // The database decides, not the token: someone made or removed as admin
  // still holds a sign-in token with their old role for up to 30 days.
  if ((await currentRole(auth.userId)) !== "admin") return null;
  return { ...auth, role: "admin" };
}

export type AdminEnv = { Variables: { adminId: number } };

/** Middleware: refuse anyone who isn't an admin, and remember who is. */
export const requireAdmin: MiddlewareHandler<AdminEnv> = async (c, next) => {
  const admin = await getAdmin(c);
  if (!admin) return c.json({ error: "Admins only." }, 403);
  c.set("adminId", admin.userId);
  await next();
};
