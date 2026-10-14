import { Hono, type Context } from "hono";
import { requireAdmin, type AdminEnv } from "../../lib/require-auth.ts";
import { MAX_TEAM_FACTS } from "../../lib/config.ts";
import {
  approveFact,
  editFact,
  listFacts,
  rejectFact,
  restoreFact,
  type FactChangeResult,
} from "../../lib/facts.ts";

// The admin's review desk for auto-learned facts. Students never see any
// of this — extracted facts wait here as "pending" until an admin approves
// them into the prompt or rejects them onto the blocklist.
//
// Edits and approvals carry `expectedVersion` — the version the admin's page
// loaded. If someone else changed the fact since, the reply is a 409 with
// the fact as it is now, so the page can show both and let the admin choose.

const app = new Hono<AdminEnv>();

// Everything here is admins-only.
app.use("*", requireAdmin);

/** Turn a refused change into the right reply. */
function refused(c: Context<AdminEnv>, result: Exclude<FactChangeResult, { ok: true }>) {
  if (result.reason === "missing") return c.json({ error: "No such fact." }, 404);
  if (result.reason === "at-cap") {
    return c.json({ error: `Approved facts are at the cap of ${MAX_TEAM_FACTS} — remove one first.` }, 409);
  }
  return c.json({ error: "Someone else changed this fact.", current: result.current }, 409);
}

// GET / — the review queue, the approved list, and recently removed facts
app.get("/", async (c) => {
  const { pending, approved, removed } = await listFacts();
  return c.json({ pending, approved, removed, approvedCap: MAX_TEAM_FACTS });
});

// POST /:id/approve — put a fact into the prompt, optionally with the
// admin's corrected wording in one step: { expectedVersion, text? }
app.post("/:id/approve", async (c) => {
  const id = Number(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid id" }, 400);

  const { text, expectedVersion } = await c.req
    .json<{ text?: string; expectedVersion?: number }>()
    .catch(() => ({ text: undefined, expectedVersion: undefined }));
  if (!Number.isInteger(expectedVersion)) {
    return c.json({ error: "Missing expectedVersion — reload the page and try again." }, 400);
  }
  if (text !== undefined && (typeof text !== "string" || !text.trim())) {
    return c.json({ error: "Fact text can't be empty." }, 400);
  }

  const result = await approveFact(id, c.get("adminId"), expectedVersion!, text);
  if (!result.ok) return refused(c, result);
  return c.json({ ok: true });
});

// POST /:id/reject — a fact that's wrong or not worth keeping. It goes on
// the blocklist so the same fact is never proposed again.
app.post("/:id/reject", async (c) => {
  const id = Number(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid id" }, 400);
  if (!(await rejectFact(id, c.get("adminId")))) return c.json({ error: "No such fact." }, 404);
  return c.json({ ok: true });
});

// POST /:id/restore — take a removed fact off the blocklist and put it back
// in the review queue.
app.post("/:id/restore", async (c) => {
  const id = Number(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid id" }, 400);
  const result = await restoreFact(id, c.get("adminId"));
  if (!result.ok) {
    if (result.reason === "conflict") {
      return c.json({ error: "This fact isn't in the removed list any more.", current: result.current }, 409);
    }
    return refused(c, result);
  }
  return c.json({ ok: true });
});

// PATCH /:id — fix a fact's wording (pending or approved): { text, expectedVersion }
app.patch("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid id" }, 400);

  const { text, expectedVersion } = await c.req
    .json<{ text?: string; expectedVersion?: number }>()
    .catch(() => ({ text: undefined, expectedVersion: undefined }));
  if (typeof text !== "string" || !text.trim()) {
    return c.json({ error: "Fact text can't be empty." }, 400);
  }
  if (!Number.isInteger(expectedVersion)) {
    return c.json({ error: "Missing expectedVersion — reload the page and try again." }, 400);
  }

  const result = await editFact(id, text, expectedVersion!, c.get("adminId"));
  if (!result.ok) return refused(c, result);
  return c.json({ ok: true });
});

// DELETE /:id — remove an approved fact from the prompt. Same blocklist flip
// as reject: a removed fact won't be suggested again (unless an admin restores it).
app.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid id" }, 400);
  if (!(await rejectFact(id, c.get("adminId")))) return c.json({ error: "No such fact." }, 404);
  return c.json({ ok: true });
});

export default app;
