import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { outputName, clampQuality, canvasQuality, isHeicBytes, DEFAULT_QUALITY } from "../core.js";

const box = (major, ...compat) => {
  const s = `ftyp${major}\0\0\0\0${compat.join("")}`;
  const b = new Uint8Array(4 + s.length);
  new DataView(b.buffer).setUint32(0, b.length);
  b.set([...s].map((c) => c.charCodeAt(0)), 4);
  return b;
};

test("output name swaps only the HEIC ending", () => {
  assert.equal(outputName("IMG_0001.HEIC", "jpg"), "IMG_0001.jpg");
  assert.equal(outputName("a.b.heif", "png"), "a.b.png");
  assert.equal(outputName("photo", "jpg"), "photo.jpg");
});

test("quality is clamped to 1-100 and falls back to the default", () => {
  assert.equal(clampQuality(150), 100);
  assert.equal(clampQuality(0), 1);
  assert.equal(clampQuality("abc"), DEFAULT_QUALITY);
  assert.equal(clampQuality(72.4), 72);
});

test("canvas quality is a fraction, and PNG has none", () => {
  assert.equal(canvasQuality("image/jpeg", 90), 0.9);
  assert.equal(canvasQuality("image/png", 90), undefined);
});

test("sniffs HEIC and HEIF brands", () => {
  for (const b of ["heic", "heix", "hevc", "mif1"]) assert.ok(isHeicBytes(box(b)), b);
  assert.ok(isHeicBytes(box("isom", "mif1")));
});

test("rejects other files", () => {
  assert.equal(isHeicBytes(box("avif")), false);
  assert.equal(isHeicBytes(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1])), false);
  assert.equal(isHeicBytes(new Uint8Array(4)), false);
});

test("the fixture is a HEIC", () => {
  assert.ok(isHeicBytes(new Uint8Array(readFileSync(new URL("./fixtures/sample.heic", import.meta.url)))));
});
