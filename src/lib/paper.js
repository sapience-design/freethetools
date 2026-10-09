// Name a page size from its width and height in PDF points (1/72 inch): A4, Letter and friends,
// in either orientation; anything else in millimetres.
const SIZES = [["A3", 841.89, 1190.55], ["A4", 595.28, 841.89], ["A5", 419.53, 595.28], ["Letter", 612, 792], ["Legal", 612, 1008], ["Tabloid", 792, 1224]];
const mm = (pt) => Math.round((pt / 72) * 25.4);

/**
 * @param {number} w width in points
 * @param {number} h height in points
 * @returns {string} e.g. "A4", "Letter landscape", "210 × 99 mm"
 */
export function paperName(w, h) {
  const [a, b] = w <= h ? [w, h] : [h, w];
  const hit = SIZES.find(([, x, y]) => Math.abs(a - x) < 3 && Math.abs(b - y) < 3);
  if (!hit) return `${mm(w)} × ${mm(h)} mm`;
  return w > h ? `${hit[0]} landscape` : hit[0];
}

/**
 * One name for a whole document: the size every page shares, or "mixed page sizes".
 * @param {{ width: number, height: number }[]} pages
 */
export function paperOf(pages) {
  const names = [...new Set(pages.map((p) => paperName(p.width, p.height)))];
  return names.length === 1 ? names[0] : names.length ? "mixed page sizes" : "";
}
