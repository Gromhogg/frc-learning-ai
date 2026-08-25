// Phone cameras produce 12-megapixel photos. Claude reads images at about
// 1568px on the long edge anyway, so shrinking before upload makes sends
// fast and costs less, with no loss in what the AI can actually see.
const MAX_EDGE = 1568;

export async function resizeImage(file: File): Promise<File> {
  // GIFs may be animated; resizing would flatten them to one frame.
  if (file.type === "image/gif") return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));

    if (scale === 1) {
      bitmap.close();
      return file;
    }

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85),
    );
    if (!blob) return file;

    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    // If anything about the resize fails, just send the original.
    return file;
  }
}
