// Share images (og:image) for link previews: 1200×630 PNGs drawn at build time from each tool's
// product shot and its job in plain words. Text is turned into outlines with the site's own font
// files, so the image is identical on every machine; sharp (libvips) only rasterises shapes.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import opentype from "opentype.js";
import sharp from "sharp";

export const OG_W = 1200;
export const OG_H = 630;

const require = createRequire(import.meta.url);
function font(file) {
  const b = readFileSync(require.resolve(file));
  return opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
}
const DISPLAY = font("@fontsource/bricolage-grotesque/files/bricolage-grotesque-latin-700-normal.woff");
const DISPLAY_MED = font("@fontsource/bricolage-grotesque/files/bricolage-grotesque-latin-600-normal.woff");
const TEXT = font("@fontsource/bricolage-grotesque/files/bricolage-grotesque-latin-400-normal.woff");
const MONO = font("@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff");
// The site's mark: Phosphor "sparkle" (MIT).
const SPARKLE = readFileSync(require.resolve("@phosphor-icons/core/assets/bold/sparkle-bold.svg"), "utf8").replace(/^<svg[^>]*>|<\/svg>\s*$/g, "");

const INK = "#1d1b16", SOFT = "#4b473f", MUTED = "#6a655b", PAPER = "#fbf8f2", HL = "#ffe27a";
const TINT = { pdf: "#ffdcd3", images: "#cdeee0", text: "#e6defd", data: "#d9e6fd", developer: "#e2e5ea", everyday: "#ffe6bf" };

/**
 * Lay out one line glyph by glyph with kerning. opentype.js's own shaping stops on some OpenType
 * substitution formats these fonts use, and short Latin labels don't need ligatures.
 */
function line(f, text, size) {
  const scale = size / f.unitsPerEm;
  const glyphs = [...text].map((c) => f.charToGlyph(c));
  let width = 0;
  const placed = glyphs.map((g, i) => {
    if (i) width += f.getKerningValue(glyphs[i - 1], g) * scale;
    const at = width;
    width += g.advanceWidth * scale;
    return [g, at];
  });
  const svg = (x, y, fill) => `<path d="${placed.map(([g, at]) => pathData(g.getPath(x + at, y, size))).join("")}" fill="${fill}"/>`;
  return { width, svg };
}

// Our own path formatter: opentype.js 2.0's toPathData() writes NaN for some coordinates, and the
// renderer then drops the rest of the path.
const n = (v) => (Math.round(v * 10) / 10).toString();
function pathData(p) {
  return p.commands.map((c) =>
    c.type === "M" || c.type === "L" ? `${c.type}${n(c.x)} ${n(c.y)}`
    : c.type === "Q" ? `Q${n(c.x1)} ${n(c.y1)} ${n(c.x)} ${n(c.y)}`
    : c.type === "C" ? `C${n(c.x1)} ${n(c.y1)} ${n(c.x2)} ${n(c.y2)} ${n(c.x)} ${n(c.y)}`
    : "Z").join("");
}

/** Break text into lines no wider than maxWidth; the last line gets an ellipsis if it overflows. */
function wrap(f, text, size, maxWidth, maxLines) {
  const words = text.split(/\s+/);
  const lines = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (cur && line(f, next, size).width > maxWidth) { lines.push(cur); cur = w; } else cur = next;
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (last.includes(" ") && line(f, `${last}…`, size).width > maxWidth) last = last.replace(/\s+\S+$/, "");
    kept[maxLines - 1] = `${last.replace(/[,.;:]$/, "")}…`;
    return kept;
  }
  return lines;
}

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/**
 * Compose the share image. `art` is a product shot from src/data/art.ts (a 400×300 SVG).
 * @param {{ eyebrow: string, title: string, text: string, art: string, group?: string }} o
 */
