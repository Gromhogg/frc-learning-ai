import { Hono } from "hono";
import { getAuth } from "../lib/require-auth.ts";
import { clearInterests, getInterests } from "../lib/interests.ts";

// Things about the signed-in person, for that person only. Interests are
// private: no admin route shows them.
const app = new Hono();

// GET /interests → { topics: [{ topic, strong }], statedFocus }
app.get("/interests", async (c) => {
  const auth = await getAuth(c);
  if (!auth) return c.json({ error: "Not signed in." }, 401);
  return c.json(await getInterests(auth.userId));
});

// DELETE /interests — forget what the AI learned, and the personal suggestions.
app.delete("/interests", async (c) => {
  const auth = await getAuth(c);
  if (!auth) return c.json({ error: "Not signed in." }, 401);
  await clearInterests(auth.userId);
  return c.json({ ok: true });
});

export default app;
