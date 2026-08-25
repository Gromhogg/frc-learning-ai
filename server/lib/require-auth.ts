import type { Context } from "hono";
import { verifyToken, type TokenPayload } from "./jwt.ts";

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
 * Same, but for teacher-only endpoints.
 *
 * This check has to live on the server. Hiding the button in the UI stops
 * an honest student, not someone poking at the API with curl.
 */
export async function getTeacher(c: Context): Promise<TokenPayload | null> {
  const auth = await getAuth(c);
  if (!auth || auth.role !== "teacher") return null;
  return auth;
}
