import { createHash, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.ts";
import { settings, users } from "../../db/schema.ts";

// Who runs the admin side.
//
// The owner is the account whose email is in the OWNER_EMAIL secret (kept
// out of the code, since the repo is public). Only the owner can change the
// admin password and make or remove admins. The owner can't lose admin.
//
// The admin password starts as the ADMIN_CODE secret. Once the owner changes
// it in the app, a bcrypt hash of the new one in `settings` is used instead.

const PASSWORD_SETTING = "admin.passwordHash";
export const MIN_ADMIN_PASSWORD = 8;

function ownerEmails(): string[] {
  return (process.env.OWNER_EMAIL ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isOwnerEmail(email: string | null | undefined): boolean {
  return !!email && ownerEmails().includes(email.trim().toLowerCase());
}

export async function isOwner(userId: number): Promise<boolean> {
  const [row] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId));
  return isOwnerEmail(row?.email);
}

/** The person's role right now, from the database (sign-in tokens can be up to 30 days old). */
export async function currentRole(userId: number): Promise<"admin" | "student" | null> {
  const [row] = await db.select({ role: users.role, email: users.email }).from(users).where(eq(users.id, userId));
  if (!row) return null;
  if (isOwnerEmail(row.email)) return "admin";
  return row.role === "admin" ? "admin" : "student";
}

function sameText(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

async function storedHash(): Promise<string | null> {
  const [row] = await db.select().from(settings).where(eq(settings.key, PASSWORD_SETTING));
  return row?.value || null;
}

/** True when an admin password exists at all (in the app or as the ADMIN_CODE secret). */
export async function hasAdminPassword(): Promise<boolean> {
  return !!(await storedHash()) || !!setupPassword();
}

function setupPassword(): string {
  return (process.env.ADMIN_CODE || process.env.TEACHER_CODE || "").trim();
}

export async function checkAdminPassword(typed: string): Promise<boolean> {
  if (!typed) return false;
  const hash = await storedHash();
  if (hash) return bcrypt.compare(typed, hash);
  const setup = setupPassword();
  return !!setup && sameText(typed, setup);
}

export async function setAdminPassword(next: string): Promise<void> {
  const value = await bcrypt.hash(next, 10);
  await db
    .insert(settings)
    .values({ key: PASSWORD_SETTING, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } });
}
