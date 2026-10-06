// File Converter: finds out what a file is, lists what it can become, and holds the small
// encoders (BMP, ICO, WAV) and text conversions. Everything that touches the page (canvas,
// audio decoding, downloads) lives in Tool.astro, so this file runs in Node and is tested there.
import Papa from "papaparse";
import { csvToJson, jsonToCsv } from "../../data/csv-to-json/core.js";
import { markdownToHtml, htmlToMarkdown, htmlToText, markdownToText } from "../../text/markdown-to-html/core.js";

export const REQUEST_URL = "https://github.com/sapience-design/freethetools/issues/new?template=tool_request.yml";

// ---- What is this file? -----------------------------------------------------------------------

const IMAGES = {
  png: { label: "PNG image", mime: "image/png" },
  jpeg: { label: "JPEG image", mime: "image/jpeg" },
  gif: { label: "GIF image", mime: "image/gif" },
  webp: { label: "WebP image", mime: "image/webp" },
  bmp: { label: "BMP image", mime: "image/bmp" },
  ico: { label: "ICO icon", mime: "image/x-icon" },
  svg: { label: "SVG image", mime: "image/svg+xml" },
  avif: { label: "AVIF image", mime: "image/avif" },
};
const AUDIO = {
  wav: { label: "WAV audio", mime: "audio/wav" },
  mp3: { label: "MP3 audio", mime: "audio/mpeg" },
  ogg: { label: "Ogg audio", mime: "audio/ogg" },
  flac: { label: "FLAC audio", mime: "audio/flac" },
  m4a: { label: "M4A audio", mime: "audio/mp4" },
  aac: { label: "AAC audio", mime: "audio/aac" },
  webm: { label: "WebM audio", mime: "audio/webm" },
};
const TEXTS = {
  csv: { kind: "data", label: "CSV table" },
  tsv: { kind: "data", label: "TSV table" },
  json: { kind: "data", label: "JSON data" },
  markdown: { kind: "doc", label: "Markdown document" },
  html: { kind: "doc", label: "HTML document" },
  txt: { kind: "doc", label: "Text file" },
};
const TEXT_BY_EXT = { csv: "csv", tsv: "tsv", tab: "tsv", json: "json", md: "markdown", markdown: "markdown", mdown: "markdown", html: "html", htm: "html", xhtml: "html", txt: "txt", text: "txt" };
const AUDIO_BY_EXT = { m4a: "m4a", m4b: "m4a", weba: "webm", webm: "webm", mka: "webm", opus: "ogg", oga: "ogg" };

const ascii = (b, from, len) => String.fromCharCode(...b.subarray(from, from + len));
const extOf = (name) => (/\.([^.\\/]+)$/.exec(name)?.[1] ?? "").toLowerCase();

/**
 * Work out what a file is. The first bytes decide (a PNG renamed to .txt is still a PNG);
 * the extension is only used for plain-text formats, which have no signature.
 * @param {Uint8Array} bytes the first 64 KB or more of the file
 * @param {string} [name]
 * @returns {{ kind: "image"|"audio"|"data"|"doc"|"pdf"|"unknown", format: string, label: string, mime: string }}
 */
