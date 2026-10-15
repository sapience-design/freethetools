import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, PDFDict, PDFName, PDFString, degrees } from "pdf-lib";
import { arrangePdf, countPages, pageList } from "../../../../src/lib/pdf-pages/core.js";

// Pages of different widths, so a page can be told apart after it moves: page n is 100 + n wide.
async function makePdf(pages, o = {}) {
  const doc = await PDFDocument.create();
  for (let n = 1; n <= pages; n++) {
    const pg = doc.addPage([100 + n, 600]);
    pg.node.set(PDFName.of("FTTPage"), PDFString.of(`page ${n}`));
    if (o.angle) pg.setRotation(degrees(o.angle));
  }
  if (o.title) doc.setTitle(o.title);
  if (o.mark) doc.catalog.set(PDFName.of("FTTMark"), PDFString.of(o.mark));
  return doc.save();
}
const widths = async (bytes) => (await PDFDocument.load(bytes)).getPages().map((p) => p.getWidth() - 100);
const angles = async (bytes) => (await PDFDocument.load(bytes)).getPages().map((p) => p.getRotation().angle);
/** Every page marker anywhere in the file, referenced or not. */
async function markers(bytes) {
  const doc = await PDFDocument.load(bytes);
  return doc.context.enumerateIndirectObjects()
    .map(([, obj]) => (obj instanceof PDFDict ? obj.get(PDFName.of("FTTPage")) : undefined))
    .filter(Boolean)
    .map((s) => s.decodeText())
    .sort();
}

test("puts pages in a new order", async () => {
  const out = await arrangePdf(await makePdf(4), [3, 1, 4, 2].map((page) => ({ page })));
  assert.deepEqual(await widths(out), [3, 1, 4, 2]);
});

test("leaves pages out, and a page left out is gone from the file", async () => {
  const out = await arrangePdf(await makePdf(4), [{ page: 1 }, { page: 4 }]);
  assert.deepEqual(await widths(out), [1, 4]);
  assert.deepEqual(await markers(out), ["page 1", "page 4"]);
});

test("turns pages, adding to the turn they had", async () => {
  const out = await arrangePdf(await makePdf(3, { angle: 270 }), [{ page: 2, turn: 180 }, { page: 1 }, { page: 3, turn: 90 }]);
  assert.deepEqual(await widths(out), [2, 1, 3]);
  assert.deepEqual(await angles(out), [90, 270, 0]);
});

test("only turning keeps the document itself, so bookmarks and forms stay", async () => {
  const out = await arrangePdf(await makePdf(2, { mark: "kept" }), [{ page: 1, turn: 90 }, { page: 2 }]);
  const doc = await PDFDocument.load(out);
  assert.equal(doc.catalog.get(PDFName.of("FTTMark"))?.decodeText(), "kept");
  assert.deepEqual(await angles(out), [90, 0]);
});

test("a new PDF keeps the title", async () => {
  const out = await arrangePdf(await makePdf(2, { title: "Annual report" }), [{ page: 2 }]);
  assert.equal((await PDFDocument.load(out)).getTitle(), "Annual report");
});

test("says plainly what is wrong", async () => {
  const pdf = await makePdf(3);
  await assert.rejects(arrangePdf(pdf, []), /Keep at least one page/);
  await assert.rejects(arrangePdf(pdf, [{ page: 4 }]), /no page 4\. This PDF has pages 1 to 3/);
  await assert.rejects(arrangePdf(pdf, [{ page: 2 }, { page: 2 }]), /Page 2 is listed twice/);
  await assert.rejects(arrangePdf(pdf, [{ page: 1, turn: 45 }]), /90, 180 or 270/);
  await assert.rejects(arrangePdf(new TextEncoder().encode("not a pdf"), [{ page: 1 }]), /isn't a readable PDF/);
});

test("reads page lists in the order written", async () => {
  assert.deepEqual(pageList("3, 1-2, 5-", 6), [3, 1, 2, 5, 6]);
  assert.deepEqual(pageList("-2", 4), [1, 2]);
  assert.throws(() => pageList("2-9", 4), /outside pages 1 to 4/);
  assert.equal(await countPages(await makePdf(5)), 5);
});
