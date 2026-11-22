import { count, eq } from "drizzle-orm";
import { db } from "../../db/index.ts";
import { settings, userApiKeys } from "../../db/schema.ts";
import type { PaidProvider } from "./models.ts";

// Paid AI keys. The free model needs none (see free-model.ts).
//
//   - Team keys: one Claude key and one OpenAI key, set by an admin on the
//     Settings page (else the ANTHROPIC_API_KEY / OPENAI_API_KEY secret from
//     setup). A paid model can be picked for an agent once its key is here.
//   - Own keys: anyone can add their own Claude or OpenAI key from the menu
//     and pick the model their chats use. Only their chats use it.
//
// Saved keys are encrypted with a key made from JWT_SECRET, so a copy of the
// database alone doesn't give them away. Changing JWT_SECRET makes saved keys
// unreadable; people then just add theirs again.

/** Where each team key is stored. The Claude one keeps its first name. */
const TEAM_KEY_SETTING: Record<PaidProvider, string> = {
  anthropic: "ai.teamKey",
  openai: "ai.teamKey.openai",
};

/** Sealed in with each team key (see encryptKey). */
const TEAM_KEY_OWNER: Record<PaidProvider, string> = {
  anthropic: "team",
  openai: "team:openai",
};

const SETUP_SECRET: Record<PaidProvider, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
};

const COMPANY: Record<PaidProvider, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
};

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

/** Tidy what someone pasted, reject things that clearly aren't an API key, and say whose key it is. */
export function cleanKey(
  raw: unknown,
): { ok: true; key: string; provider: PaidProvider } | { ok: false; error: string } {
  const key = typeof raw === "string" ? raw.trim() : "";
  if (!key) return { ok: false, error: "Paste a key first." };
  if (key.startsWith("sk-ant-oat")) {
    return { ok: false, error: "That's a Claude subscription sign-in token, not an API key. Make an API key in the Claude Console." };
  }
  // Each company has more than one key style (sk-ant-api…, sk-proj-…), so
  // only the start is checked here; checkKey() asks the company for real.
  if (/^sk-ant-[0-9A-Za-z_-]{20,400}$/.test(key)) return { ok: true, key, provider: "anthropic" };
  if (/^sk-[0-9A-Za-z_-]{20,400}$/.test(key)) return { ok: true, key, provider: "openai" };
  return {
    ok: false,
    error: "That doesn't look like an API key. Claude keys start with sk-ant-, OpenAI keys with sk-.",
  };
}

/** Ask the company whether the key works. Listing models costs nothing. */
export async function checkKey(
  provider: PaidProvider,
  key: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const company = COMPANY[provider];
  try {
    const res =
      provider === "anthropic"
        ? await fetch("https://api.anthropic.com/v1/models?limit=1", {
            headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
          })
        : await fetch("https://api.openai.com/v1/models", { headers: { authorization: `Bearer ${key}` } });
    if (res.ok) return { ok: true };
    if (res.status === 401) return { ok: false, error: `${company} didn't accept that key. Check you copied all of it.` };
    if (res.status === 403) return { ok: false, error: `That key isn't allowed to use ${company}'s models. Check its settings with ${company}.` };
    return { ok: false, error: `Couldn't check the key with ${company} right now. Try again in a minute.` };
  } catch {
    return { ok: false, error: `Couldn't reach ${company} to check the key. Try again in a minute.` };
  }
}

// ─── the team keys ─────────────────────────────────────────────────────────

// Each server copy remembers the team keys for a short time, like the model
// choice (models.ts), so a change reaches every copy within a minute.
const CACHE_MS = 60_000;
const teamCache = new Map<PaidProvider, { key: string | undefined; until: number }>();

async function readStoredTeamKey(provider: PaidProvider): Promise<StoredTeamKey | null> {
  const [row] = await db.select().from(settings).where(eq(settings.key, TEAM_KEY_SETTING[provider]));
  if (!row) return null;
  try {
    return JSON.parse(row.value) as StoredTeamKey;
  } catch {
    return null;
  }
}

