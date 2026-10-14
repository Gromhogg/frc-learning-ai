import { env } from "cloudflare:workers";
import type { ImageContent } from "@mariozechner/pi-ai";

// Photos students attach to messages. Saved in the R2 bucket as
// "uploads/<random id>.<ext>" and served at /uploads/<random id>.<ext>.

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_IMAGES_PER_MESSAGE = 4;

const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

// What a saved photo's name looks like: a random id plus one of the
// extensions above. Anything else (like "../") is never looked up.
const UPLOAD_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|gif)$/;

export function isAllowedImageType(mimeType: string): boolean {
  return mimeType in EXTENSION_BY_TYPE;
}

/** Save one uploaded image and return the URL path to reference it by. */
export async function saveImage(bytes: Uint8Array, mimeType: string): Promise<string> {
  const filename = `${crypto.randomUUID()}.${EXTENSION_BY_TYPE[mimeType]}`;
  await env.FILES.put(`uploads/${filename}`, bytes, { httpMetadata: { contentType: mimeType } });
  return `/uploads/${filename}`;
}

/** One saved photo by its file name, or null if the name is wrong or the photo is gone. */
export async function getUpload(filename: string): Promise<R2ObjectBody | null> {
  if (!UPLOAD_NAME.test(filename)) return null;
  return env.FILES.get(`uploads/${filename}`);
}

/** The content type for a saved photo, from its extension. */
export function imageTypeOf(filename: string): string {
  const ext = filename.slice(filename.lastIndexOf(".") + 1).toLowerCase();
  return Object.entries(EXTENSION_BY_TYPE).find(([, e]) => e === ext)?.[0] ?? "image/jpeg";
}

/**
 * Read a saved upload back as base64 image data the model can see, or null
 * if the file is gone.
 *
 * Inlining is required, not an optimization: Anthropic's servers can't reach
 * a localhost URL. Only ever reads saved photos — never "../".
 */
export async function readImageForModel(urlPath: string): Promise<ImageContent | null> {
  if (!urlPath.startsWith("/uploads/")) return null;
  const filename = urlPath.slice("/uploads/".length);
  const obj = await getUpload(filename);
  if (!obj) return null;

  const data = Buffer.from(await obj.arrayBuffer()).toString("base64");
  return { type: "image", data, mimeType: imageTypeOf(filename) };
}
