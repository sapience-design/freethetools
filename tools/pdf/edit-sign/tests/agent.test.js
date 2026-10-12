import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { checkArgs } from "../../../../src/agent/contract.js";
import agent from "../agent.js";

const [tool] = agent;
const SAMPLE = new Uint8Array(readFileSync("tools/pdf/compress/tests/fixtures/sample.pdf"));
const PNG = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAAEElEQVR4nGP4z8DAwMDAAAAN/gH/7yFJ5QAAAABJRU5ErkJggg==", "base64"));
const pdf = { name: "form.pdf", type: "application/pdf", bytes: SAMPLE };

const pageText = async (bytes, n) => {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, verbosity: 0 }).promise;
  return (await (await doc.getPage(n)).getTextContent()).items.map((i) => i.str).join(" ");
};

test("add_to_pdf is well formed", () => {
  assert.equal(tool.name, "add_to_pdf");
  assert.deepEqual(checkArgs(tool.input, { file: "a.pdf", marks: [{ type: "text", page: 1, x: 1, y: 2, text: "Hi" }] }), []);
  assert.match(checkArgs(tool.input, { file: "a.pdf", marks: [{ type: "star", page: 1, x: 1, y: 2 }] })[0], /one of: text, box, highlight/);
  assert.match(checkArgs(tool.input, { file: "a.pdf", marks: [{ type: "text", page: 0, x: 1, y: 2 }] })[0], /at least 1/);
});

test("writes text, a box with text, a highlight and a picture, and names the copy", async () => {
  const r = await tool.run({
    file: pdf,
    marks: [
      { type: "text", page: 1, x: 72, y: 100, text: "Agreed, Ada Lovelace", color: "#0000ff" },
      { type: "box", page: 2, x: 50, y: 50, width: 200, height: 60, text: "Approved", borderWidth: 1, fill: "#ffff00", fillOpacity: 0.3 },
      { type: "highlight", page: 3, x: 72, y: 72, width: 100, height: 12 },
    ],
    image: { name: "sig.png", type: "image/png", bytes: PNG },
    imageAt: { page: 3, x: 300, y: 600, width: 120 },
  }, {});
  assert.equal(r.files[0].name, "form-signed.pdf");
  assert.equal(r.data.added, 4);
  assert.match(r.summary, /Added 4 items to a 3-page PDF/);
  assert.ok((await pageText(r.files[0].bytes, 1)).includes("Agreed, Ada Lovelace"));
  assert.ok((await pageText(r.files[0].bytes, 2)).includes("Approved"));
  assert.equal((await PDFDocument.load(r.files[0].bytes)).getPageCount(), 3);
});

test("says plainly what is wrong", async () => {
  await assert.rejects(tool.run({ file: pdf }, {}), /at least one mark/);
  await assert.rejects(tool.run({ file: pdf, image: { name: "s.png", type: "image/png", bytes: PNG } }, {}), /imageAt/);
  await assert.rejects(tool.run({ file: { ...pdf, type: "text/plain" }, marks: [{ type: "text", page: 1, x: 1, y: 1, text: "x" }] }, {}), /isn't a PDF/);
  await assert.rejects(tool.run({ file: pdf, marks: [{ type: "text", page: 7, x: 1, y: 1, text: "x" }] }, {}), /page 7, but this PDF has 3 pages/);
  await assert.rejects(tool.run({ file: pdf, marks: [{ type: "text", page: 1, x: 1, y: 1, text: "Привет" }] }, {}), /can't be written/);
  await assert.rejects(tool.run({ file: pdf, image: { name: "s.txt", type: "text/plain", bytes: new Uint8Array([1, 2, 3]) }, imageAt: { page: 1, x: 1, y: 1, width: 5 } }, {}), /isn't a PNG or JPG/);
});
