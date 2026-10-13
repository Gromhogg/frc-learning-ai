import { SignJWT, jwtVerify } from "jose";

export type Role = "student" | "admin";

export interface TokenPayload {
  userId: number;
  role: Role;
}

function secret(): Uint8Array {
  return new TextEncoder().encode(process.env.JWT_SECRET ?? "dev-secret-change-me");
}

export async function signToken(payload: TokenPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret());
}

export async function verifyToken(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    // Tokens signed before the redesign still say "teacher" — same person,
    // same rights, new name.
    const role: Role = payload.role === "admin" || payload.role === "teacher" ? "admin" : "student";
    return { userId: payload.userId as number, role };
  } catch {
    return null;
  }
}
