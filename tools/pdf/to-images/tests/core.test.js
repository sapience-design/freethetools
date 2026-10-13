import test from "node:test";
import assert from "node:assert/strict";
import { scaleFor, safeScale, pageFileName, FORMATS, formatFor, qualityFor } from "../core.js";

test("PNG, JPG and WebP are offered, PNG first", () => {
  assert.deepEqual(FORMATS.map((f) => f.ext), ["png", "jpg", "webp"]);
  assert.equal(formatFor("webp").type, "image/webp");
  assert.equal(formatFor("jpg").type, "image/jpeg");
  assert.equal(formatFor("tiff").ext, "png", "an unknown type falls back to PNG");
});

test("PNG stays lossless; JPG and WebP get a quality", () => {
  assert.equal(qualityFor("image/png"), undefined);
  assert.equal(qualityFor("image/jpeg"), 0.9);
  assert.equal(qualityFor("image/webp"), 0.9);
});

test("scale follows DPI", () => {
  assert.equal(scaleFor(72), 1);
  assert.equal(scaleFor(300), 300 / 72);
});

test("very large pages are capped at 8000 px", () => {
  const s = safeScale(2384, 3370, 300); // A0 at 300 dpi would be ~14000 px
  assert.ok(Math.round(3370 * s) <= 8000);
  assert.equal(safeScale(595, 842, 150), 150 / 72);
});

test("file names are padded so they sort in page order", () => {
  assert.equal(pageFileName("report.pdf", 3, 12, "png"), "report_page-03.png");
  assert.equal(pageFileName("book.PDF", 7, 150, "jpg"), "book_page-007.jpg");
  assert.equal(pageFileName("slides.pdf", 2, 9, "webp"), "slides_page-02.webp");
});
