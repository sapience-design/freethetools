// View and Edit PDF: marks (text, boxes, highlights, drawings, pictures) placed on a PDF's pages,
// and the code that writes them into the page content so every reader shows them the same way.
// Uses pdf-lib (MIT). No page code here, so it can be tested and reused (see agent.js).
//
// Where a mark sits: every mark is on page `page` (1-based). Its numbers are in points (1/72 inch)
// on the page AS A PERSON SEES IT: turned the way the reader turns it, cut to the crop box, with
// the top-left corner as the origin and y growing downwards. That is also what pdf.js draws, so
// the page and the marks use one coordinate system. `viewMatrix` maps it back to the PDF's own
// coordinates when saving.
import {
  PDFDocument, StandardFonts, rgb, BlendMode, LineCapStyle, LineJoinStyle,
  pushGraphicsState, popGraphicsState, concatTransformationMatrix,
} from "pdf-lib";

/** Line height of text, as a multiple of the font size. */
export const LINE = 1.2;
/** Where the first baseline sits below the top of a text box, as a multiple of the font size. */
export const BASELINE = 0.94;
/** Space between a box's edge and its text, in points. */
export const PAD = 4;
/** How see-through a highlight is. */
export const HIGHLIGHT_OPACITY = 0.5;

const PRODUCER = "Free the Tools (freethetools.com)";

// ---- Pages --------------------------------------------------------------------------------------

/**
 * What a reader shows of a page: the crop box (inside the media box), turned by the page's rotation.
 * @param {import("pdf-lib").PDFPage} page
 * @returns {{ x0: number, y0: number, x1: number, y1: number, rotate: 0|90|180|270, width: number, height: number }}
 */
export function pageGeometry(page) {
  const media = page.getMediaBox();
  const crop = page.getCropBox();
  const x0 = Math.max(crop.x, media.x), y0 = Math.max(crop.y, media.y);
  const x1 = Math.min(crop.x + crop.width, media.x + media.width), y1 = Math.min(crop.y + crop.height, media.y + media.height);
  const box = x1 > x0 && y1 > y0 ? { x0, y0, x1, y1 } : { x0: media.x, y0: media.y, x1: media.x + media.width, y1: media.y + media.height };
  const rotate = (((Math.round(page.getRotation().angle / 90) * 90) % 360) + 360) % 360;
  const w = box.x1 - box.x0, h = box.y1 - box.y0;
  return { ...box, rotate, width: rotate % 180 ? h : w, height: rotate % 180 ? w : h };
}

/**
 * The PDF matrix [a b c d e f] that maps "view-up" coordinates (u to the right, v upwards, origin
 * at the bottom-left of the page as seen) to the PDF's own page coordinates.
 */
export function viewMatrix(g) {
  switch (g.rotate) {
    case 90: return [0, 1, -1, 0, g.x1, g.y0];
    case 180: return [-1, 0, 0, -1, g.x1, g.y1];
    case 270: return [0, -1, 1, 0, g.x0, g.y1];
    default: return [1, 0, 0, 1, g.x0, g.y0];
  }
}

/** A point on the page as seen (x right, y down, in points) to the PDF's own coordinates. */
export function viewToPdf(g, x, y) {
  const [a, b, c, d, e, f] = viewMatrix(g);
  const u = x, v = g.height - y;
  return [a * u + c * v + e, b * u + d * v + f];
}

/** The reverse of viewToPdf: a PDF point to a point on the page as seen. */
export function pdfToView(g, X, Y) {
  const [a, b, c, d, e, f] = viewMatrix(g);
  const det = a * d - b * c; // 1 or -1... a turn, so never 0
  const px = X - e, py = Y - f;
  const u = (d * px - c * py) / det, v = (-b * px + a * py) / det;
  return [u, g.height - v];
}

// ---- Colour and text ----------------------------------------------------------------------------

const HEX = /^#[0-9a-f]{6}$/i;

/** "#ff8800" to pdf-lib's rgb(). */
export function colorOf(hex, fallback = "#000000") {
  const h = HEX.test(hex ?? "") ? hex : fallback;
  return rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
}

