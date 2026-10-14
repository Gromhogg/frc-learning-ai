import { Hono } from "hono";
import { requireAdmin, type AdminEnv } from "../../lib/require-auth.ts";
import { MAX_DOC_BYTES } from "../../lib/config.ts";
import { logEvent } from "../../lib/events.ts";
import {
  isTextContent,
  listDocs,
  listTrash,
  readDoc,
  restoreFromTrash,
  sanitizeDocName,
  statDoc,
  trashDoc,
  writeDoc,
} from "../../lib/docs.ts";

const app = new Hono<AdminEnv>();

// Everything here is admins-only.
app.use("*", requireAdmin);

// GET / — every doc in the library
app.get("/", (c) => c.json({ docs: listDocs() }));

// The trash routes come before "/:name" so "trash" is never read as a doc name.

// GET /trash — deleted and replaced docs, newest first
app.get("/trash", (c) => c.json({ trash: listTrash() }));

// POST /trash/:trashName/restore — move a doc back into the library. If its
// old name is taken now, it comes back as "name-2.md" instead of replacing anything.
app.post("/trash/:trashName/restore", async (c) => {
  const restored = restoreFromTrash(c.req.param("trashName"));
  if (!restored) return c.json({ error: "That file isn't in the trash any more." }, 404);

  const { doc, originalName } = restored;
  const renamed = doc.name !== originalName;
  await logEvent({
    actorId: c.get("adminId"),
    action: "doc.restore",
    target: doc.name,
    summary: renamed
      ? `Restored ${originalName} from the trash as ${doc.name} (the old name was taken)`
      : `Restored ${doc.name} from the trash`,
  });
  return c.json({ ok: true, doc, renamed });
});

// GET /:name — one doc with its full text, for previewing
app.get("/:name", (c) => {
  const name = sanitizeDocName(c.req.param("name"));
  if (!name) return c.json({ error: "Invalid doc name." }, 400);

  const doc = readDoc(name);
  const meta = statDoc(name);
  if (!doc || !meta) return c.json({ error: `No doc named "${name}".` }, 404);

  return c.json({ ...meta, content: doc.content });
});

// POST / — add one doc. One file per request so a name collision has an
// unambiguous answer: 409 with the existing doc's details, and the client
// retries with ?mode=replace or ?mode=keep-both once a person has chosen.
app.post("/", async (c) => {
  const body = await c.req.parseBody();
  const file = body["file"];
  if (!(file instanceof File)) return c.json({ error: "No file received." }, 400);

  const name = sanitizeDocName(file.name);
  if (!name) {
    return c.json({ error: "Docs must be .txt or .md files with a simple filename." }, 400);
  }
  if (file.size > MAX_DOC_BYTES) {
    return c.json({ error: `That file is too large (${Math.round(MAX_DOC_BYTES / 1024)} KB max).` }, 400);
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (!isTextContent(bytes)) {
    return c.json({ error: "That file doesn't look like plain text." }, 400);
  }

  const mode = c.req.query("mode");
  if (mode !== undefined && mode !== "replace" && mode !== "keep-both") {
    return c.json({ error: "mode must be replace or keep-both." }, 400);
  }

  const replacing = mode === "replace" && statDoc(name) !== null;
  const result = writeDoc(name, bytes, mode ?? "create");
  if (result.status === "conflict") {
    return c.json({ error: `A doc named "${name}" already exists.`, existing: result.existing }, 409);
  }

  const saved = result.doc.name;
  await logEvent({
    actorId: c.get("adminId"),
    action: "doc.upload",
    target: saved,
    summary:
      replacing
        ? `Replaced ${saved} (the old copy is in the trash)`
        : saved !== name
          ? `Added ${saved} (kept both — ${name} already existed)`
          : `Added ${saved}`,
  });
  return c.json({ ok: true, doc: result.doc });
});

// DELETE /:name — moves the file into the trash folder, never destroys it
app.delete("/:name", async (c) => {
  const name = sanitizeDocName(c.req.param("name"));
  if (!name) return c.json({ error: "Invalid doc name." }, 400);
  if (!trashDoc(name)) return c.json({ error: `No doc named "${name}".` }, 404);
  await logEvent({
    actorId: c.get("adminId"),
    action: "doc.delete",
    target: name,
    summary: `Deleted ${name} (moved to the trash)`,
  });
  return c.json({ ok: true });
});

export default app;
