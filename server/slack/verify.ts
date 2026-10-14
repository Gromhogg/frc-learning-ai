// Checking that a request really came from Slack.
//
// Slack signs every request: "v0=" + HMAC-SHA256(signing secret,
// "v0:<timestamp>:<raw body>") in hex, sent as X-Slack-Signature, with the
// time in X-Slack-Request-Timestamp. We redo the math and compare. Old
// timestamps are refused so a copied request can't be replayed later.

/** How old a signed request may be. */
export const MAX_AGE_SECONDS = 5 * 60;

const encoder = new TextEncoder();

function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(hex)) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** True only when the signature matches and the timestamp is recent. */
export async function verifySlackSignature(input: {
  secret: string;
  timestamp: string | null | undefined;
  signature: string | null | undefined;
  rawBody: string;
  /** For tests; defaults to now. */
  nowSeconds?: number;
}): Promise<boolean> {
  const { secret, timestamp, signature, rawBody } = input;
  if (!secret || !timestamp || !signature) return false;
  if (!/^\d+$/.test(timestamp)) return false;

  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > MAX_AGE_SECONDS) return false;

  if (!signature.startsWith("v0=")) return false;
  const given = hexToBytes(signature.slice(3));
  if (!given || given.length !== 32) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  // crypto.subtle.verify compares in constant time.
  return crypto.subtle.verify("HMAC", key, given, encoder.encode(`v0:${timestamp}:${rawBody}`));
}

/** Make a signature the way Slack does (used by tests and the local fake Slack). */
export async function signSlackRequest(secret: string, timestamp: string, rawBody: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(`v0:${timestamp}:${rawBody}`)));
  return `v0=${[...mac].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}
