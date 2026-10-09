// Search quality: people should find a tool with the words they'd naturally type.
import test from "node:test";
import assert from "node:assert/strict";
import { makeSearch } from "../src/lib/search.js";
import { expand } from "../src/data/synonyms.js";

const tool = (n, c, k, w) => ({ n, c, u: `/${n}`, k: expand(`${n} ${k}`), ...(w ? { w: 1 } : {}) });
const search = makeSearch([
  tool("Merge PDFs", "PDF", "merge combine pdf one file"),
  tool("Compress PDF", "PDF", "compress reduce size smaller pdf"),
  tool("Split PDF", "PDF", "split extract pages pdf"),
  tool("Remove Photo Location", "Images", "remove exif gps metadata photo"),
  tool("QR Code Maker", "Developer", "qr code link wifi"),
  tool("HEIC to JPG", "Images", "convert iphone photos", true),
  tool("Convert Image Format", "Images", "png jpg webp convert"),
]);
const top = (q) => search(q)[0]?.n;

test("finds tools by their own name", () => {
  assert.equal(top("merge"), "Merge PDFs");
  assert.equal(top("qr"), "QR Code Maker");
});

test("finds tools by words people use instead", () => {
  assert.equal(top("combine pdf"), "Merge PDFs");
  assert.equal(top("shrink"), "Compress PDF");
  assert.equal(top("gps"), "Remove Photo Location");
});

test("tolerates typos and partial words", () => {
  assert.equal(top("compres"), "Compress PDF");
  assert.equal(top("mereg"), "Merge PDFs");
  assert.equal(top("loca"), "Remove Photo Location");
});

test("puts tools you can use before planned ones", () => {
  const r = search("convert");
  assert.equal(r[0].n, "Convert Image Format");
  assert.ok(r.findIndex((x) => x.w) > 0);
});

test("empty query finds nothing", () => {
  assert.deepEqual(search("   "), []);
});

test("filler words don't match everything", () => {
  assert.deepEqual(search("zzzz nothing"), []);
  assert.equal(top("merge the pdfs"), "Merge PDFs");
});

test("a half-typed word beats a near miss in a task name", () => {
  const s = makeSearch([
    { n: "Text Diff", t: "Compare two texts", c: "Text", u: "/diff", k: "diff compare" },
    { n: "Compress PDF", t: "Make a PDF smaller", c: "PDF", u: "/compress", k: "compress smaller" },
  ]);
  assert.equal(s("compres")[0].n, "Compress PDF");
  assert.equal(s("make a pdf smaller")[0].n, "Compress PDF");
});
