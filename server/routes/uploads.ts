import { Hono } from "hono";
import { getAuth } from "../lib/require-auth.ts";
import {
  getUpload,
  imageTypeOf,
  saveImage,
  isAllowedImageType,
  MAX_IMAGE_BYTES,
  MAX_IMAGES_PER_MESSAGE,
} from "../lib/uploads.ts";

// Mounted twice: at /api/uploads (sending photos, signed in) and at /uploads
// (showing a photo by its name — the random name is what keeps it private).
const app = new Hono();

// POST / — accept up to a few photos, return the URLs to reference them by
app.post("/", async (c) => {
  const auth = await getAuth(c);
  if (!auth) return c.json({ error: "Not signed in." }, 401);

  const body = await c.req.parseBody({ all: true });
  const raw = body["images"];
  const files = (Array.isArray(raw) ? raw : [raw]).filter(
    (f): f is File => f instanceof File,
  );

  if (files.length === 0) return c.json({ error: "No images received." }, 400);
  if (files.length > MAX_IMAGES_PER_MESSAGE) {
    return c.json({ error: `At most ${MAX_IMAGES_PER_MESSAGE} photos per message.` }, 400);
  }

  const urls: string[] = [];
  for (const file of files) {
    if (!isAllowedImageType(file.type)) {
      return c.json({ error: "Only JPEG, PNG, WebP, and GIF images are supported." }, 400);
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return c.json({ error: "That photo is too large (5 MB max)." }, 400);
    }
    urls.push(await saveImage(new Uint8Array(await file.arrayBuffer()), file.type));
  }

  return c.json({ urls });
});

// GET /:file — one saved photo. A photo never changes once saved, so the
// browser may keep it for a long time.
app.get("/:file", async (c) => {
  const file = c.req.param("file");
  const obj = await getUpload(file);
  if (!obj) return c.json({ error: "Photo not found." }, 404);

  return new Response(obj.body, {
    headers: {
      "Content-Type": imageTypeOf(file),
      "Content-Length": String(obj.size),
      "Cache-Control": "public, max-age=31536000, immutable",
      ETag: obj.httpEtag,
      "X-Content-Type-Options": "nosniff",
    },
  });
});

export default app;
