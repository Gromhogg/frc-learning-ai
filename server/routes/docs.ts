import { Hono } from "hono";
import { getTeacher } from "../lib/require-auth.ts";
import { MAX_DOC_BYTES } from "../lib/config.ts";
import {
  isTextContent,
  listDocs,
  readDoc,
  sanitizeDocName,
  statDoc,
  trashDoc,
  writeDoc,
} from "../lib/docs.ts";

const app = new Hono();

// Everything here is teachers-only, same as the prompt routes — the docs are
// part of the AI's instructions.
app.use("*", async (c, next) => {
  const teacher = await getTeacher(c);
  if (!teacher) return c.json({ error: "Teachers only." }, 403);
  await next();
});

// GET / — every doc in the library
app.get("/", (c) => c.json({ docs: listDocs() }));

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

  const result = writeDoc(name, bytes, mode ?? "create");
  if (result.status === "conflict") {
    return c.json({ error: `A doc named "${name}" already exists.`, existing: result.existing }, 409);
  }

  return c.json({ ok: true, doc: result.doc });
});

// DELETE /:name — moves the file into the trash folder, never destroys it
app.delete("/:name", (c) => {
  const name = sanitizeDocName(c.req.param("name"));
  if (!name) return c.json({ error: "Invalid doc name." }, 400);
  if (!trashDoc(name)) return c.json({ error: `No doc named "${name}".` }, 404);
  return c.json({ ok: true });
});

export default app;
