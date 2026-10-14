import { count, eq } from "drizzle-orm";
import { db } from "../../db/index.ts";
import { settings, userApiKeys } from "../../db/schema.ts";

// Which Claude API key a request runs on.
//
//   1. the person's own key, if they added one (their chats, Slack chats,
//      starter suggestions, and an admin's prompt-assistant chats)
//   2. else the team key an admin set on the Settings page
//   3. else the ANTHROPIC_API_KEY secret from setup
//
// Team jobs that aren't for one person (learning facts, reviews) start at 2.
//
// Saved keys are encrypted with a key made from JWT_SECRET, so a copy of the
// database alone doesn't give them away. Changing JWT_SECRET makes saved keys
// unreadable; people then just add theirs again.

const TEAM_KEY_SETTING = "ai.teamKey";

export const NO_KEY = "There's no AI key set up yet. Ask an admin, or add your own under API key in the menu.";

export interface TeamKeyInfo {
  /** "settings" = an admin set it in the app; "setup" = the server secret; "none" = no key at all. */
  source: "settings" | "setup" | "none";
  hint: string | null;
  setByName: string | null;
  setAt: string | null;
}

interface StoredTeamKey {
  encryptedKey: string;
  hint: string;
  setById: number;
  setByName: string;
  setAt: string;
}

// ─── encryption ────────────────────────────────────────────────────────────

let cryptoKey: Promise<CryptoKey> | null = null;

function encryptionKey(): Promise<CryptoKey> {
  cryptoKey ??= (async () => {
    const base = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(process.env.JWT_SECRET ?? "dev-secret-change-me"),
      "HKDF",
      false,
      ["deriveKey"],
    );
    return crypto.subtle.deriveKey(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: new TextEncoder().encode("972-chat-bot"),
        info: new TextEncoder().encode("api-keys-v1"),
      },
      base,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  })();
  return cryptoKey;
}

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(text), (ch) => ch.charCodeAt(0));
}

/**
 * `owner` ("team" or "user:12") is sealed in with the key, so an encrypted
 * key copied into someone else's row won't open.
 */
async function encryptKey(plain: string, owner: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(owner) },
    await encryptionKey(),
    new TextEncoder().encode(plain),
  );
  return `v1.${toBase64(iv)}.${toBase64(new Uint8Array(sealed))}`;
}

async function decryptKey(stored: string, owner: string): Promise<string | null> {
  try {
    const [version, iv, data] = stored.split(".");
    if (version !== "v1" || !iv || !data) return null;
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(iv), additionalData: new TextEncoder().encode(owner) },
      await encryptionKey(),
      fromBase64(data),
    );
    return new TextDecoder().decode(plain);
  } catch {
    console.error(`Couldn't open the saved API key for ${owner} (was JWT_SECRET changed?).`);
    return null;
  }
}

// ─── checking a key ────────────────────────────────────────────────────────

export function keyHint(plain: string): string {
  return `…${plain.slice(-4)}`;
}

/** Tidy what someone pasted and reject things that clearly aren't an API key. */
export function cleanKey(raw: unknown): { ok: true; key: string } | { ok: false; error: string } {
  const key = typeof raw === "string" ? raw.trim() : "";
  if (!key) return { ok: false, error: "Paste a key first." };
  // Anthropic has more than one key style (sk-ant-api…, sk-ant-usr…), so
  // only the start is checked here; checkKey() asks Anthropic for real.
  if (!/^sk-ant-[0-9A-Za-z_-]{20,400}$/.test(key)) {
    return { ok: false, error: "That doesn't look like a Claude API key. They start with sk-ant-." };
  }
  if (key.startsWith("sk-ant-oat")) {
    return { ok: false, error: "That's a Claude subscription sign-in token, not an API key. Make an API key in the Claude Console." };
  }
  return { ok: true, key };
}

/** Ask Anthropic whether the key works. Listing models costs nothing. */
export async function checkKey(key: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch("https://api.anthropic.com/v1/models?limit=1", {
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
    });
    if (res.ok) return { ok: true };
    if (res.status === 401) return { ok: false, error: "Anthropic didn't accept that key. Check you copied all of it." };
    if (res.status === 403) return { ok: false, error: "That key isn't allowed to use Claude. Check it in the Claude Console." };
    return { ok: false, error: "Couldn't check the key with Anthropic right now. Try again in a minute." };
  } catch {
    return { ok: false, error: "Couldn't reach Anthropic to check the key. Try again in a minute." };
  }
}

