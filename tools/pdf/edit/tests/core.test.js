import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PDFDocument, PDFName, degrees } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  applyMarks, boundsOf, cleanMark, createHistory, describeMark, isLatinText, moveMark, oddCharacters, pageGeometry,
  pageSizes, pdfToView, scaleMark, smoothPath, viewMatrix, viewToPdf, wrapText,
} from "../../../../src/lib/pdf-edit/core.js";

const SAMPLE = new Uint8Array(readFileSync("tools/pdf/compress/tests/fixtures/sample.pdf"));
const ROBOTO = new Uint8Array(readFileSync("node_modules/roboto-fontface/fonts/roboto/Roboto-Regular.woff"));
const PNG = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAAEElEQVR4nGP4z8DAwMDAAAAN/gH/7yFJ5QAAAABJRU5ErkJggg==", "base64"));

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} is not ${b}`);
const nearAll = (a, b) => a.forEach((v, i) => near(v, b[i]));

/** A one-page PDF with a chosen size, crop box and rotation. */
async function makePdf({ size = [400, 600], crop, media, rotate = 0 } = {}) {
  const doc = await PDFDocument.create();
  const p = doc.addPage(size);
  const box = ([a, b, c, d]) => [a, b, c - a, d - b]; // [x0, y0, x1, y1] to pdf-lib's x, y, width, height
  if (media) p.setMediaBox(...box(media));
  if (crop) p.setCropBox(...box(crop));
  if (rotate) p.setRotation(degrees(rotate));
  return doc.save();
}
const geom = async (bytes) => pageGeometry((await PDFDocument.load(bytes)).getPage(0));

/** Text of every page, read by pdf.js, with positions. */
async function textOf(bytes) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, verbosity: 0 }).promise;
  const pages = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const items = (await (await doc.getPage(n)).getTextContent()).items;
    pages.push(items.map((i) => i.str).join(" ").replace(/\s+/g, " ").trim());
  }
  return pages;
}

/** Everything a page's content streams say, as text, to look for drawing operators. */
async function content(bytes, pageNo = 1) {
  const doc = await PDFDocument.load(bytes);
  const page = doc.getPage(pageNo - 1);
  const refs = page.node.Contents();
  const streams = refs.asArray ? refs.asArray().map((r) => doc.context.lookup(r)) : [refs];
  const { decodePDFRawStream } = await import("pdf-lib");
  return streams.map((s) => Buffer.from(decodePDFRawStream(s).decode()).toString("latin1")).join("\n");
}

test("a plain page: the view's top-left is the PDF's top-left", async () => {
  const g = await geom(await makePdf());
  assert.deepEqual([g.width, g.height, g.rotate], [400, 600, 0]);
  nearAll(viewToPdf(g, 0, 0), [0, 600]);
  nearAll(viewToPdf(g, 400, 600), [400, 0]);
  nearAll(viewToPdf(g, 100, 50), [100, 550]);
});

test("a crop box moves the origin and shrinks the page", async () => {
  const g = await geom(await makePdf({ crop: [50, 100, 350, 500] }));
  assert.deepEqual([g.width, g.height], [300, 400]);
  nearAll(viewToPdf(g, 0, 0), [50, 500]);
  nearAll(viewToPdf(g, 300, 400), [350, 100]);
});

test("a crop box bigger than the media box is cut to the media box", async () => {
  const g = await geom(await makePdf({ size: [400, 600], crop: [-50, -50, 500, 700] }));
  assert.deepEqual([g.width, g.height], [400, 600]);
});

test("a media box that does not start at zero", async () => {
  const g = await geom(await makePdf({ media: [100, 200, 400, 600] }));
  assert.deepEqual([g.width, g.height], [300, 400]);
  nearAll(viewToPdf(g, 0, 0), [100, 600]);
});

test("rotated pages: each corner of the view lands on the right corner of the PDF", async () => {
  // The page is 400 wide and 600 tall in the file. Turned 90 degrees clockwise, its top edge is on the right.
  const r90 = await geom(await makePdf({ rotate: 90 }));
  assert.deepEqual([r90.width, r90.height], [600, 400]);
  nearAll(viewToPdf(r90, 0, 0), [0, 0]); // view top-left is the file's bottom-left
  nearAll(viewToPdf(r90, 600, 0), [0, 600]); // view top-right is the file's top-left
  nearAll(viewToPdf(r90, 600, 400), [400, 600]);
  nearAll(viewToPdf(r90, 0, 400), [400, 0]);

  const r180 = await geom(await makePdf({ rotate: 180 }));
  assert.deepEqual([r180.width, r180.height], [400, 600]);
  nearAll(viewToPdf(r180, 0, 0), [400, 0]);
  nearAll(viewToPdf(r180, 400, 600), [0, 600]);

  const r270 = await geom(await makePdf({ rotate: 270 }));
  assert.deepEqual([r270.width, r270.height], [600, 400]);
  nearAll(viewToPdf(r270, 0, 0), [400, 600]);
  nearAll(viewToPdf(r270, 600, 0), [400, 0]);
  nearAll(viewToPdf(r270, 0, 400), [0, 600]);
});

test("a rotated and cropped page with an offset", async () => {
  const g = await geom(await makePdf({ rotate: 90, crop: [20, 30, 220, 330] })); // 200 x 300 in the file
  assert.deepEqual([g.width, g.height], [300, 200]);
  nearAll(viewToPdf(g, 0, 0), [20, 30]);
  nearAll(viewToPdf(g, 300, 200), [220, 330]);
});

test("viewToPdf and pdfToView undo each other on every rotation", async () => {
  for (const rotate of [0, 90, 180, 270]) {
    const g = await geom(await makePdf({ rotate, crop: [10, 20, 310, 420], media: [0, 0, 500, 700] }));
    for (const [x, y] of [[0, 0], [12.5, 99], [g.width, g.height], [g.width / 3, g.height / 7]]) {
      nearAll(pdfToView(g, ...viewToPdf(g, x, y)), [x, y]);
    }
    // The matrix and viewToPdf agree.
    const [a, b, c, d, e, f] = viewMatrix(g);
    nearAll(viewToPdf(g, 30, 40), [a * 30 + c * (g.height - 40) + e, b * 30 + d * (g.height - 40) + f]);
  }
});

test("the page size matches what pdf.js shows, for crop boxes and every rotation", async () => {
  for (const rotate of [0, 90, 180, 270]) {
    const bytes = await makePdf({ rotate, crop: [10, 20, 310, 420], media: [0, 0, 500, 700] });
    const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, verbosity: 0 }).promise;
    const vp = (await doc.getPage(1)).getViewport({ scale: 1 });
    const g = await geom(bytes);
    near(vp.width, g.width);
    near(vp.height, g.height);
    // And a point maps to the same place in pdf.js's own conversion (view to PDF).
    const [X, Y] = viewToPdf(g, 41, 67);
    const [px, py] = vp.convertToPdfPoint(41, 67);
    near(X, px, 1e-4);
    near(Y, py, 1e-4);
  }
});

test("pageSizes lists each page as seen", async () => {
  assert.deepEqual(await pageSizes(await makePdf({ rotate: 90 })), [{ width: 600, height: 400, rotate: 90 }]);
});

test("text: found by a text reader, on the page it was put on, and the other pages are untouched", async () => {
  const before = await textOf(SAMPLE);
  const out = await applyMarks(SAMPLE, [{ type: "text", page: 2, x: 72, y: 100, text: "Signed by Ada", size: 18, color: "#cc0000" }]);
  const after = await textOf(out);
  assert.equal(after.length, 3);
  assert.ok(after[1].includes("Signed by Ada"));
  assert.ok(!after[0].includes("Signed by Ada") && !after[2].includes("Signed by Ada"));
  assert.equal(after[0], before[0]);
  assert.equal(after[2], before[2]);
  assert.ok(after[1].includes(before[1].slice(0, 20)), "the original text is still there");
  const ops = await content(out, 2);
  assert.match(ops, /0\.8 0 0 rg/); // #cc0000
  assert.ok((await PDFDocument.load(out, { updateMetadata: false })).getProducer().includes("Free the Tools"));
});

test("Norwegian letters and accents are written with the built-in font", async () => {
  const out = await applyMarks(SAMPLE, [{ type: "text", page: 1, x: 10, y: 10, text: "Blåbærsyltetøy, café, Größe", size: 12 }]);
  assert.ok((await textOf(out))[0].includes("Blåbærsyltetøy, café, Größe"));
});

test("several lines of text sit one line apart", async () => {
  const out = await applyMarks(SAMPLE, [{ type: "text", page: 1, x: 10, y: 10, text: "one\n\nthree", size: 20 }]);
  assert.ok((await textOf(out))[0].includes("one three"));
});

test("Cyrillic and Greek need the extra font, and then they are real text", async () => {
  const marks = [{ type: "text", page: 1, x: 10, y: 10, text: "Привет, мир Ωμέγα", size: 14 }];
  await assert.rejects(applyMarks(SAMPLE, marks), /can't be written/);
  await assert.rejects(applyMarks(SAMPLE, marks, { fontkit }), /can't be written/);
  const out = await applyMarks(SAMPLE, marks, { fontkit, unicodeFont: ROBOTO });
  assert.ok((await textOf(out))[0].includes("Привет, мир Ωμέγα"));
  // Only the letters used are kept in the file.
  assert.ok(out.length < SAMPLE.length + 60_000, `${out.length - SAMPLE.length} bytes added`);
});

test("a box: border, fill with opacity, and text wrapped inside", async () => {
  const out = await applyMarks(SAMPLE, [{
    type: "rect", page: 1, x: 50, y: 50, w: 120, h: 80, color: "#0000ff", strokeWidth: 3, fill: "#ffff00", fillOpacity: 0.5,
    text: "This sentence is much longer than one line of the box", size: 12, textColor: "#000000",
  }]);
  const ops = await content(out);
  assert.match(ops, /0 0 1 RG/); // blue border
  assert.match(ops, /\b3 w\b/);
  assert.match(ops, /1 1 0 rg/); // yellow fill
  const doc = await PDFDocument.load(out);
  const gs = doc.getPage(0).node.Resources().lookup(doc.context.obj("ExtGState"));
  const states = [...gs.entries()].map(([, v]) => doc.context.lookup(v));
  assert.ok(states.some((s) => s.get(doc.context.obj("ca"))?.asNumber() === 0.5), "fill opacity 0.5 is in the file");
  const t = (await textOf(out))[0];
  assert.ok(t.includes("This sentence") && t.includes("of the box"));
});

test("an empty box draws only the box", async () => {
  const out = await applyMarks(SAMPLE, [{ type: "rect", page: 1, x: 10, y: 10, w: 50, h: 50, color: "#ff0000", strokeWidth: 1, text: "" }]);
  assert.match(await content(out), /1 0 0 RG/);
  assert.equal((await textOf(out))[0], (await textOf(SAMPLE))[0]);
});

test("a highlight is see-through and multiplies, so the text under it stays readable", async () => {
  const out = await applyMarks(SAMPLE, [{ type: "highlight", page: 3, x: 72, y: 72, w: 200, h: 14, color: "#ffe27a" }]);
  const doc = await PDFDocument.load(out);
  const gs = doc.getPage(2).node.Resources().lookup(doc.context.obj("ExtGState"));
  const states = [...gs.entries()].map(([, v]) => doc.context.lookup(v));
  const s = states.find((x) => x.get(doc.context.obj("BM")));
  assert.equal(s.get(doc.context.obj("BM")).toString(), "/Multiply");
  assert.equal(s.get(doc.context.obj("ca")).asNumber(), 0.5);
  assert.equal((await textOf(out))[2], (await textOf(SAMPLE))[2]);
});

test("a drawing is a stroked path, with no fill", async () => {
  const out = await applyMarks(SAMPLE, [{ type: "path", page: 1, points: [[10, 10], [30, 40], [60, 20], [90, 70]], color: "#00aa00", width: 4 }]);
  const ops = await content(out);
  assert.match(ops, /0 0\.66\d* 0 RG/);
  assert.match(ops, /\b4 w\b/);
  assert.match(ops, /^S$/m); // stroked...
  assert.match(ops, / v$/m); // ...with curves
  assert.doesNotMatch(ops, /^(f|f\*|B|b)$/m); // ...and not filled
});

test("a single click of the pen leaves a dot", async () => {
  assert.match(smoothPath([[5, 5]]), /^M 5 5 L 5\.01 5$/);
  await applyMarks(SAMPLE, [{ type: "path", page: 1, points: [[5, 5]], color: "#000000", width: 3 }]);
});

test("a picture: PNG and its aspect ratio", async () => {
  const out = await applyMarks(SAMPLE, [{ type: "image", page: 1, x: 100, y: 100, w: 80, bytes: PNG, mime: "image/png" }]);
  const ops = await content(out);
  assert.match(ops, /\bDo\b/);
  // The sample picture is 2 x 1, so 80 wide is 40 tall. The page is A4 (595 x 842): the picture's
  // lower-left corner is at x = 100 and y = 842 - 100 - 40.
  const m = ops.match(/1 0 0 1 ([\d.-]+) ([\d.-]+) cm\s+1 0 0 1 0 0 cm\s+([\d.]+) 0 0 ([\d.]+) 0 0 cm/);
  assert.ok(m, "an image placement was found");
  const g = await geom(SAMPLE);
  near(+m[3], 80, 1e-3);
  near(+m[4], 40, 1e-3);
  near(+m[1], g.x0 + 100, 1e-3);
  near(+m[2], g.y1 - 100 - 40, 1e-3);
});

test("marks on a rotated page are turned with it and still read as text", async () => {
  const doc = await PDFDocument.create();
  doc.addPage([400, 600]).setRotation(degrees(90));
  const bytes = await doc.save();
  const out = await applyMarks(bytes, [{ type: "text", page: 1, x: 20, y: 30, text: "Turned", size: 20 }]);
  assert.ok((await textOf(out))[0].includes("Turned"));
  // pdf.js puts the text at the view position we asked for: the top-left of the text box is (20, 30).
  const pdfDoc = await pdfjs.getDocument({ data: new Uint8Array(out), isEvalSupported: false, verbosity: 0 }).promise;
  const page = await pdfDoc.getPage(1);
  const vp = page.getViewport({ scale: 1 });
  const item = (await page.getTextContent()).items.find((i) => i.str.includes("Turned"));
  const [vx, vy] = vp.convertToViewportPoint(item.transform[4], item.transform[5]); // baseline start in the view
  near(vx, 20, 0.5);
  near(vy, 30 + 20 * 0.94, 0.5);
});

test("marks on a cropped page land inside the visible part", async () => {
  const bytes = await makePdf({ crop: [50, 100, 350, 500] });
  const out = await applyMarks(bytes, [{ type: "text", page: 1, x: 10, y: 10, text: "Corner", size: 20 }]);
  const pdfDoc = await pdfjs.getDocument({ data: new Uint8Array(out), isEvalSupported: false, verbosity: 0 }).promise;
  const page = await pdfDoc.getPage(1);
  const vp = page.getViewport({ scale: 1 });
  const item = (await page.getTextContent()).items.find((i) => i.str.includes("Corner"));
  const [vx, vy] = vp.convertToViewportPoint(item.transform[4], item.transform[5]);
  near(vx, 10, 0.5);
  near(vy, 10 + 20 * 0.94, 0.5);
});

test("a mark on a page that is not there is refused in plain words", async () => {
  await assert.rejects(applyMarks(SAMPLE, [{ type: "text", page: 9, x: 1, y: 1, text: "x" }]), /Mark 1 is on page 9, but this PDF has 3 pages/);
  await assert.rejects(applyMarks(SAMPLE, [{ type: "rect", page: 1, x: 1, y: 1, w: 0, h: 5 }]), /width and a height above zero/);
  await assert.rejects(applyMarks(SAMPLE, [{ type: "star", page: 1 }]), /unknown type/);
  await assert.rejects(applyMarks(new Uint8Array([1, 2, 3]), []), /readable PDF/);
});

test("no marks gives back a valid PDF with the same pages", async () => {
  const out = await applyMarks(SAMPLE, []);
  assert.equal((await PDFDocument.load(out)).getPageCount(), 3);
});

test("marks keep their order on a page, and a picture used twice is stored once", async () => {
  const marks = [1, 2].map((i) => ({ type: "image", page: i, x: 10, y: 10, w: 20, bytes: PNG, mime: "image/png" }));
  const out = await applyMarks(SAMPLE, marks);
  const doc = await PDFDocument.load(out);
  const pictures = (n) => doc.getPage(n).node.Resources().lookup(PDFName.of("XObject")).entries().filter(([name]) => /^\/Image-/.test(name.toString())).map(([, ref]) => ref.toString());
  const one = pictures(0), two = pictures(1);
  assert.equal(one.length, 1);
  assert.deepEqual(one, two, "both pages point at the same stored picture");
});

test("cleanMark fills in defaults and bounds the numbers", () => {
  const t = cleanMark({ type: "text", page: 1, x: 1, y: 2, text: "a", size: 9999, color: "red" });
  assert.deepEqual([t.size, t.color], [200, "#000000"]);
  const r = cleanMark({ type: "rect", page: 1, x: 0, y: 0, w: 5, h: 5, fillOpacity: 4 });
  assert.deepEqual([r.fillOpacity, r.fill, r.strokeWidth], [1, null, 2]);
  assert.throws(() => cleanMark({ type: "text", page: 1, x: NaN, y: 0 }), /x should be a number/);
});

test("isLatinText knows what the built-in font can write", () => {
  assert.ok(isLatinText("Blåbær æøå ÆØÅ ß é ñ € “quoted” – dash\nnext"));
  assert.ok(!isLatinText("Привет"));
  assert.ok(!isLatinText("日本語"));
  assert.deepEqual(oddCharacters("aЖбЖ→"), ["Ж", "б", "→"]);
});

test("wrapText breaks at spaces, keeps new lines and cuts a word that is too long", () => {
  const w = (s) => s.length * 10;
  assert.deepEqual(wrapText("aaa bbb ccc", 70, w), ["aaa bbb", "ccc"]);
  assert.deepEqual(wrapText("aaa\n\nbbb", 100, w), ["aaa", "", "bbb"]);
  assert.deepEqual(wrapText("abcdefghij", 40, w), ["abcd", "efgh", "ij"]);
  assert.deepEqual(wrapText("", 40, w), [""]);
  assert.deepEqual(wrapText("aa bbbbbbbbbbb", 50, w), ["aa", "bbbbb", "bbbbb", "b"]);
});

test("moving, scaling and measuring marks", () => {
  const rect = { type: "rect", x: 10, y: 20, w: 100, h: 40 };
  assert.deepEqual(moveMark(rect, 5, -5), { ...rect, x: 15, y: 15 });
  assert.deepEqual(scaleMark(rect, 2), { ...rect, w: 200, h: 80 });
  const path = { type: "path", points: [[10, 10], [30, 50]], width: 2 };
  assert.deepEqual(moveMark(path, 1, 1).points, [[11, 11], [31, 51]]);
  assert.deepEqual(boundsOf(path), { x: 9, y: 9, w: 22, h: 42 });
  assert.equal(scaleMark({ type: "text", size: 10 }, 1.5).size, 15);
  assert.equal(scaleMark({ type: "text", size: 10 }, 0.001).size, 4);
  const text = { type: "text", x: 5, y: 5, size: 10, text: "ab\nabcd" };
  assert.deepEqual(boundsOf(text, (s) => s.length * 6), { x: 5, y: 5, w: 24, h: 24 });
});

test("describeMark names each mark in words", () => {
  assert.equal(describeMark({ type: "text", page: 2, text: "Hello" }), "Text “Hello”, page 2");
  assert.equal(describeMark({ type: "rect", page: 1, text: "" }), "Box, page 1");
  assert.equal(describeMark({ type: "image", page: 3, label: "Signature" }), "Signature, page 3");
  assert.match(describeMark({ type: "text", page: 1, text: "x".repeat(100) }), /…/);
});

test("undo and redo step through changes, and a new change ends the redo trail", () => {
  const h = createHistory([]);
  assert.ok(!h.canUndo && !h.canRedo);
  h.push(["a"]);
  h.push(["a", "b"]);
  assert.deepEqual(h.undo(), ["a"]);
  assert.ok(h.canRedo);
  assert.deepEqual(h.redo(), ["a", "b"]);
  h.undo();
  h.push(["a", "c"]);
  assert.ok(!h.canRedo);
  assert.deepEqual(h.undo(), ["a"]);
  assert.deepEqual(h.undo(), []);
  assert.deepEqual(h.undo(), []); // nothing more to undo
  assert.deepEqual(h.redo(), ["a"]);
});

test("pushes with the same key count as one step, and any other change ends the run", () => {
  const h = createHistory([0]);
  h.push([1], "move:1");
  h.push([2], "move:1");
  h.push([3], "move:1");
  assert.deepEqual(h.undo(), [0]);
  h.redo();
  h.push([4]);
  h.push([5], "move:1");
  assert.deepEqual(h.undo(), [4]);
  assert.deepEqual(h.undo(), [3]);
  h.reset([9]);
  assert.ok(!h.canUndo);
  assert.deepEqual(h.state, [9]);
});

test("the history is limited", () => {
  const h = createHistory(0, 3);
  for (let i = 1; i <= 10; i++) h.push(i);
  let steps = 0;
  while (h.canUndo) { h.undo(); steps++; }
  assert.equal(steps, 3);
});
