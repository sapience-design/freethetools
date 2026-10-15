import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { checkArgs } from "../../../../src/agent/contract.js";
import agent from "../agent.js";

const [tool] = agent;
// Page n is 100 + n points wide, so a page can be told apart after it moves.
async function pdf(pages = 5) {
  const doc = await PDFDocument.create();
  for (let n = 1; n <= pages; n++) doc.addPage([100 + n, 600]);
  return { name: "report.pdf", type: "application/pdf", bytes: await doc.save() };
}
const widths = async (bytes) => (await PDFDocument.load(bytes)).getPages().map((p) => p.getWidth() - 100);

test("arrange_pdf_pages is well formed", () => {
  assert.equal(tool.name, "arrange_pdf_pages");
  assert.deepEqual(checkArgs(tool.input, { file: "a.pdf", pages: "2, 1" }), []);
  assert.deepEqual(checkArgs(tool.input, { file: "a.pdf", delete: "3" }), []);
  assert.ok(checkArgs(tool.input, { file: "a.pdf", turn: 90 }).length > 0);
});

test("puts pages in a new order and deletes the ones left out", async () => {
  const r = await tool.run({ file: await pdf(5), pages: "3, 1-2" }, {});
  assert.deepEqual(await widths(r.files[0].bytes), [3, 1, 2]);
  assert.equal(r.files[0].name, "report-edited.pdf");
  assert.deepEqual(r.data, { pages: [3, 1, 2], deleted: 2, total: 5 });
  assert.match(r.summary, /3-page PDF from 5 pages; 2 deleted/);
});

test("deletes pages and keeps the others in order", async () => {
  const r = await tool.run({ file: await pdf(5), delete: "2, 4-" }, {});
  assert.deepEqual(await widths(r.files[0].bytes), [1, 3]);
});

test("says plainly what is wrong", async () => {
  const f = await pdf(3);
  await assert.rejects(tool.run({ file: f }, {}), /Give pages \(the new order\) or delete/);
  await assert.rejects(tool.run({ file: f, delete: "1-3" }, {}), /Keep at least one page/);
  await assert.rejects(tool.run({ file: f, pages: "1, 1" }, {}), /listed twice/);
  await assert.rejects(tool.run({ file: f, pages: "5" }, {}), /outside pages 1 to 3/);
  await assert.rejects(tool.run({ file: { ...f, type: "text/plain" }, pages: "1" }, {}), /isn't a PDF/);
});
