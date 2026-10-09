// Remove Photo Location: strip EXIF (GPS, camera, time), XMP and IPTC metadata from JPEG, PNG and WebP
// without re-encoding, so the picture itself is untouched byte for byte.

const u16 = (b, o, le) => (le ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1]);
const u32 = (b, o, le) => (le ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0 : ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0);
const ascii = (b, o, n) => String.fromCharCode(...b.subarray(o, o + n));

/** Does this TIFF/EXIF block contain a GPS section (tag 0x8825 in the first IFD)? */
export function tiffHasGps(t) {
  if (t.length < 8) return false;
  const le = t[0] === 0x49;
  const ifd = u32(t, 4, le);
  if (ifd + 2 > t.length) return false;
  const n = u16(t, ifd, le);
  for (let i = 0; i < n; i++) if (u16(t, ifd + 2 + i * 12, le) === 0x8825) return true;
  return false;
}

export function detectFormat(b) {
  if (b[0] === 0xff && b[1] === 0xd8) return "jpeg";
  if (b[0] === 0x89 && ascii(b, 1, 3) === "PNG") return "png";
  if (ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") return "webp";
  return null;
}

function stripJpeg(b) {
  const out = [b.subarray(0, 2)];
  const found = { exif: false, gps: false, xmp: false, iptc: false, comment: false };
  let tiff = null;
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) throw new Error("This JPEG looks damaged.");
    const marker = b[i + 1];
    if (marker === 0xda) { out.push(b.subarray(i)); break; } // start of scan: image data follows
    const len = u16(b, i + 2, false);
    const seg = b.subarray(i, i + 2 + len);
    const body = b.subarray(i + 4, i + 2 + len);
    let drop = false;
    if (marker === 0xe1 && ascii(body, 0, 6) === "Exif\0\0") { drop = true; found.exif = true; tiff ??= body.subarray(6); found.gps ||= tiffHasGps(body.subarray(6)); }
    else if (marker === 0xe1 && ascii(body, 0, 28).startsWith("http://ns.adobe.com/")) { drop = true; found.xmp = true; }
    else if (marker === 0xed) { drop = true; found.iptc = true; }
    else if (marker === 0xfe) { drop = true; found.comment = true; }
    if (!drop) out.push(seg);
    i += 2 + len;
  }
  return { bytes: concat(out), found, tiff };
}

function stripPng(b) {
  const out = [b.subarray(0, 8)];
  const found = { exif: false, gps: false, xmp: false, iptc: false, comment: false };
  let tiff = null;
  let i = 8;
  while (i + 12 <= b.length) {
    const len = u32(b, i, false);
    const type = ascii(b, i + 4, 4);
    const chunk = b.subarray(i, i + 12 + len);
    if (type === "eXIf") { found.exif = true; tiff ??= b.subarray(i + 8, i + 8 + len); found.gps ||= tiffHasGps(b.subarray(i + 8, i + 8 + len)); }
    else if (type === "iTXt" && ascii(b, i + 8, 17) === "XML:com.adobe.xmp") found.xmp = true;
    else if (type === "tEXt" || type === "zTXt" || type === "iTXt") found.comment = true;
    if (!["eXIf", "tEXt", "zTXt", "iTXt", "tIME"].includes(type)) out.push(chunk);
    i += 12 + len;
    if (type === "IEND") break;
  }
  return { bytes: concat(out), found, tiff };
}

function stripWebp(b) {
  const found = { exif: false, gps: false, xmp: false, iptc: false, comment: false };
  let tiff = null;
  const chunks = [];
  let i = 12;
  while (i + 8 <= b.length) {
    const type = ascii(b, i, 4);
    const len = u32(b, i + 4, true);
    const total = 8 + len + (len & 1);
    let chunk = b.slice(i, i + total);
    if (type === "EXIF") {
      found.exif = true;
      let t = b.subarray(i + 8, i + 8 + len);
      if (ascii(t, 0, 6) === "Exif\0\0") t = t.subarray(6); // some writers keep the JPEG-style prefix
      tiff ??= t;
      found.gps ||= tiffHasGps(t);
      chunk = null;
    }
    else if (type === "XMP ") { found.xmp = true; chunk = null; }
    else if (type === "VP8X") chunk[8] &= ~0x0c; // clear the EXIF and XMP flags
    if (chunk) chunks.push(chunk);
    i += total;
  }
  const body = concat(chunks);
  const head = new Uint8Array(12);
  head.set(b.subarray(0, 12));
  const size = body.length + 4;
  head[4] = size & 255; head[5] = (size >> 8) & 255; head[6] = (size >> 16) & 255; head[7] = (size >>> 24) & 255;
  return { bytes: concat([head, body]), found, tiff };
}

