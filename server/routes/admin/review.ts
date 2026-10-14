import { Hono } from "hono";
import { requireAdmin, type AdminEnv } from "../../lib/require-auth.ts";
import { isReviewRunning, lastReview, reviewProgress, runReview } from "../../agents/reviewer.ts";

// The self-improvement reviewer: see when it last ran, or run it now.

const app = new Hono<AdminEnv>();
app.use("*", requireAdmin);

app.get("/", async (c) => {
  return c.json({ running: isReviewRunning(), progress: reviewProgress(), last: await lastReview() });
});

// POST / — run a review now. Takes a minute or two; the browser waits and
// checks GET / for progress meanwhile.
app.post("/", async (c) => {
  const result = await runReview(c.get("adminId"));
  if (!result.ok) return c.json({ error: result.reason }, 409);
  return c.json(result.outcome);
});

export default app;
