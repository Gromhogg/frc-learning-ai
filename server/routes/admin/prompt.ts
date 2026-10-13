import { Hono } from "hono";
import { requireAdmin, type AdminEnv } from "../../lib/require-auth.ts";
import {
  assembledTextOf,
  buildSystemPrompt,
  currentVersion,
  getVersion,
  listVersions,
  rollbackTo,
  savePromptVersion,
  saveSections,
  sectionsOf,
  type PromptVersion,
} from "../../lib/prompt.ts";
import { validateSections } from "../../lib/prompt-sections.ts";

const app = new Hono<AdminEnv>();

// Everything here is admins-only.
app.use("*", requireAdmin);

/**
 * What the editor needs to show the prompt and to save it back safely.
 * `prompt` is always the assembled text — history, diffs, and the conflict
 * panel read it no matter how the version is stored; `sections` is the
 * structured form the editor actually edits.
 */
function live(v: PromptVersion) {
  return {
    prompt: assembledTextOf(v),
    sections: sectionsOf(v),
    format: v.format,
    version: v.version,
    authorName: v.authorName,
    updatedAt: v.createdAt,
    note: v.note,
  };
}

// GET / — the live prompt. (Learned facts moved to /api/facts.)
app.get("/", async (c) => {
  return c.json(live(await currentVersion()));
});

// PUT / — save edited instructions as a new version. The editor sends
// `sections`; a plain `prompt` string is still accepted so a tab opened
// before a deploy can still save its work.
//
// `baseVersion` is what the editor loaded. If it's stale we refuse and hand
// back what's live, so two admins editing at once can see both texts instead
// of one of them silently losing their work.
app.put("/", async (c) => {
  const { sections, prompt, baseVersion, note } = await c.req.json<{
    sections?: unknown;
    prompt?: string;
    baseVersion: number;
    note?: string;
  }>();

  if (!Number.isInteger(baseVersion)) {
    return c.json({ error: "Missing baseVersion — reload the page and try again." }, 400);
  }

  let result;
  if (sections !== undefined) {
    const checked = validateSections(sections);
    if (!checked.ok) return c.json({ error: checked.error }, 400);
    result = await saveSections({
      sections: checked.sections,
      baseVersion,
      authorId: c.get("adminId"),
      note: note?.trim() || null,
    });
  } else {
    if (typeof prompt !== "string" || !prompt.trim()) {
      return c.json({ error: "The prompt can't be empty." }, 400);
    }
    result = await savePromptVersion({
      text: prompt,
      baseVersion,
      authorId: c.get("adminId"),
      note: note?.trim() || null,
    });
  }

  if (!result.ok) {
    return c.json(
      {
        error: `${result.conflict.authorName} saved a newer version while you were editing.`,
        current: live(result.conflict),
      },
      409,
    );
  }

  return c.json({ ok: true, ...live(result.version) });
});

// GET /preview — the exact system prompt the tutor gets right now: the
// sections plus the doc list and approved team facts.
app.get("/preview", async (c) => {
  return c.json({ text: await buildSystemPrompt() });
});

// GET /history — every version, newest first, without the text bodies
app.get("/history", async (c) => {
  return c.json({ versions: await listVersions() });
});

// GET /history/:version — one full version, for previewing or diffing
app.get("/history/:version", async (c) => {
  const version = Number(c.req.param("version"));
  if (!Number.isInteger(version)) return c.json({ error: "Invalid version" }, 400);

  const found = await getVersion(version);
  if (!found) return c.json({ error: "No such version." }, 404);
  return c.json(live(found));
});

// POST /rollback — re-apply an old version as a new one on top
app.post("/rollback", async (c) => {
  const { version } = await c.req.json<{ version: number }>();
  if (!Number.isInteger(version)) return c.json({ error: "Invalid version" }, 400);

  const result = await rollbackTo(version, c.get("adminId"));

  if ("missing" in result) return c.json({ error: "No such version." }, 404);
  if (!result.ok) {
    return c.json(
      {
        error: `${result.conflict.authorName} saved while you were reverting. Try again.`,
        current: live(result.conflict),
      },
      409,
    );
  }

  return c.json({ ok: true, ...live(result.version) });
});

export default app;