export function ogSvg({ eyebrow, title, text, art, group }) {
  const PAD = 72, COL = 500; // left text column
  const tint = TINT[group] ?? HL;
  const parts = [];

  // The mark and the name, as on the site's top bar.
  parts.push(`<rect x="${PAD}" y="${64 + 5}" width="52" height="52" rx="15" fill="${INK}"/>`);
  parts.push(`<rect x="${PAD}" y="64" width="52" height="52" rx="15" fill="${HL}" stroke="${INK}" stroke-width="2.5"/>`);
  parts.push(`<svg x="${PAD + 11}" y="${64 + 11}" width="30" height="30" viewBox="0 0 256 256" fill="${INK}">${SPARKLE}</svg>`);
  parts.push(line(DISPLAY, "Free the Tools", 30).svg(PAD + 70, 100, INK));

  // Eyebrow pill in the group's tint.
  const eb = line(DISPLAY_MED, eyebrow, 22);
  parts.push(`<rect x="${PAD}" y="168" width="${Math.round(eb.width + 36)}" height="44" rx="22" fill="${tint}"/>`);
  parts.push(eb.svg(PAD + 18, 197, INK));

  // Title: as large as fits in two lines; long ones drop to three at the smallest size.
  let size = 76, titleLines = [];
  for (; size > 52; size -= 4) { titleLines = wrap(DISPLAY, title, size, COL, 9); if (titleLines.length <= 2) break; }
  titleLines = wrap(DISPLAY, title, size, COL, 3);
  const lead = size * 1.06;
  let y = 250 + size * 0.82;
  for (const l of titleLines) { parts.push(line(DISPLAY, l, size).svg(PAD, y, INK)); y += lead; }
  y += 58 - lead;
  // Supporting text: as many lines (up to three) as fit above the address.
  const room = Math.max(0, Math.min(3, Math.floor((OG_H - 140 - y) / 36) + 1));
  for (const l of room ? wrap(TEXT, text, 26, COL, room) : []) { parts.push(line(TEXT, l, 26).svg(PAD, y, SOFT)); y += 36; }

  // Address and the promise, on a highlighter stroke.
  const promise = line(DISPLAY_MED, "Nothing is uploaded.", 24);
  const addr = line(MONO, "freethetools.com", 20);
  parts.push(addr.svg(PAD, OG_H - 104, MUTED));
  parts.push(`<rect x="${PAD - 4}" y="${OG_H - 82}" width="${Math.round(promise.width + 8)}" height="18" rx="2" fill="${HL}"/>`);
  parts.push(promise.svg(PAD, OG_H - 66, INK));

  // The product shot in an outlined card with the site's 3px-style drop shadow.
  const cx = 640, cy = 56, cw = 500, ch = OG_H - 112, r = 28;
  const shot = art.replace(/^<svg\b[^>]*>/, `<svg x="${cx}" y="${cy}" width="${cw}" height="${ch}" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice">`);

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_W}" height="${OG_H}" viewBox="0 0 ${OG_W} ${OG_H}">` +
    `<title>${esc(title)}</title>` +
    `<defs><clipPath id="card"><rect x="${cx}" y="${cy}" width="${cw}" height="${ch}" rx="${r}"/></clipPath></defs>` +
    `<rect width="${OG_W}" height="${OG_H}" fill="${PAPER}"/>` +
    `<rect x="${cx}" y="${cy + 7}" width="${cw}" height="${ch}" rx="${r}" fill="${INK}"/>` +
    `<rect x="${cx}" y="${cy}" width="${cw}" height="${ch}" rx="${r}" fill="${tint}"/>` +
    `<g clip-path="url(#card)">${shot}</g>` +
    `<rect x="${cx}" y="${cy}" width="${cw}" height="${ch}" rx="${r}" fill="none" stroke="${INK}" stroke-width="3"/>` +
    parts.join("") +
    `</svg>`
  );
}

/** Render the share image to PNG bytes. */
export async function ogPng(o) {
  return sharp(Buffer.from(ogSvg(o))).png({ compressionLevel: 9, palette: false }).toBuffer();
}
