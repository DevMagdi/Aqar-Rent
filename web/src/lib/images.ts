// Client-side image compression: max side 1920, JPEG ≤1.5 MB (spec limit).
export const MAX_PHOTO_BYTES = 1_500_000; // 1.5 MB
export const MAX_PHOTOS = 15;
export const MIN_PHOTOS = 3;
const MAX_SIDE = 1920;

export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  let quality = 0.88;
  let blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", quality));
  while (blob && blob.size > MAX_PHOTO_BYTES && quality > 0.45) {
    quality -= 0.12;
    blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", quality));
  }
  if (!blob) return file;
  const base = (file.name || "photo").replace(/\.[^.]+$/, "");
  return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
}
