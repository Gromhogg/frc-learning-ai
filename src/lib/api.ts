// One place that knows where the server is, and how to talk to it.
export const API_BASE = "http://localhost:3001";

/**
 * A failed request, with the server's reply still attached.
 *
 * Most callers only want `.message`, but some responses carry a payload worth
 * acting on — a 409 from the prompt editor includes whoever's version won, so
 * the page can show both texts instead of just an error string.
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

/** fetch() that attaches the saved login token and parses JSON. */
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem("auth_token");

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