function concat(parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

/**
 * @param {Uint8Array} bytes a JPEG, PNG or WebP file
 * @returns {{ bytes: Uint8Array, format: string, found: { exif: boolean, gps: boolean, xmp: boolean, iptc: boolean, comment: boolean }, tiff: Uint8Array | null }}
 */
export function stripMetadata(bytes) {
  const format = detectFormat(bytes);
  if (format === "jpeg") return { format, ...stripJpeg(bytes) };
  if (format === "png") return { format, ...stripPng(bytes) };
  if (format === "webp") return { format, ...stripWebp(bytes) };
  throw new Error("Use a JPG, PNG or WebP photo. For HEIC, convert it to JPG first.");
}

// ---- Reading what a photo gives away, to show it before it is removed ----

/** The entries of one TIFF directory, by tag, or null if the directory doesn't fit in the block. */
function entries(t, at, le) {
  if (!at || at + 2 > t.length) return null;
  const n = u16(t, at, le);
  if (at + 2 + n * 12 > t.length) return null;
  const map = new Map();
  for (let i = 0; i < n; i++) {
    const e = at + 2 + i * 12;
    map.set(u16(t, e, le), { type: u16(t, e + 2, le), count: u32(t, e + 4, le), at: e + 8 });
  }
  return map;
}

function text(t, e, le) {
  if (!e || e.type !== 2) return "";
  const at = e.count <= 4 ? e.at : u32(t, e.at, le);
  if (at + e.count > t.length) return "";
  return ascii(t, at, e.count).split("\0")[0].trim();
}

function rationals(t, e, le) {
  if (!e || (e.type !== 5 && e.type !== 10) || e.count > 16) return [];
  const at = u32(t, e.at, le);
  if (at + e.count * 8 > t.length) return [];
  return Array.from({ length: e.count }, (_, i) => {
    const num = u32(t, at + i * 8, le), den = u32(t, at + i * 8 + 4, le);
    return den ? num / den : 0;
  });
}

const pointer = (t, e, le) => (e && (e.type === 4 || e.type === 13) ? u32(t, e.at, le) : 0);

/**
 * What an EXIF block says about where, when and with what a photo was taken.
 * @param {Uint8Array | null} t a TIFF block (EXIF data without the "Exif\0\0" prefix)
 * @returns {{ lat?: number, lon?: number, taken?: string, camera?: string, software?: string }}
 */
export function exifDetails(t) {
  const out = {};
  if (!t || t.length < 8 || !(t[0] === 0x49 || t[0] === 0x4d)) return out;
  const le = t[0] === 0x49;
  const ifd0 = entries(t, u32(t, 4, le), le);
  if (!ifd0) return out;
  const make = text(t, ifd0.get(0x010f), le), model = text(t, ifd0.get(0x0110), le);
  const camera = make && model.toLowerCase().startsWith(make.toLowerCase()) ? model : `${make} ${model}`.trim();
  if (camera) out.camera = camera;
  const software = text(t, ifd0.get(0x0131), le);
  if (software) out.software = software;
  const exif = entries(t, pointer(t, ifd0.get(0x8769), le), le);
  const when = text(t, exif?.get(0x9003), le) || text(t, ifd0.get(0x0132), le); // DateTimeOriginal, else DateTime
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(when);
  if (m && m[1] !== "0000") out.taken = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
  const gps = entries(t, pointer(t, ifd0.get(0x8825), le), le);
  if (gps) {
    const deg = (v) => (v.length === 3 ? v[0] + v[1] / 60 + v[2] / 3600 : NaN);
    const lat = deg(rationals(t, gps.get(2), le)), lon = deg(rationals(t, gps.get(4), le));
    if (Number.isFinite(lat) && Number.isFinite(lon) && lat <= 90 && lon <= 180 && (lat || lon)) {
      out.lat = text(t, gps.get(1), le) === "S" ? -lat : lat;
      out.lon = text(t, gps.get(3), le) === "W" ? -lon : lon;
    }
  }
  return out;
}

/**
 * Read, without changing anything, what hidden details a photo carries.
 * @param {Uint8Array} bytes a JPEG, PNG or WebP file
 * @returns {{ format: string, found: { exif: boolean, gps: boolean, xmp: boolean, iptc: boolean, comment: boolean }, details: ReturnType<typeof exifDetails> }}
 */
export function readMetadata(bytes) {
  const { format, found, tiff } = stripMetadata(bytes);
  return { format, found, details: exifDetails(tiff) };
}
