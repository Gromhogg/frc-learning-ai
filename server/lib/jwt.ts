import { SignJWT, jwtVerify } from "jose";

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "dev-secret-please-set-JWT_SECRET-in-env"
);

export interface SessionPayload {
  userId: number;
  role: "student" | "admin";
  status: "pending" | "approved" | "rejected";
}

export async function signToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);
}

export async function verifyToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return {
      userId: payload.userId as number,
      role: payload.role as "student" | "admin",
      status: payload.status as "pending" | "approved" | "rejected",
    };
  } catch {
    return null;
  }
}
