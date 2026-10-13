import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import type { ImageContent } from "@mariozechner/pi-ai";
import { UPLOAD_DIR } from "./config.ts";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_IMAGES_PER_MESSAGE = 4;

const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export function isAllowedImageType(mimeType: string): boolean {
  return mimeType in EXTENSION_BY_TYPE;
}

/** Save one uploaded image and return the URL path to reference it by. */
export function saveImage(bytes: Buffer, mimeType: string): string {
  mkdirSync(UPLOAD_DIR, { recursive: true });
  const filename = `${randomUUID()}.${EXTENSION_BY_TYPE[mimeType]}`;
  writeFileSync(path.join(UPLOAD_DIR, filename), bytes);
  return `/uploads/${filename}`;
}

/**
 * Read a saved upload back as base64 image data the model can see, or null
 * if the file is gone.
 *
 * Inlining is required, not an optimization: Anthropic's servers can't reach
 * a localhost URL. Only ever reads out of the upload directory — never "../".
 */
export function readImageForModel(urlPath: string): ImageContent | null {
  if (!urlPath.includes("/uploads/")) return null;
  const filename = path.basename(urlPath);
  const full = path.join(UPLOAD_DIR, filename);
  if (!existsSync(full)) return null;

  const ext = path.extname(filename).slice(1).toLowerCase();
  const mimeType =
    Object.entries(EXTENSION_BY_TYPE).find(([, e]) => e === ext)?.[0] ?? "image/jpeg";
  return { type: "image", data: readFileSync(full).toString("base64"), mimeType };
}
