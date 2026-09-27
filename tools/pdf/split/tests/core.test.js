import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { parseRanges, everyPage, splitPdf } from "../core.js";

async function makePdf(pages) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([400 + i * 10, 600]);
  return doc.save();
}

test("parses single pages, ranges and open ranges", () => {
  assert.deepEqual(parseRanges("1-3, 5, 8-", 10), [[1, 3], [5, 5], [8, 10]]);
  assert.deepEqual(parseRanges("-2", 10), [[1, 2]]);
  assert.deepEqual(parseRanges("4 – 6", 10), [[4, 6]]);
});

test("rejects bad input with a helpful message", () => {
  assert.throws(() => parseRanges("", 5), /Enter pages/);
  assert.throws(() => parseRanges("abc", 5), /isn't a page or range/);
  assert.throws(() => parseRanges("4-9", 5), /outside pages 1 to 5/);
  assert.throws(() => parseRanges("3-2", 5), /outside/);
});

test("every page becomes its own range", () => {
  assert.deepEqual(everyPage(3), [[1, 1], [2, 2], [3, 3]]);
});

test("splits into the requested ranges with the right pages", async () => {
  const parts = await splitPdf(await makePdf(5), [[1, 2], [4, 5]]);
  assert.equal(parts.length, 2);
  const a = await PDFDocument.load(parts[0].bytes);
  const b = await PDFDocument.load(parts[1].bytes);
  assert.deepEqual(a.getPages().map((p) => p.getWidth()), [400, 410]);
  assert.deepEqual(b.getPages().map((p) => p.getWidth()), [430, 440]);
});
