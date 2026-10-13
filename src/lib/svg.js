// SVG helpers shared by the image tools and File Converter: plain text checks that run in Node and
// in the page. Drawing an SVG happens in src/lib/images.ts, through an <img>, which runs no scripts.

/**
 * Skip what may come before an SVG's root element: an XML declaration, comments and a doctype, in
 * any order. A plain loop, not one regular expression: a pattern with a repeated group can take
 * exponential time on a crafted file.
 */
export function skipPrologue(text) {
  let t = text;
  for (let i = 0; i < 50; i++) {
    const before = t;
    t = t.replace(/^<\?xml[^>]*>/i, "").trimStart();
    if (t.startsWith("<!--")) {
      const end = t.indexOf("-->", 4);
      if (end < 0) return t;
      t = t.slice(end + 3).trimStart();
    }
    t = t.replace(/^<!doctype[^>]*>/i, "").trimStart();
    if (t === before) break;
  }
  return t;
}

/** True when a file's text starts with an SVG root element (after any prologue or byte-order mark). */
export function looksLikeSvg(text) {
  return /^<svg[\s>]/i.test(skipPrologue(text.replace(/^\uFEFF/, "").trimStart().slice(0, 2000)));
}

/**
 * Pixel size to draw an SVG at: its own width and height (or viewBox), scaled up to 512 on the
 * longest side when it is small, because icons are often drawn at 16 or 24 units.
 * @param {string} svg
 * @returns {{ width: number, height: number }}
 */
export function svgRasterSize(svg) {
  const tag = /<svg\b[^>]*>/i.exec(svg)?.[0] ?? "";
  const attr = (n) => {
    const m = new RegExp(`\\s${n}\\s*=\\s*["']\\s*([\\d.]+)\\s*(px)?\\s*["']`, "i").exec(tag);
    return m ? parseFloat(m[1]) : NaN;
  };
  let w = attr("width"), h = attr("height");
  const vb = /viewBox\s*=\s*["']\s*[-\d.]+[ ,]+[-\d.]+[ ,]+([\d.]+)[ ,]+([\d.]+)\s*["']/i.exec(tag);
  if (vb) {
    const vw = parseFloat(vb[1]), vh = parseFloat(vb[2]);
    if (!(w > 0) && !(h > 0)) { w = vw; h = vh; }
    else if (!(w > 0)) w = (h * vw) / vh;
    else if (!(h > 0)) h = (w * vh) / vw;
  }
  if (!(w > 0)) w = 512;
  if (!(h > 0)) h = w;
  const scale = Math.max(w, h) < 256 ? 512 / Math.max(w, h) : Math.min(1, 4096 / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}
