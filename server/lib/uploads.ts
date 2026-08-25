import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import type { ModelMessage } from "ai";
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

/** Read a saved upload back as a data URL, or null if it's gone. */
function readAsDataUrl(urlPath: string): string | null {
  // Only ever read out of the upload directory — never follow "../".
  const filename = path.basename(urlPath);
  const full = path.join(UPLOAD_DIR, filename);
  if (!existsSync(full)) return null;

  const ext = path.extname(filename).slice(1).toLowerCase();
  const mimeType =
    Object.entries(EXTENSION_BY_TYPE).find(([, e]) => e === ext)?.[0] ?? "image/jpeg";
  return `data:${mimeType};base64,${readFileSync(full).toString("base64")}`;
}

/**
 * Swap our local /uploads/... URLs for inline base64 data.
 *
 * This is required, not an optimization: Anthropic's servers fetch image
 * URLs themselves, and they cannot reach a localhost address. Images that
 * no longer exist on disk are dropped rather than breaking the request.
 */
export function inlineLocalImages(messages: ModelMessage[]): ModelMessage[] {
  return messages.map((message) => {
    if (message.role !== "user" || !Array.isArray(message.content)) return message;

    const content = message.content
      .map((part) => {
        if (part.type !== "image") return part;

        const source = part.image;
        const asString =
          typeof source === "string"
            ? source
            : source instanceof URL
              ? source.toString()
              : null;

        if (!asString || !asString.includes("/uploads/")) return part;

        const dataUrl = readAsDataUrl(asString);
        return dataUrl ? { ...part, image: dataUrl } : null;
      })
      .filter((part) => part !== null);

    return { ...message, content } as ModelMessage;
  });
}
