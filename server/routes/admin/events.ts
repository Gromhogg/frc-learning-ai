import { Hono } from "hono";
import { requireAdmin, type AdminEnv } from "../../lib/require-auth.ts";
import { listEvents } from "../../lib/events.ts";

// The admin activity log, newest first. Read-only.
const app = new Hono<AdminEnv>();
app.use("*", requireAdmin);

app.get("/", async (c) => c.json({ events: await listEvents() }));

export default app;