export function detectType(bytes, name = "") {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const ext = extOf(name);
  const image = (format) => ({ kind: "image", format, ...IMAGES[format] });
  const audio = (format) => ({ kind: "audio", format, ...AUDIO[format] });

  if (b.length >= 8 && b[0] === 0x89 && ascii(b, 1, 3) === "PNG") return image("png");
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return image("jpeg");
  if (ascii(b, 0, 4) === "GIF8") return image("gif");
  if (ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") return image("webp");
  if (ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WAVE") return audio("wav");
  if (b.length >= 26 && b[0] === 0x42 && b[1] === 0x4d && [12, 40, 52, 56, 108, 124].includes(b[14] | (b[15] << 8))) return image("bmp");
  if (b.length >= 6 && b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0 && (b[4] | (b[5] << 8)) > 0) return image("ico");
  if (ascii(b, 4, 4) === "ftyp") {
    const brand = ascii(b, 8, 4);
    if (brand === "avif" || brand === "avis") return image("avif");
    if (brand === "M4A " || brand === "M4B ") return audio("m4a");
    if (/^(heic|heix|hevc|hevx|mif1|msf1)$/.test(brand)) return { kind: "unknown", format: "heic", label: "HEIC photo", mime: "image/heic" };
    if (ext === "m4a") return audio("m4a");
    return { kind: "unknown", format: "mp4", label: "video file", mime: "video/mp4" };
  }
  if (ascii(b, 0, 4) === "%PDF") return { kind: "pdf", format: "pdf", label: "PDF document", mime: "application/pdf" };
  if (ascii(b, 0, 3) === "ID3") return audio("mp3");
  if (ascii(b, 0, 4) === "OggS") return audio("ogg");
  if (ascii(b, 0, 4) === "fLaC") return audio("flac");
  if (b.length >= 2 && b[0] === 0xff && (b[1] & 0xf6) === 0xf0) return audio("aac");
  if (b.length >= 2 && b[0] === 0xff && (b[1] & 0xe0) === 0xe0 && ((b[1] >> 1) & 3) !== 0) return audio("mp3");
  if (b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) {
    return AUDIO_BY_EXT[ext] ? audio(AUDIO_BY_EXT[ext]) : { kind: "unknown", format: "matroska", label: "video file", mime: "video/webm" };
  }
  if (ascii(b, 0, 2) === "PK") return { kind: "unknown", format: "zip", label: "ZIP-based file (Office document or archive)", mime: "application/zip" };

  // No signature: it has to be text.
  const head = b.subarray(0, 65536);
  if (head.includes(0)) return { kind: "unknown", format: "binary", label: "binary file", mime: "application/octet-stream" };
  const text = new TextDecoder("utf-8").decode(head).replace(/^﻿/, "");
  const start = text.trimStart().slice(0, 2000);
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!doctype svg[^>]*>\s*)?<svg[\s>]/i.test(start)) return image("svg");
  const known = TEXT_BY_EXT[ext];
  if (known) {
    if (known === "txt" && /^<(!doctype html|html[\s>])/i.test(start)) return { ...TEXTS.html, format: "html", mime: "text/html" };
    return { ...TEXTS[known], format: known, mime: "text/plain" };
  }
  return { kind: "unknown", format: "text", label: "file we don't recognise", mime: "application/octet-stream" };
}

// ---- What can it become? ----------------------------------------------------------------------

const OUT = {
  png: { label: "PNG", ext: "png", mime: "image/png", note: "keeps transparency" },
  jpeg: { label: "JPEG", ext: "jpg", mime: "image/jpeg", note: "smaller photos; transparent areas become white" },
  webp: { label: "WebP", ext: "webp", mime: "image/webp", note: "small, keeps transparency" },
  bmp: { label: "BMP", ext: "bmp", mime: "image/bmp", note: "large and simple; transparent areas become white" },
  ico: { label: "ICO", ext: "ico", mime: "image/x-icon", note: "icon with several sizes" },
  wav: { label: "WAV", ext: "wav", mime: "audio/wav", note: "16-bit, no compression" },
  json: { label: "JSON", ext: "json", mime: "application/json", note: "a list of objects" },
  csv: { label: "CSV", ext: "csv", mime: "text/csv", note: "comma separated" },
  tsv: { label: "TSV", ext: "tsv", mime: "text/tab-separated-values", note: "tab separated" },
  html: { label: "HTML", ext: "html", mime: "text/html", note: "a web page" },
  markdown: { label: "Markdown", ext: "md", mime: "text/markdown", note: "plain text with simple marks" },
  text: { label: "Plain text", ext: "txt", mime: "text/plain", note: "no formatting" },
};

const OUTPUTS = {
  png: ["jpeg", "webp", "bmp", "ico"],
  jpeg: ["png", "webp", "bmp", "ico"],
  gif: ["png", "jpeg", "webp", "bmp", "ico"],
  webp: ["png", "jpeg", "bmp", "ico"],
  bmp: ["png", "jpeg", "webp", "ico"],
  ico: ["png", "jpeg", "webp", "bmp"],
  svg: ["png", "jpeg", "webp", "bmp", "ico"],
  avif: ["png", "jpeg", "webp", "bmp", "ico"],
  csv: ["json", "tsv"],
  tsv: ["json", "csv"],
  json: ["csv", "tsv"],
  markdown: ["html", "text"],
  html: ["markdown", "text"],
  txt: ["html"],
};

