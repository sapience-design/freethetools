// HEIC to JPG: pure helpers. The decoding itself runs in the browser (see Tool.astro and the worker).

export const FORMATS = [
  { type: "image/jpeg", ext: "jpg", label: "JPG", note: "opens everywhere" },
  { type: "image/png", ext: "png", label: "PNG", note: "lossless, larger files" },
];

export const DEFAULT_QUALITY = 90;

/** "IMG_0001.HEIC" -> "IMG_0001.jpg". Only HEIC/HEIF endings are replaced. */
export function outputName(name, ext) {
  return `${name.replace(/\.(heic|heif|hif)$/i, "")}.${ext}`;
}

/** Quality as a number from 1 to 100 (a percentage); anything else becomes the default. */
export function clampQuality(q) {
  const n = Math.round(Number(q));
  if (!Number.isFinite(n)) return DEFAULT_QUALITY;
  return Math.min(100, Math.max(1, n));
}

/** Canvas quality (0 to 1) for an output type; PNG has none. */
export function canvasQuality(type, percent) {
  return type === "image/png" ? undefined : clampQuality(percent) / 100;
}

const BRANDS = new Set(["heic", "heix", "hevc", "hevx", "mif1", "msf1", "heim", "heis", "hevm", "hevs"]);

/** Does this file start with an ISO "ftyp" box whose brand is a HEIC/HEIF one? */
export function isHeicBytes(bytes) {
  if (!bytes || bytes.length < 12) return false;
  const tag = String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]);
  if (tag !== "ftyp") return false;
  const size = Math.min(((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0, bytes.length);
  const brand = (at) => String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);
  if (BRANDS.has(brand(8))) return true;
  // Compatible brands follow the 4-byte minor version, from byte 16.
  for (let at = 16; at + 4 <= size; at += 4) if (BRANDS.has(brand(at))) return true;
  return false;
}
