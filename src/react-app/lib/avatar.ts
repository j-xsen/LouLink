// ---------------------------------------------------------------------------
// Avatar upload helpers — client-side validation limits and resize/encode.
// ---------------------------------------------------------------------------

export const ALLOWED_IMAGE_TYPES_CLIENT = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
export const MAX_AVATAR_BYTES_CLIENT = 5 * 1024 * 1024;

const AVATAR_MAX_PX = 200;

export async function resizeAndEncode(file: File): Promise<{ blob: Blob; mimeType: string; dataUrl: string }> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const scale = Math.min(AVATAR_MAX_PX / side, 1);
  const dim = Math.round(side * scale);
  const canvas = document.createElement("canvas");
  canvas.width = dim;
  canvas.height = dim;
  const ctx = canvas.getContext("2d")!;
  const ox = (bitmap.width - side) / 2;
  const oy = (bitmap.height - side) / 2;
  ctx.drawImage(bitmap, ox, oy, side, side, 0, 0, dim, dim);
  bitmap.close();
  // Try AVIF first, fall back to WebP
  for (const [type, quality] of [["image/avif", 0.75], ["image/webp", 0.75]] as const) {
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, type, quality));
    if (blob && blob.type === type) {
      const dataUrl = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(blob); });
      return { blob, mimeType: type, dataUrl };
    }
  }
  // Last resort: upload the original file unchanged
  const dataUrl = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(file); });
  return { blob: file, mimeType: file.type, dataUrl };
}
