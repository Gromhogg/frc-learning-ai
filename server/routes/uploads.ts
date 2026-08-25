import { Hono } from "hono";
import { getAuth } from "../lib/require-auth.ts";
import {
  saveImage,
  isAllowedImageType,
  MAX_IMAGE_BYTES,
  MAX_IMAGES_PER_MESSAGE,
} from "../lib/uploads.ts";

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
    urls.push(saveImage(Buffer.from(await file.arrayBuffer()), file.type));
  }

  return c.json({ urls });
});

export default app;