/**
 * Every output a detected file can be turned into; the first is the default.
 * @returns {{ id: string, label: string, ext: string, mime: string, note: string }[]}
 */
export function outputsFor(det) {
  const ids = det.kind === "audio" ? ["wav"] : OUTPUTS[det.format] ?? [];
  return ids.map((id) => ({ id, ...OUT[id] }));
}

/** Specialised tools worth knowing about for a kind of file. */
export function relatedTools(det) {
  if (det.kind === "pdf") return [{ href: "/pdf/to-images/", name: "PDF to Images" }, { href: "/pdf/compress/", name: "Compress PDF" }];
  if (det.kind === "image") return [{ href: "/pdf/images-to-pdf/", name: "Images to PDF" }, { href: "/images/compress/", name: "Compress Images" }, { href: "/images/resize/", name: "Resize Images" }];
  return [];
}

/** "photo.PNG" + "bmp" -> "photo.bmp" */
export function renameTo(name, ext) {
  const stem = name.replace(/\.[^.\\/]+$/, "") || "file";
  return `${stem}.${ext}`;
}

// ---- Images: BMP and ICO ----------------------------------------------------------------------

/**
 * A 24-bit BMP. BMP has no dependable transparency, so the caller flattens the picture on white first.
 * @param {number} width
 * @param {number} height
 * @param {Uint8ClampedArray|Uint8Array} rgba width*height*4 bytes, top row first
 * @returns {Uint8Array}
 */
export function encodeBmp(width, height, rgba) {
  if (!(width > 0 && height > 0) || rgba.length < width * height * 4) throw new Error("The picture has no pixels to write.");
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const dataSize = rowSize * height;
  const out = new Uint8Array(54 + dataSize);
  const v = new DataView(out.buffer);
  out[0] = 0x42; out[1] = 0x4d;
  v.setUint32(2, out.length, true);
  v.setUint32(10, 54, true); // where the pixels start
  v.setUint32(14, 40, true); // BITMAPINFOHEADER
  v.setInt32(18, width, true);
  v.setInt32(22, height, true); // positive: rows run bottom to top
  v.setUint16(26, 1, true);
  v.setUint16(28, 24, true);
  v.setUint32(34, dataSize, true);
  v.setInt32(38, 2835, true); // 72 dpi
  v.setInt32(42, 2835, true);
  for (let y = 0; y < height; y++) {
    let o = 54 + (height - 1 - y) * rowSize;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      out[o++] = rgba[i + 2]; out[o++] = rgba[i + 1]; out[o++] = rgba[i];
    }
  }
  return out;
}

/** Icon sizes to write for a picture: the standard ones that fit inside it (at least 16). */
export function icoSizes(width, height) {
  const longest = Math.max(width, height);
  const sizes = [16, 32, 48, 64, 128, 256].filter((s) => s <= longest);
  return sizes.length ? sizes : [16];
}

/**
 * An ICO file holding PNG images (supported since Windows Vista and by every browser).
 * @param {{ size: number, png: Uint8Array }[]} images square images, each at most 256 pixels
 * @returns {Uint8Array}
 */
export function encodeIco(images) {
  if (!images.length) throw new Error("The icon needs at least one image.");
  const head = 6 + 16 * images.length;
  const out = new Uint8Array(head + images.reduce((n, i) => n + i.png.length, 0));
  const v = new DataView(out.buffer);
  v.setUint16(2, 1, true); // type: icon
  v.setUint16(4, images.length, true);
  let offset = head;
  images.forEach((img, n) => {
    if (img.size < 1 || img.size > 256) throw new Error("Icon images must be 1 to 256 pixels wide.");
    const e = 6 + 16 * n;
    out[e] = img.size === 256 ? 0 : img.size; // 0 means 256
    out[e + 1] = img.size === 256 ? 0 : img.size;
    v.setUint16(e + 4, 1, true); // colour planes
    v.setUint16(e + 6, 32, true); // bits per pixel
    v.setUint32(e + 8, img.png.length, true);
    v.setUint32(e + 12, offset, true);
    out.set(img.png, offset);
    offset += img.png.length;
  });
  return out;
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

// ---- Audio: WAV -------------------------------------------------------------------------------

/**
 * A 16-bit PCM WAV file.
 * @param {Float32Array[]} channels one array of samples (-1 to 1) per channel, all the same length
 * @param {number} sampleRate
 * @returns {Uint8Array}
 */
export function encodeWav(channels, sampleRate) {
  const n = channels.length;
  if (!n || n > 8) throw new Error("This sound has no channels, or too many, to write as WAV.");
  const frames = channels[0].length;
  const dataSize = frames * n * 2;
  if (dataSize > 0xffffffff - 36) throw new Error("This sound is too long for a WAV file (over 4 GB).");
  const out = new Uint8Array(44 + dataSize);
  const v = new DataView(out.buffer);
  const tag = (o, s) => { for (let i = 0; i < 4; i++) out[o + i] = s.charCodeAt(i); };
  tag(0, "RIFF"); v.setUint32(4, 36 + dataSize, true); tag(8, "WAVE");
  tag(12, "fmt "); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, n, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * n * 2, true);
  v.setUint16(32, n * 2, true);
  v.setUint16(34, 16, true);
  tag(36, "data"); v.setUint32(40, dataSize, true);
  let o = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < n; c++) {
      const s = Math.max(-1, Math.min(1, channels[c][i]));
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
  }
  return out;
}

