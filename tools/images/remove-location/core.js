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
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) throw new Error("This JPEG looks damaged.");
    const marker = b[i + 1];
    if (marker === 0xda) { out.push(b.subarray(i)); break; } // start of scan: image data follows
    const len = u16(b, i + 2, false);
    const seg = b.subarray(i, i + 2 + len);
    const body = b.subarray(i + 4, i + 2 + len);
    let drop = false;
    if (marker === 0xe1 && ascii(body, 0, 6) === "Exif\0\0") { drop = true; found.exif = true; found.gps ||= tiffHasGps(body.subarray(6)); }
    else if (marker === 0xe1 && ascii(body, 0, 28).startsWith("http://ns.adobe.com/")) { drop = true; found.xmp = true; }
    else if (marker === 0xed) { drop = true; found.iptc = true; }
    else if (marker === 0xfe) { drop = true; found.comment = true; }
    if (!drop) out.push(seg);
    i += 2 + len;
  }
  return { bytes: concat(out), found };
}

function stripPng(b) {
  const out = [b.subarray(0, 8)];
  const found = { exif: false, gps: false, xmp: false, iptc: false, comment: false };
  let i = 8;
  while (i + 12 <= b.length) {
    const len = u32(b, i, false);
    const type = ascii(b, i + 4, 4);
    const chunk = b.subarray(i, i + 12 + len);
    if (type === "eXIf") { found.exif = true; found.gps ||= tiffHasGps(b.subarray(i + 8, i + 8 + len)); }
    else if (type === "iTXt" && ascii(b, i + 8, 17) === "XML:com.adobe.xmp") found.xmp = true;
    else if (type === "tEXt" || type === "zTXt" || type === "iTXt") found.comment = true;
    if (!["eXIf", "tEXt", "zTXt", "iTXt", "tIME"].includes(type)) out.push(chunk);
    i += 12 + len;
    if (type === "IEND") break;
  }
  return { bytes: concat(out), found };
}

function stripWebp(b) {
  const found = { exif: false, gps: false, xmp: false, iptc: false, comment: false };
  const chunks = [];
  let i = 12;
  while (i + 8 <= b.length) {
    const type = ascii(b, i, 4);
    const len = u32(b, i + 4, true);
    const total = 8 + len + (len & 1);
    let chunk = b.slice(i, i + total);
    if (type === "EXIF") { found.exif = true; found.gps ||= tiffHasGps(b.subarray(i + 8, i + 8 + len)); chunk = null; }
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
  return { bytes: concat([head, body]), found };
}

function concat(parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

/**
 * @param {Uint8Array} bytes a JPEG, PNG or WebP file
 * @returns {{ bytes: Uint8Array, format: string, found: { exif: boolean, gps: boolean, xmp: boolean, iptc: boolean, comment: boolean } }}
 */
export function stripMetadata(bytes) {
  const format = detectFormat(bytes);
  if (format === "jpeg") return { format, ...stripJpeg(bytes) };
  if (format === "png") return { format, ...stripPng(bytes) };
  if (format === "webp") return { format, ...stripWebp(bytes) };
  throw new Error("Use a JPG, PNG or WebP photo. For HEIC, convert it to JPG first.");
}