// Windows-1252, the letters pdf-lib's built-in fonts can write: Latin with accents, æ ø å, ß, € and
// common punctuation.
const WIN_ANSI_EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
/** Can the built-in font write every character of this text? (New lines count as fine.) */
export function isLatinText(text) {
  for (const ch of String(text)) {
    const c = ch.codePointAt(0);
    if (c === 10 || c === 13 || c === 9) continue;
    if ((c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || WIN_ANSI_EXTRA.includes(ch)) continue;
    return false;
  }
  return true;
}

/** The characters of a text that the built-in font cannot write, once each, in order. */
export function oddCharacters(text) {
  const seen = new Set();
  for (const ch of String(text)) if (!isLatinText(ch)) seen.add(ch);
  return [...seen];
}

/** Text with one kind of new line and no tabs. */
const normal = (t) => String(t ?? "").replace(/\r\n?/g, "\n").replace(/\t/g, "    ");

/**
 * Break text into lines that fit `maxWidth`. New lines in the text stay. A word longer than a line
 * is cut. `measure(string)` returns the width of a string in the same unit as `maxWidth`.
 * @returns {string[]}
 */
export function wrapText(text, maxWidth, measure) {
  const out = [];
  for (const para of normal(text).split("\n")) {
    let line = "";
    for (const word of para.split(/(?<= )/)) { // words keep their trailing space
      const joined = line + word;
      if (!line || measure(joined.trimEnd()) <= maxWidth) line = joined;
      else { out.push(line.trimEnd()); line = word; }
      // A single word wider than the line is cut at the edge.
      while (line.trimEnd().length > 1 && measure(line.trimEnd()) > maxWidth) {
        let n = line.length - 1;
        while (n > 1 && measure(line.slice(0, n)) > maxWidth) n--;
        out.push(line.slice(0, n));
        line = line.slice(n);
      }
    }
    out.push(line.trimEnd());
  }
  return out;
}

/** The lines a mark shows, and where its first baseline sits: shared by the page and the saved PDF. */
export function textLines(m, measure) {
  if (m.type === "rect") return wrapText(m.text ?? "", Math.max(1, m.w - 2 * PAD), measure);
  return normal(m.text).split("\n");
}

/** Top-left of the text of a text or box mark. */
export const textOrigin = (m) => (m.type === "rect" ? [m.x + PAD, m.y + PAD] : [m.x, m.y]);

// ---- Marks --------------------------------------------------------------------------------------

/**
 * A smooth SVG path through freehand points: straight to the first point, then curves that pass
 * through the midpoints. Used on the page and in the saved PDF.
 * @param {[number, number][]} points
 */
export function smoothPath(points) {
  const r = (n) => Math.round(n * 100) / 100;
  if (!points.length) return "";
  const [x0, y0] = points[0];
  if (points.length === 1) return `M ${r(x0)} ${r(y0)} L ${r(x0 + 0.01)} ${r(y0)}`;
  let d = `M ${r(x0)} ${r(y0)}`;
  if (points.length === 2) return `${d} L ${r(points[1][0])} ${r(points[1][1])}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [x, y] = points[i], [nx, ny] = points[i + 1];
    d += ` Q ${r(x)} ${r(y)} ${r((x + nx) / 2)} ${r((y + ny) / 2)}`;
  }
  const last = points[points.length - 1];
  return `${d} L ${r(last[0])} ${r(last[1])}`;
}

/** A box around a mark, in page points: { x, y, w, h }. Text boxes need `measure` for their width. */
export function boundsOf(m, measure = (s) => s.length * (m.size ?? 14) * 0.5) {
  if (m.type === "path") {
    const xs = m.points.map((p) => p[0]), ys = m.points.map((p) => p[1]);
    const half = (m.width ?? 2) / 2;
    const x = Math.min(...xs) - half, y = Math.min(...ys) - half;
    return { x, y, w: Math.max(...xs) + half - x, h: Math.max(...ys) + half - y };
  }
  if (m.type === "text") {
    const lines = textLines(m, measure);
    return { x: m.x, y: m.y, w: Math.max(m.size * 0.5, ...lines.map(measure)), h: lines.length * m.size * LINE };
  }
  return { x: m.x, y: m.y, w: m.w, h: m.h };
}

/** The mark moved by dx, dy points. Returns a new mark. */
export function moveMark(m, dx, dy) {
  if (m.type === "path") return { ...m, points: m.points.map(([x, y]) => [x + dx, y + dy]) };
  return { ...m, x: m.x + dx, y: m.y + dy };
}

/** The mark made larger (factor above 1) or smaller, around its top-left corner. */
export function scaleMark(m, factor) {
  if (m.type === "text") return { ...m, size: clamp(m.size * factor, 4, 200) };
  if (m.type === "path") {
    const x = Math.min(...m.points.map((p) => p[0])), y = Math.min(...m.points.map((p) => p[1]));
    return { ...m, points: m.points.map(([px, py]) => [x + (px - x) * factor, y + (py - y) * factor]) };
  }
  return { ...m, w: Math.max(4, m.w * factor), h: Math.max(4, m.h * factor) };
}

/** The words describeMark uses. A page can pass its own, in another language; {n} is a page number and {t} a clip of text. */
export const MARK_WORDS = {
  page: "page {n}", text: "Text “{t}”", box: "Box", boxText: "Box with text “{t}”", highlight: "Highlight", drawing: "Drawing", picture: "Picture", mark: "Mark",
};

/** A short plain-words description of a mark, for lists and screen readers. */
export function describeMark(m, words = {}) {
  const w = { ...MARK_WORDS, ...words };
  const fill = (s, t = "") => s.replace("{n}", String(m.page)).replace("{t}", () => t);
  const where = fill(w.page);
  const clip = (s) => { const t = String(s ?? "").replace(/\s+/g, " ").trim(); return t.length > 40 ? `${t.slice(0, 39)}…` : t; };
  switch (m.type) {
    case "text": return `${fill(w.text, clip(m.text))}, ${where}`;
    case "rect": return m.text ? `${fill(w.boxText, clip(m.text))}, ${where}` : `${w.box}, ${where}`;
    case "highlight": return `${w.highlight}, ${where}`;
    case "path": return `${w.drawing}, ${where}`;
    case "image": return `${m.label || w.picture}, ${where}`;
    default: return `${w.mark}, ${where}`;
  }
}

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const num = (v, what) => {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`${what} should be a number.`);
  return v;
};

/**
 * Check one mark and return a clean copy. Throws a plain-language error for a mark that cannot be
 * drawn. `index` is the mark's place in the list, for the message.
 */
export function cleanMark(m, index = 0, pageCount = Infinity) {
  const at = `Mark ${index + 1}`;
  if (!m || typeof m !== "object") throw new Error(`${at} is not a mark.`);
  const page = Math.round(num(m.page, `${at}: page`));
  if (page < 1 || page > pageCount) throw new Error(`${at} is on page ${page}, but this PDF has ${pageCount} ${pageCount === 1 ? "page" : "pages"}.`);
  const color = HEX.test(m.color ?? "") ? m.color : "#000000";
  const base = { id: m.id, type: m.type, page };
  switch (m.type) {
    case "text": {
      const text = String(m.text ?? "");
      return { ...base, x: num(m.x, `${at}: x`), y: num(m.y, `${at}: y`), text, size: clamp(num(m.size ?? 16, `${at}: size`), 4, 200), color };
    }
    case "rect": {
      const w = num(m.w, `${at}: width`), h = num(m.h, `${at}: height`);
      if (w <= 0 || h <= 0) throw new Error(`${at}: a box needs a width and a height above zero.`);
      return {
        ...base, x: num(m.x, `${at}: x`), y: num(m.y, `${at}: y`), w, h,
        color, strokeWidth: clamp(num(m.strokeWidth ?? 2, `${at}: border width`), 0, 50),
        fill: m.fill && HEX.test(m.fill) ? m.fill : null, fillOpacity: clamp(num(m.fillOpacity ?? 1, `${at}: fill opacity`), 0, 1),
        text: String(m.text ?? ""), size: clamp(num(m.size ?? 14, `${at}: size`), 4, 200), textColor: HEX.test(m.textColor ?? "") ? m.textColor : "#000000",
      };
    }
    case "highlight": {
      const w = num(m.w, `${at}: width`), h = num(m.h, `${at}: height`);
      if (w <= 0 || h <= 0) throw new Error(`${at}: a highlight needs a width and a height above zero.`);
      return { ...base, x: num(m.x, `${at}: x`), y: num(m.y, `${at}: y`), w, h, color: HEX.test(m.color ?? "") ? m.color : "#ffdf3d" };
    }
    case "path": {
      if (!Array.isArray(m.points) || !m.points.length) throw new Error(`${at}: a drawing needs points.`);
      if (m.points.length > 20000) throw new Error(`${at}: this drawing has too many points.`);
      const points = m.points.map((p, i) => [num(p?.[0], `${at}: point ${i + 1}`), num(p?.[1], `${at}: point ${i + 1}`)]);
      return { ...base, points, color, width: clamp(num(m.width ?? 2.5, `${at}: thickness`), 0.25, 50) };
    }
    case "image": {
      if (!(m.bytes instanceof Uint8Array) || !m.bytes.length) throw new Error(`${at}: a picture needs its file.`);
      if (m.mime !== "image/png" && m.mime !== "image/jpeg") throw new Error(`${at}: pictures must be PNG or JPG.`);
      const w = num(m.w, `${at}: width`);
      const h = m.h === undefined || m.h === null ? null : num(m.h, `${at}: height`);
      if (w <= 0 || (h !== null && h <= 0)) throw new Error(`${at}: a picture needs a width and a height above zero.`);
      return { ...base, x: num(m.x, `${at}: x`), y: num(m.y, `${at}: y`), w, h, bytes: m.bytes, mime: m.mime, label: m.label };
    }
    default:
      throw new Error(`${at} has an unknown type “${m.type}”. Use text, rect, highlight, path or image.`);
  }
}

// ---- Undo and redo ------------------------------------------------------------------------------

/**
 * A history of states. `push(state, key)`: a push with the same non-empty `key` as the one before
 * replaces it instead of adding a step, so typing or nudging counts as one change. A change with a
 * different key (or none) ends the run. Going back and forward never changes the states.
 */
export function createHistory(initial = [], limit = 200) {
  let past = [], present = initial, future = [], last = null;
  return {
    get state() { return present; },
    get canUndo() { return past.length > 0; },
    get canRedo() { return future.length > 0; },
    push(next, key = null) {
      if (key && key === last) present = next;
      else { past.push(present); if (past.length > limit) past.shift(); present = next; }
      last = key;
      future = [];
      return present;
    },
    undo() { if (past.length) { future.push(present); present = past.pop(); last = null; } return present; },
    redo() { if (future.length) { past.push(present); present = future.pop(); last = null; } return present; },
    /** Start over with a new state and no steps. */
    reset(state = []) { past = []; future = []; present = state; last = null; },
  };
}

// ---- Saving -------------------------------------------------------------------------------------

async function load(bytes) {
  try { return await PDFDocument.load(bytes); }
  catch (e) {
    if (/encrypted/i.test(String(e?.message))) throw new Error("This PDF is password-protected. Remove the password in your PDF reader first.");
    throw new Error("This file isn't a readable PDF.");
  }
}

/**
 * Write marks into a PDF's pages and return the new file. The original pages stay as they are; the
 * marks are drawn on top of them, so every reader shows them the same way.
 *
 * Text that the built-in font can't write (Cyrillic, Greek, ...) needs `opts.fontkit` (the
 * `@pdf-lib/fontkit` module) and `opts.unicodeFont` (the bytes of a TrueType, OpenType or WOFF
 * font). Without them such text is refused with a message that names the characters.
 *
 * @param {ArrayBuffer | Uint8Array} bytes the PDF
 * @param {object[]} marks
 * @param {{ fontkit?: any, unicodeFont?: ArrayBuffer | Uint8Array }} [opts]
 * @returns {Promise<Uint8Array>}
 */
export async function applyMarks(bytes, marks, opts = {}) {
  const doc = await load(bytes);
  const pages = doc.getPages();
  const clean = marks.map((m, i) => cleanMark(m, i, pages.length));

  const fonts = {};
  const fontFor = async (text) => {
    if (isLatinText(text)) return (fonts.latin ??= await doc.embedFont(StandardFonts.Helvetica));
    if (!opts.fontkit || !opts.unicodeFont) {
      throw new Error(`The characters ${oddCharacters(text).slice(0, 8).join(" ")} can't be written into the PDF here. Use letters from the Latin alphabet (æ, ø, å, é, ü and ß are fine).`);
    }
    if (!fonts.unicode) { doc.registerFontkit(opts.fontkit); fonts.unicode = await doc.embedFont(opts.unicodeFont, { subset: true }); }
    return fonts.unicode;
  };

  const images = new Map(); // one embedded copy of a picture used more than once
  const imageFor = async (m) => {
    let img = images.get(m.bytes);
    if (!img) {
      try { img = m.mime === "image/png" ? await doc.embedPng(m.bytes) : await doc.embedJpg(m.bytes); }
      catch { throw new Error("A picture could not be read. Use a PNG or JPG."); }
      images.set(m.bytes, img);
    }
    return img;
  };

  for (let n = 1; n <= pages.length; n++) {
    const here = clean.filter((m) => m.page === n);
    if (!here.length) continue;
    const page = pages[n - 1];
    const g = pageGeometry(page);
    const H = g.height;
    page.pushOperators(pushGraphicsState(), concatTransformationMatrix(...viewMatrix(g)));
    for (const m of here) {
      if (m.type === "highlight") {
        page.drawRectangle({ x: m.x, y: H - m.y - m.h, width: m.w, height: m.h, color: colorOf(m.color, "#ffdf3d"), opacity: HIGHLIGHT_OPACITY, blendMode: BlendMode.Multiply });
      } else if (m.type === "rect") {
        const o = { x: m.x, y: H - m.y - m.h, width: m.w, height: m.h };
        if (m.fill) { o.color = colorOf(m.fill); o.opacity = m.fillOpacity; }
        if (m.strokeWidth > 0) { o.borderColor = colorOf(m.color); o.borderWidth = m.strokeWidth; o.borderOpacity = 1; }
        if (o.color || o.borderColor) page.drawRectangle(o);
        if (m.text.trim()) await drawText(page, m, H, await fontFor(m.text), m.textColor);
      } else if (m.type === "text") {
        if (m.text.trim()) await drawText(page, m, H, await fontFor(m.text), m.color);
      } else if (m.type === "path") {
        page.drawSvgPath(smoothPath(m.points), {
          x: 0, y: H, borderColor: colorOf(m.color), borderWidth: m.width, borderOpacity: 1,
          borderLineCap: LineCapStyle.Round, borderLineJoin: LineJoinStyle.Round,
        });
      } else if (m.type === "image") {
        const img = await imageFor(m);
        const h = m.h ?? (m.w * img.height) / img.width;
        page.drawImage(img, { x: m.x, y: H - m.y - h, width: m.w, height: h });
      }
    }
    page.pushOperators(popGraphicsState());
  }
  doc.setProducer(PRODUCER);
  return doc.save();
}

async function drawText(page, m, H, font, color) {
  const lines = textLines(m, (s) => font.widthOfTextAtSize(s, m.size));
  const [ox, oy] = textOrigin(m);
  lines.forEach((line, i) => {
    if (!line.trim()) return;
    page.drawText(line, { x: ox, y: H - (oy + m.size * BASELINE + i * m.size * LINE), size: m.size, font, color: colorOf(color) });
  });
}

/** How many pages a PDF has, and each page as a person sees it (for tools and tests). */
export async function pageSizes(bytes) {
  const doc = await load(bytes);
  return doc.getPages().map((p) => { const g = pageGeometry(p); return { width: g.width, height: g.height, rotate: g.rotate }; });
}
