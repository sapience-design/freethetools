import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, degrees } from "pdf-lib";
import { rotatePdf, pagesFromRanges } from "../core.js";

async function makePdf(pages, startAngle = 0) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([400, 600]).setRotation(degrees(startAngle));
  return doc.save();
}
const angles = async (bytes) => (await PDFDocument.load(bytes)).getPages().map((p) => p.getRotation().angle);

test("rotates every page by default", async () => {
  assert.deepEqual(await angles(await rotatePdf(await makePdf(3), 90)), [90, 90, 90]);
});

test("rotates only the chosen pages", async () => {
  assert.deepEqual(await angles(await rotatePdf(await makePdf(4), 180, [2, 4])), [0, 180, 0, 180]);
});

test("adds to an existing rotation and wraps at 360", async () => {
  assert.deepEqual(await angles(await rotatePdf(await makePdf(1, 270), 180)), [90]);
});

test("rejects other angles", async () => {
  await assert.rejects(rotatePdf(await makePdf(1), 45), /90, 180 or 270/);
});

test("expands ranges to page numbers", () => {
  assert.deepEqual(pagesFromRanges([[1, 3], [5, 5]]), [1, 2, 3, 5]);
});
