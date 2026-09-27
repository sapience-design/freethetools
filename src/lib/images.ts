// Image helpers for tool pages, built on the browser's own decoders and <canvas>. No libraries.

export type Format = "image/jpeg" | "image/png" | "image/webp" | "image/avif";
export const EXT: Record<Format, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" };

/** Decode a file, applying its EXIF rotation so phone photos come out the right way up. */
export async function decode(file: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("This browser can't open that image. HEIC photos need converting first.");
  }
}

/** Can this browser encode the format? (AVIF and WebP support varies.) */
export async function canEncode(type: Format): Promise<boolean> {
  const c = document.createElement("canvas");
  c.width = c.height = 1;
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, type));
  return !!blob && blob.type === type;
}

/** Draw a bitmap at a size and encode it. JPEG gets a white background, since it has no transparency. */
export async function encode(bmp: ImageBitmap, width: number, height: number, type: Format, quality = 0.82): Promise<Blob> {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const ctx = c.getContext("2d")!;
  if (type === "image/jpeg") { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, width, height); }
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, type, quality));
  if (!blob) throw new Error("Couldn't encode the image in this format.");
  return blob;
}

/** Fit (w, h) inside a box without enlarging. */
export function fitWithin(w: number, h: number, maxW: number, maxH: number) {
  const scale = Math.min(1, maxW / w, maxH / h);
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}
