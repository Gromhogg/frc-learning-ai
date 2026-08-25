// One place that knows where the server is, and how to talk to it.
export const API_BASE = "http://localhost:3001";

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
    const message = await res
      .json()
      .then((d: { error?: string }) => d.error)
      .catch(() => null);
    throw new Error(message ?? `Request failed (${res.status})`);
  }

  return res.json() as Promise<T>;
}
