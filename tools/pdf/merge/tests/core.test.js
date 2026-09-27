import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { mergePdfs, pageCount } from "../core.js";

async function makePdf(pages, width = 595) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([width, 842]);
  return doc.save();
}

test("merges pages from every file, in order", async () => {
  const a = await makePdf(2, 500);
  const b = await makePdf(3, 600);
  const out = await PDFDocument.load(await mergePdfs([a, b]));
  assert.equal(out.getPageCount(), 5);
  assert.deepEqual(out.getPages().map((p) => Math.round(p.getWidth())), [500, 500, 600, 600, 600]);
});

test("order follows the input order", async () => {
  const a = await makePdf(1, 500);
  const b = await makePdf(1, 600);
  const out = await PDFDocument.load(await mergePdfs([b, a]));
  assert.deepEqual(out.getPages().map((p) => Math.round(p.getWidth())), [600, 500]);
});

test("counts pages", async () => {
  assert.equal(await pageCount(await makePdf(4)), 4);
});

test("rejects an empty list and non-PDF input with plain messages", async () => {
  await assert.rejects(mergePdfs([]), /at least one PDF/);
  await assert.rejects(mergePdfs([new TextEncoder().encode("hello")]), /isn't a readable PDF/);
});
