// Convert Image Format: PNG, JPG, WebP and AVIF (where the browser can write it).

export const FORMATS = [
  { type: "image/jpeg", ext: "jpg", label: "JPG", note: "photos, smallest for pictures, no transparency" },
  { type: "image/png", ext: "png", label: "PNG", note: "lossless, keeps transparency" },
  { type: "image/webp", ext: "webp", label: "WebP", note: "small, keeps transparency, works in all modern browsers" },
  { type: "image/avif", ext: "avif", label: "AVIF", note: "smallest, newest; not every app opens it yet" },
];

/** New file name with the right extension: "holiday.HEIC.png" -> "holiday.HEIC.jpg" */
export function renameTo(name, ext) {
  return `${name.replace(/\.(jpe?g|png|webp|avif|gif|bmp|tiff?|ico)$/i, "")}.${ext}`;
}

/** Quality for lossy formats; PNG ignores it. */
export const qualityFor = (type) => (type === "image/png" ? undefined : type === "image/avif" ? 0.6 : 0.88);
