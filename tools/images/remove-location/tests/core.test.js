import test from "node:test";
import assert from "node:assert/strict";
import { stripMetadata, tiffHasGps, detectFormat } from "../core.js";

// A minimal little-endian TIFF block whose first IFD holds one entry: the GPS pointer (0x8825).
function tiffWithGps() {
  const t = new Uint8Array(26);
  t.set([0x49, 0x49, 0x2a, 0x00, 8, 0, 0, 0]); // II*, IFD at 8
  t.set([1, 0], 8); // one entry
  t.set([0x25, 0x88, 4, 0, 1, 0, 0, 0, 0, 0, 0, 0], 10); // tag 0x8825
  return t;
}

// JPEG: SOI, APP0 (JFIF), APP1 (Exif with GPS), COM, then SOS and fake image data, EOI.
function makeJpeg() {
  const exif = new Uint8Array([...new TextEncoder().encode("Exif\0\0"), ...tiffWithGps()]);
  const app1 = [0xff, 0xe1, (exif.length + 2) >> 8, (exif.length + 2) & 255, ...exif];
  const app0 = [0xff, 0xe0, 0, 7, 0x4a, 0x46, 0x49, 0x46, 0];
  const com = [0xff, 0xfe, 0, 5, 0x68, 0x69, 0x21];
  const sos = [0xff, 0xda, 0, 4, 1, 2, 9, 9, 9, 0xff, 0xd9];
  return Uint8Array.from([0xff, 0xd8, ...app0, ...app1, ...com, ...sos]);
}

test("detects formats", () => {
  assert.equal(detectFormat(makeJpeg()), "jpeg");
  assert.equal(detectFormat(new Uint8Array([1, 2, 3])), null);
});

test("finds a GPS section", () => {
  assert.equal(tiffHasGps(tiffWithGps()), true);
});

test("strips EXIF and comments from a JPEG and keeps the image data", () => {
  const input = makeJpeg();
  const r = stripMetadata(input);
  assert.deepEqual(r.found, { exif: true, gps: true, xmp: false, iptc: false, comment: true });
  const hex = Buffer.from(r.bytes).toString("hex");
  assert.ok(!hex.includes("ffe1"), "APP1 removed");
  assert.ok(!hex.includes("fffe"), "comment removed");
  assert.ok(hex.includes("ffe0"), "JFIF kept");
  assert.ok(hex.endsWith("ffda000401020909" + "09ffd9"), "scan data untouched");
});

test("strips eXIf and text chunks from a PNG", () => {
  const chunk = (type, data) => {
    const b = new Uint8Array(12 + data.length);
    new DataView(b.buffer).setUint32(0, data.length);
    b.set(new TextEncoder().encode(type), 4);
    b.set(data, 8);
    return b;
  };
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const png = Uint8Array.from([...sig, ...chunk("IHDR", new Uint8Array(13)), ...chunk("eXIf", tiffWithGps()), ...chunk("tEXt", new TextEncoder().encode("Author\0me")), ...chunk("IDAT", new Uint8Array([1, 2])), ...chunk("IEND", new Uint8Array())]);
  const r = stripMetadata(png);
  assert.equal(r.found.gps, true);
  const s = Buffer.from(r.bytes).toString("latin1");
  assert.ok(!s.includes("eXIf") && !s.includes("tEXt"));
  assert.ok(s.includes("IHDR") && s.includes("IDAT") && s.includes("IEND"));
});

test("rejects other formats with a helpful message", () => {
  assert.throws(() => stripMetadata(new Uint8Array([0, 0, 0, 0])), /JPG, PNG or WebP/);
});

// ---- Reading the details, before removing them ----
import { exifDetails, readMetadata } from "../core.js";

const enc = (s) => new TextEncoder().encode(s);
const rat = (...v) => { const b = new Uint8Array(v.length * 4); const dv = new DataView(b.buffer); v.forEach((x, i) => dv.setUint32(i * 4, x, true)); return b; };

// A little-endian TIFF block laid out from a list of directories; { ptr: name } points at another one.
function buildTiff(dirs) {
  const at = {};
  let o = 8;
  for (const d of dirs) { at[d.name] = o; o += 2 + d.entries.length * 12 + 4; }
  const out = new Uint8Array(1024);
  const dv = new DataView(out.buffer);
  out.set([0x49, 0x49, 0x2a, 0]);
  dv.setUint32(4, at[dirs[0].name], true);
  let data = o;
  for (const d of dirs) {
    let p = at[d.name];
    dv.setUint16(p, d.entries.length, true);
    p += 2;
    for (const [tag, type, count, val] of d.entries) {
      dv.setUint16(p, tag, true); dv.setUint16(p + 2, type, true); dv.setUint32(p + 4, count, true);
      if (val.ptr) dv.setUint32(p + 8, at[val.ptr], true);
      else if (val.length <= 4) out.set(val, p + 8);
      else { out.set(val, data); dv.setUint32(p + 8, data, true); data += val.length + (val.length & 1); }
      p += 12;
    }
  }
  return out.subarray(0, data);
}

const photoTiff = () => buildTiff([
  { name: "ifd0", entries: [[0x010f, 2, 6, enc("Apple\0")], [0x0110, 2, 10, enc("iPhone 14\0")], [0x8769, 4, 1, { ptr: "exif" }], [0x8825, 4, 1, { ptr: "gps" }]] },
  { name: "exif", entries: [[0x9003, 2, 20, enc("2024:03:14 10:32:05\0")]] },
  { name: "gps", entries: [[1, 2, 2, enc("N\0")], [2, 5, 3, rat(59, 1, 54, 1, 5004, 100)], [3, 2, 2, enc("W\0")], [4, 5, 3, rat(10, 1, 45, 1, 792, 100)]] },
]);

test("reads where, when and with what a photo was taken", () => {
  const d = exifDetails(photoTiff());
  assert.equal(d.camera, "Apple iPhone 14");
  assert.equal(d.taken, "2024-03-14T10:32:05");
  assert.ok(Math.abs(d.lat - 59.9139) < 1e-4, `lat ${d.lat}`);
  assert.ok(Math.abs(d.lon + 10.7522) < 1e-4, `lon ${d.lon}`);
});

test("a GPS pointer to nowhere gives no coordinates and no crash", () => {
  assert.deepEqual(exifDetails(tiffWithGps()), {});
  assert.deepEqual(exifDetails(new Uint8Array([0x49, 0x49, 0x2a, 0, 0xff, 0xff, 0, 0])), {});
  assert.deepEqual(exifDetails(null), {});
});

test("readMetadata reports a JPEG's details without changing it", () => {
  const tiff = photoTiff();
  const exif = new Uint8Array([...enc("Exif\0\0"), ...tiff]);
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, (exif.length + 2) >> 8, (exif.length + 2) & 255, ...exif, 0xff, 0xda, 0, 4, 1, 2, 9, 0xff, 0xd9]);
  const copy = jpeg.slice();
  const r = readMetadata(jpeg);
  assert.equal(r.format, "jpeg");
  assert.equal(r.found.gps, true);
  assert.equal(r.details.camera, "Apple iPhone 14");
  assert.deepEqual(jpeg, copy);
});
