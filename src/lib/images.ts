// Image helpers for tool pages, built on the browser's own decoders and <canvas>. No libraries.
import { looksLikeSvg, svgRasterSize } from "./svg.js";

export type Format = "image/jpeg" | "image/png" | "image/webp" | "image/avif";
export const EXT: Record<Format, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" };

/** True for an SVG drawing, by its type, its name, or (for a file with no type) its first bytes. */
export async function isSvg(file: Blob): Promise<boolean> {
  if (file.type === "image/svg+xml" || /\.svg$/i.test((file as File).name ?? "")) return true;
  if (file.type && !/xml|^text\//.test(file.type)) return false;
  return looksLikeSvg(await file.slice(0, 4096).text());
}

/**
 * Decode a file, applying its EXIF rotation so phone photos come out the right way up. An SVG is drawn
 * at `size` when given (so a drawing stays sharp at any size), else at its own size, with small icons
 * scaled up to 512 px.
 */
export async function decode(file: Blob, size?: { width: number; height: number }): Promise<ImageBitmap> {
  if (await isSvg(file)) return drawSvg(file, size);
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("This browser can't open that image. HEIC photos need converting first.");
  }
}

/** The browser draws the SVG through an <img>, which runs no scripts and loads nothing from other sites. */
async function drawSvg(file: Blob, size?: { width: number; height: number }): Promise<ImageBitmap> {
  const text = await file.text();
  const { width, height } = size ?? svgRasterSize(text);
  const url = URL.createObjectURL(new Blob([text], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = width;
    c.height = height;
    c.getContext("2d")!.drawImage(img, 0, 0, width, height);
    return await createImageBitmap(c);
  } catch {
    throw new Error("This SVG couldn't be drawn. Check that the file isn't damaged.");
  } finally {
    URL.revokeObjectURL(url);
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