/** The team's key for one company, if there is one. */
export async function teamApiKey(provider: PaidProvider): Promise<string | undefined> {
  const cached = teamCache.get(provider);
  if (cached && cached.until > Date.now()) return cached.key;
  const stored = await readStoredTeamKey(provider);
  const fromSettings = stored ? await decryptKey(stored.encryptedKey, TEAM_KEY_OWNER[provider]) : null;
  const key = fromSettings || process.env[SETUP_SECRET[provider]] || undefined;
  teamCache.set(provider, { key, until: Date.now() + CACHE_MS });
  return key;
}

/** What admins see about a team key. Never includes the key itself. */
export async function teamKeyInfo(provider: PaidProvider): Promise<TeamKeyInfo> {
  const stored = await readStoredTeamKey(provider);
  if (stored) return { source: "settings", hint: stored.hint, setByName: stored.setByName, setAt: stored.setAt };
  const setup = process.env[SETUP_SECRET[provider]];
  if (setup) return { source: "setup", hint: keyHint(setup), setByName: null, setAt: null };
  return { source: "none", hint: null, setByName: null, setAt: null };
}

export async function saveTeamKey(
  provider: PaidProvider,
  key: string,
  admin: { id: number; name: string },
): Promise<void> {
  const value: StoredTeamKey = {
    encryptedKey: await encryptKey(key, TEAM_KEY_OWNER[provider]),
    hint: keyHint(key),
    setById: admin.id,
    setByName: admin.name,
    setAt: new Date().toISOString(),
  };
  const json = JSON.stringify(value);
  await db
    .insert(settings)
    .values({ key: TEAM_KEY_SETTING[provider], value: json })
    .onConflictDoUpdate({ target: settings.key, set: { value: json } });
  teamCache.delete(provider);
}

/** Back to the setup secret (if there is one). */
export async function removeTeamKey(provider: PaidProvider): Promise<void> {
  await db.delete(settings).where(eq(settings.key, TEAM_KEY_SETTING[provider]));
  teamCache.delete(provider);
}

// ─── each person's own key ─────────────────────────────────────────────────

export interface OwnKeyInfo {
  hint: string;
  /** The model their chats use. Its company is the key's company. */
  model: string;
  addedAt: string | null;
}

export async function ownKeyInfo(userId: number): Promise<OwnKeyInfo | null> {
  const [row] = await db
    .select({ hint: userApiKeys.hint, model: userApiKeys.model, addedAt: userApiKeys.createdAt })
    .from(userApiKeys)
    .where(eq(userApiKeys.userId, userId));
  return row ?? null;
}

export async function saveOwnKey(userId: number, key: string, model: string): Promise<void> {
  const values = {
    encryptedKey: await encryptKey(key, `user:${userId}`),
    hint: keyHint(key),
    model,
    createdAt: new Date().toISOString(),
  };
  await db
    .insert(userApiKeys)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: userApiKeys.userId, set: values });
}

export async function setOwnModel(userId: number, model: string): Promise<void> {
  await db.update(userApiKeys).set({ model }).where(eq(userApiKeys.userId, userId));
}

export async function removeOwnKey(userId: number): Promise<void> {
  await db.delete(userApiKeys).where(eq(userApiKeys.userId, userId));
}

/** How many people use their own key (shown to admins as a number only). */
export async function countOwnKeys(): Promise<number> {
  const [row] = await db.select({ n: count() }).from(userApiKeys);
  return row?.n ?? 0;
}

/** Someone's own key and the model they picked, or null if they haven't added one. */
export async function ownKey(userId: number): Promise<{ key: string; model: string } | null> {
  const [row] = await db
    .select({ encryptedKey: userApiKeys.encryptedKey, model: userApiKeys.model })
    .from(userApiKeys)
    .where(eq(userApiKeys.userId, userId));
  if (!row) return null;
  const key = await decryptKey(row.encryptedKey, `user:${userId}`);
  return key ? { key, model: row.model } : null;
}
