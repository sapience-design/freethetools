import test from "node:test";
import assert from "node:assert/strict";
import { scaleFor, safeScale, pageFileName } from "../core.js";

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
});