// ---- Data: CSV, TSV and JSON ------------------------------------------------------------------

const DELIMITER = { csv: ",", tsv: "\t" };
const cellText = (v) => (v !== null && typeof v === "object" ? JSON.stringify(v) : v);

/**
 * Convert between CSV, TSV and JSON (a list of objects).
 * @param {string} text
 * @param {"csv"|"tsv"|"json"} from
 * @param {"csv"|"tsv"|"json"} to
 * @returns {{ text: string, rows: number }}
 */
export function convertData(text, from, to) {
  const src = text.replace(/^﻿/, "");
  if (!src.trim()) throw new Error("This file is empty.");
  if (from === to) return { text: src, rows: 0 };
  if (from === "json") {
    let data;
    try { data = JSON.parse(src); } catch (e) { throw new Error(`This isn't valid JSON (${e.message}). Check for a missing comma or quote.`); }
    if (!Array.isArray(data) || !data.length) throw new Error('Use a JSON list of objects, for example [{"name": "Ada"}].');
    if (!data.every((r) => r !== null && typeof r === "object")) throw new Error('Every item in the list must be an object, for example {"name": "Ada"}.');
    const rows = data.map((r) => (Array.isArray(r) ? r.map(cellText) : Object.fromEntries(Object.entries(r).map(([k, v]) => [k, cellText(v)]))));
    return { text: jsonToCsv(JSON.stringify(rows), { delimiter: DELIMITER[to] }), rows: rows.length };
  }
  if (to === "json") {
    const r = csvToJson(src, { delimiter: DELIMITER[from] });
    return { text: r.json, rows: r.rows };
  }
  // CSV <-> TSV: re-write every row, keeping the header as an ordinary row.
  const parsed = Papa.parse(src.replace(/^\s+|\s+$/g, ""), { delimiter: DELIMITER[from], skipEmptyLines: true });
  return { text: Papa.unparse(parsed.data, { delimiter: DELIMITER[to] }), rows: Math.max(0, parsed.data.length - 1) };
}

// ---- Text documents ---------------------------------------------------------------------------

/** A complete web page around converted Markdown, so the downloaded file opens properly. */
export function htmlPage(body, title = "Document") {
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  return `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${esc(title)}</title>\n</head>\n<body>\n${body.trim()}\n</body>\n</html>\n`;
}

/**
 * Convert Markdown, HTML or text to HTML, Markdown or plain text.
 * @param {string} text
 * @param {"markdown"|"html"|"txt"} from
 * @param {"html"|"markdown"|"text"} to
 * @param {string} [title] used as the page title in HTML output
 * @param {{ purify?: any }} [opts] purify: a DOMPurify to use (tests pass one built on jsdom)
 */
export function convertDocument(text, from, to, title = "Document", opts = {}) {
  const src = text.replace(/^﻿/, "");
  if (!src.trim()) throw new Error("This file is empty.");
  if (to === "html") return htmlPage(markdownToHtml(src, { purify: opts.purify }), title);
  if (to === "markdown" && from === "html") return htmlToMarkdown(src);
  if (to === "text") return from === "html" ? htmlToText(src) : markdownToText(src);
  throw new Error("That conversion isn't available.");
}
