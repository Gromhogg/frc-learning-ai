import { Hono } from "hono";
import { getTeacher } from "../lib/require-auth.ts";
import { MAX_TEAM_FACTS } from "../lib/config.ts";
import {
  approveFact,
  editFact,
  listFacts,
  rejectFact,
} from "../lib/facts.ts";

// The teacher's review desk for auto-learned facts. Students never see any
// of this — extracted facts wait here as "pending" until a teacher approves
// them into the prompt or rejects them onto the blocklist.

const app = new Hono<{ Variables: { teacherId: number } }>();

// Everything here is teachers-only.
app.use("*", async (c, next) => {
  const teacher = await getTeacher(c);
  if (!teacher) return c.json({ error: "Teachers only." }, 403);
  c.set("teacherId", teacher.userId);
  await next();
});

// GET / — the review queue plus the approved list
app.get("/", async (c) => {
  const { pending, approved } = await listFacts();
  return c.json({ pending, approved, approvedCap: MAX_TEAM_FACTS });
});

// POST /:id/approve — put a fact into the prompt, optionally with the
// teacher's corrected wording in one step: { text?: string }
app.post("/:id/approve", async (c) => {
  const id = Number(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid id" }, 400);

  const { text } = await c.req.json<{ text?: string }>().catch(() => ({ text: undefined }));
  if (text !== undefined && (typeof text !== "string" || !text.trim())) {
    return c.json({ error: "Fact text can't be empty." }, 400);
  }

  const result = await approveFact(id, c.get("teacherId"), text);
  if (!result.ok) {
    if (result.reason === "missing") return c.json({ error: "No such fact." }, 404);
    return c.json(
      { error: `Approved facts are at the cap of ${MAX_TEAM_FACTS} — remove one first.` },
      409,
    );
  }
  return c.json({ ok: true });
});

// POST /:id/reject — a fact that's wrong or not worth keeping. It goes on
// the blocklist so the same fact is never proposed again.
app.post("/:id/reject", async (c) => {
  const id = Number(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid id" }, 400);
  await rejectFact(id, c.get("teacherId"));
  return c.json({ ok: true });
});

// PATCH /:id — fix a fact's wording (pending or approved)
app.patch("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const { text } = await c.req.json<{ text: string }>();
  if (!id) return c.json({ error: "Invalid id" }, 400);
  if (typeof text !== "string" || !text.trim()) {
    return c.json({ error: "Fact text can't be empty." }, 400);
  }
  await editFact(id, text);
  return c.json({ ok: true });
});

// DELETE /:id — remove an approved fact from the prompt. Same blocklist flip
// as reject: a removed fact won't be suggested again.
app.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid id" }, 400);
  await rejectFact(id, c.get("teacherId"));
  return c.json({ ok: true });
});

export default app;
