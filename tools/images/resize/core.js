// Resize Images: work out the target size from the options. Pixels are redrawn in the browser.

/**
 * @param {number} w original width
 * @param {number} h original height
 * @param {{ mode: "percent", percent: number } | { mode: "width", width: number } | { mode: "height", height: number } | { mode: "box", width: number, height: number, keep?: boolean }} opt
 * @returns {{ width: number, height: number }}
 */
export function targetSize(w, h, opt) {
  const r = (n) => Math.max(1, Math.round(n));
  switch (opt.mode) {
    case "percent": if (!(opt.percent > 0)) throw new Error("Enter a percentage above 0."); return { width: r((w * opt.percent) / 100), height: r((h * opt.percent) / 100) };
    case "width": if (!(opt.width > 0)) throw new Error("Enter a width."); return { width: r(opt.width), height: r((h * opt.width) / w) };
    case "height": if (!(opt.height > 0)) throw new Error("Enter a height."); return { width: r((w * opt.height) / h), height: r(opt.height) };
    case "box": {
      if (!(opt.width > 0 && opt.height > 0)) throw new Error("Enter a width and a height.");
      if (opt.keep === false) return { width: r(opt.width), height: r(opt.height) };
      const s = Math.min(opt.width / w, opt.height / h);
      return { width: r(w * s), height: r(h * s) };
    }
    default: throw new Error("Choose how to resize.");
  }
}

/** Refuse sizes browsers can't draw (canvas limits are around 16,384 px a side). */
export function checkSize({ width, height }) {
  if (width > 16384 || height > 16384 || width * height > 268e6) throw new Error("That's larger than browsers can draw. Try a smaller size.");
  return { width, height };
}
