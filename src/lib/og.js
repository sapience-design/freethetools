// Share images (og:image) for link previews: 1200×630 PNGs drawn at build time from each tool's
// product shot and its name. Text is turned into outlines with the site's own font files, so the
// image is identical on every machine; sharp (libvips) only rasterises shapes.
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
const SERIF = font("@fontsource/instrument-serif/files/instrument-serif-latin-400-normal.woff");
const MONO = font("@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff");
const MONO_MED = font("@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff");

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
 * @param {{ eyebrow: string, title: string, text: string, art: string, dark?: boolean }} o
 */
export function ogSvg({ eyebrow, title, text, art }) {
  const PAD = 72, COL = 500; // left text column
  const ink = "#1c1f23", muted = "#6b7280", paper = "#fafaf9";

  // Title: as large as fits in two lines.
  let size = 88, titleLines;
  for (; size >= 56; size -= 4) {
    titleLines = wrap(SERIF, title, size, COL, 2);
    if (titleLines.every((l) => line(SERIF, l, size).width <= COL)) break;
  }
  const lead = size * 1.02;
  const textLines = wrap(MONO, text, 22, COL, 4);

  let y = 150;
  const parts = [];
  parts.push(`<rect x="${PAD}" y="${y - 50}" width="44" height="6" rx="1" fill="#f2c200"/>`);
  parts.push(line(MONO_MED, eyebrow.toUpperCase(), 20).svg(PAD, y, muted));
  y += 26 + size * 0.86;
  for (const l of titleLines) { parts.push(line(SERIF, l, size).svg(PAD, y, ink)); y += lead; }
  y += 52 - lead; // from the last title baseline to the first line of text
  for (const l of textLines) { parts.push(line(MONO, l, 22).svg(PAD, y, muted)); y += 34; }
  parts.push(line(MONO_MED, "freethetools.com", 20).svg(PAD, OG_H - 64, ink));
  const tagline = line(MONO, "free · in your browser · nothing uploaded", 18);
  parts.push(tagline.svg(PAD, OG_H - 64 + 30, muted));

  // The product shot fills the right side, cropped to the panel like on the site.
  const shotX = 620;
  const shot = art.replace(/^<svg\b[^>]*>/, `<svg x="${shotX}" y="0" width="${OG_W - shotX}" height="${OG_H}" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice">`);

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_W}" height="${OG_H}" viewBox="0 0 ${OG_W} ${OG_H}">` +
    `<title>${esc(title)}</title>` +
    `<rect width="${OG_W}" height="${OG_H}" fill="${paper}"/>` +
    shot +
    `<rect x="${shotX}" y="0" width="1" height="${OG_H}" fill="#000" fill-opacity=".06"/>` +
    parts.join("") +
    `</svg>`
  );
}

/** Render the share image to PNG bytes. */
export async function ogPng(o) {
  return sharp(Buffer.from(ogSvg(o))).png({ compressionLevel: 9, palette: false }).toBuffer();
}
