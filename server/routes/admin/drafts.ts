import { Hono } from "hono";
import { requireAdmin, type AdminEnv } from "../../lib/require-auth.ts";
import { applyDraft, dismissDraft, getDraft, listDrafts, type DraftStatus } from "../../lib/drafts.ts";
import { assembledTextOf, sectionsOf } from "../../lib/prompt.ts";

// Prompt changes the agents have proposed. Applying one saves a normal new
// prompt version; dismissing keeps it on record but out of the inbox.

const app = new Hono<AdminEnv>();
app.use("*", requireAdmin);

// GET /?status=pending — newest first
app.get("/", async (c) => {
  const status = c.req.query("status");
  const valid = status === "pending" || status === "applied" || status === "dismissed";
  return c.json({ drafts: await listDrafts(valid ? (status as DraftStatus) : undefined) });
});

app.get("/:id", async (c) => {
  const draft = await getDraft(Number(c.req.param("id")));
  if (!draft) return c.json({ error: "No such draft." }, 404);
  return c.json(draft);
});

// POST /:id/apply — { onTopOfLatest?: boolean }
app.post("/:id/apply", async (c) => {
  const id = Number(c.req.param("id"));
  const { onTopOfLatest } = await c.req
    .json<{ onTopOfLatest?: boolean }>()
    .catch(() => ({ onTopOfLatest: false }));

  const result = await applyDraft(id, c.get("adminId"), onTopOfLatest === true);
  if (result.ok) return c.json({ ok: true, version: result.version.version });
  if (result.reason === "missing") return c.json({ error: "No such draft." }, 404);
  if (result.reason === "not-pending") return c.json({ error: "This draft was already handled." }, 409);
  return c.json(
    {
      error: `The prompt changed since this was drafted (now v${result.current.version}).`,
      stale: true,
      current: {
        version: result.current.version,
        sections: sectionsOf(result.current),
        prompt: assembledTextOf(result.current),
      },
    },
    409,
  );
});

app.post("/:id/dismiss", async (c) => {
  const ok = await dismissDraft(Number(c.req.param("id")), c.get("adminId"));
  if (!ok) return c.json({ error: "This draft was already handled." }, 409);
  return c.json({ ok: true });
});

export default app;