// ─── the team key ──────────────────────────────────────────────────────────

// Each server copy remembers the team key for a short time, like the model
// choice (models.ts), so a change reaches every copy within a minute.
const CACHE_MS = 60_000;
let teamCache: { key: string | undefined; until: number } | null = null;

async function readStoredTeamKey(): Promise<StoredTeamKey | null> {
  const [row] = await db.select().from(settings).where(eq(settings.key, TEAM_KEY_SETTING));
  if (!row) return null;
  try {
    return JSON.parse(row.value) as StoredTeamKey;
  } catch {
    return null;
  }
}

/** The key team jobs run on (and everyone without their own key). */
export async function teamApiKey(): Promise<string | undefined> {
  if (teamCache && teamCache.until > Date.now()) return teamCache.key;
  const stored = await readStoredTeamKey();
  const fromSettings = stored ? await decryptKey(stored.encryptedKey, "team") : null;
  const key = fromSettings || process.env.ANTHROPIC_API_KEY || undefined;
  teamCache = { key, until: Date.now() + CACHE_MS };
  return key;
}

/** What admins see about the team key. Never includes the key itself. */
export async function teamKeyInfo(): Promise<TeamKeyInfo> {
  const stored = await readStoredTeamKey();
  if (stored) return { source: "settings", hint: stored.hint, setByName: stored.setByName, setAt: stored.setAt };
  const setup = process.env.ANTHROPIC_API_KEY;
  if (setup) return { source: "setup", hint: keyHint(setup), setByName: null, setAt: null };
  return { source: "none", hint: null, setByName: null, setAt: null };
}

export async function saveTeamKey(key: string, admin: { id: number; name: string }): Promise<void> {
  const value: StoredTeamKey = {
    encryptedKey: await encryptKey(key, "team"),
    hint: keyHint(key),
    setById: admin.id,
    setByName: admin.name,
    setAt: new Date().toISOString(),
  };
  const json = JSON.stringify(value);
  await db
    .insert(settings)
    .values({ key: TEAM_KEY_SETTING, value: json })
    .onConflictDoUpdate({ target: settings.key, set: { value: json } });
  teamCache = null;
}

/** Back to the setup secret (if there is one). */
export async function removeTeamKey(): Promise<void> {
  await db.delete(settings).where(eq(settings.key, TEAM_KEY_SETTING));
  teamCache = null;
}

// ─── each person's own key ─────────────────────────────────────────────────

export async function ownKeyInfo(userId: number): Promise<{ hint: string; addedAt: string | null } | null> {
  const [row] = await db
    .select({ hint: userApiKeys.hint, addedAt: userApiKeys.createdAt })
    .from(userApiKeys)
    .where(eq(userApiKeys.userId, userId));
  return row ?? null;
}

export async function saveOwnKey(userId: number, key: string): Promise<void> {
  const values = {
    encryptedKey: await encryptKey(key, `user:${userId}`),
    hint: keyHint(key),
    createdAt: new Date().toISOString(),
  };
  await db
    .insert(userApiKeys)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: userApiKeys.userId, set: values });
}

export async function removeOwnKey(userId: number): Promise<void> {
  await db.delete(userApiKeys).where(eq(userApiKeys.userId, userId));
}

/** How many people use their own key (shown to admins as a number only). */
export async function countOwnKeys(): Promise<number> {
  const [row] = await db.select({ n: count() }).from(userApiKeys);
  return row?.n ?? 0;
}

/**
 * The key to use for something done for one person. `own` says whether it's
 * their key, so errors can tell them what to fix.
 */
export async function apiKeyFor(userId: number): Promise<{ key: string | undefined; own: boolean }> {
  const [row] = await db
    .select({ encryptedKey: userApiKeys.encryptedKey })
    .from(userApiKeys)
    .where(eq(userApiKeys.userId, userId));
  if (row) {
    const key = await decryptKey(row.encryptedKey, `user:${userId}`);
    if (key) return { key, own: true };
  }
  return { key: await teamApiKey(), own: false };
}
