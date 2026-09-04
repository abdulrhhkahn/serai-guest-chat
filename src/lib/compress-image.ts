/**
 * Resizes and re-encodes an image entirely in the browser before it
 * ever reaches Supabase Storage. A phone camera photo can easily be
 * 3-5MB; on a hotel's weak wifi that's the single biggest thing
 * standing between a guest and a page that loads instantly. Uses the
 * browser's native Canvas API rather than a new dependency — this is a
 * one-off resize-and-encode, not something that needs a library.
 */
export async function compressImage(file: File, maxDimension = 1200, quality = 0.75): Promise<File> {
  // Skip non-image files or formats a canvas can't safely re-encode
  // (e.g. SVG, which can contain scripts) — upload as-is.
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") return file;

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, width, height);

  const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) return file;

  // Only use the compressed version if it's actually smaller — a
  // already-small or already-optimized image shouldn't get re-encoded
  // into something bigger.
  if (blob.size >= file.size) return file;

  const newName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
  return new File([blob], newName, { type: "image/jpeg" });
}
