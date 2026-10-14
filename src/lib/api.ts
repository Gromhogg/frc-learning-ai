// One place that knows where the server is, and how to talk to it.
// The app and the server share one address (one Cloudflare Worker), so API
// paths are relative. VITE_API_URL can point somewhere else if ever needed.
export const API_BASE = import.meta.env.VITE_API_URL ?? "";

const TOKEN_KEY = "auth_token";

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Private windows can block storage; the session just won't persist.
  }
}

/**
 * A failed request, with the server's reply still attached. Some replies
 * carry something worth acting on — a 409 includes whatever version won, so
 * the page can show both instead of just an error.
 */
export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

/** fetch() that attaches the saved sign-in token and parses JSON. */
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message = (body as { error?: string } | null)?.error;
    throw new ApiError(message ?? `Request failed (${res.status})`, res.status, body);
  }
  return res.json() as Promise<T>;
}

export function errorMessage(err: unknown, fallback = "Something went wrong."): string {
  return err instanceof Error && err.message ? err.message : fallback;
}
