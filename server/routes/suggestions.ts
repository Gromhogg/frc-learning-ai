import { Hono } from "hono";
import { getAuth } from "../lib/require-auth.ts";
import { getSuggestions } from "../lib/suggestions.ts";

// Starter suggestions for the empty chat screen. Any signed-in user; each
// person only ever gets their own.
const app = new Hono();

// GET / → { suggestions: string[4], personalized }
app.get("/", async (c) => {
  const auth = await getAuth(c);
  if (!auth) return c.json({ error: "Not signed in." }, 401);
  return c.json(await getSuggestions(auth.userId, auth.role));
});

export default app;
