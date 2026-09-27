// Compress Images: choose the output format and quality for a preset, and decide whether the result
// is worth keeping. The re-encoding itself happens on a canvas in the browser.

export const PRESETS = {
  high: { quality: 0.86, maxSide: 4096, label: "Best quality" },
  balanced: { quality: 0.75, maxSide: 2560, label: "Balanced" },
  small: { quality: 0.6, maxSide: 1600, label: "Smallest" },
};

/**
 * @param {string} inputType the file's MIME type
 * @param {boolean} webpOk can the browser encode WebP?
 * @param {boolean} keepFormat keep the original format where it compresses (JPEG, WebP)
 */
export function outputType(inputType, webpOk, keepFormat = true) {
  if (keepFormat && (inputType === "image/jpeg" || inputType === "image/webp")) return inputType;
  // PNG and others: WebP keeps transparency and is far smaller; JPEG as a fallback.
  return webpOk ? "image/webp" : "image/jpeg";
}

/** Keep the original if the "compressed" file isn't actually smaller. */
export const worthIt = (before, after) => after < before * 0.98;

export function saving(before, after) {
  return Math.round((1 - after / before) * 100);
}
