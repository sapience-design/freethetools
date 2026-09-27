import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { imagesToPdf } from "../core.js";

// Tiny real images: a 2x1 PNG and a 1x1 JPEG.
const PNG = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAAEElEQVR4nGP4z8DAwMDAAAAN/gH/7yFJ5QAAAABJRU5ErkJggg==", "base64"));
const JPG = Uint8Array.from(Buffer.from("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=", "base64"));

test("one page per image, sized to the image", async () => {
  const doc = await PDFDocument.load(await imagesToPdf([{ bytes: PNG, type: "image/png" }, { bytes: JPG, type: "image/jpeg" }]));
  assert.equal(doc.getPageCount(), 2);
  assert.deepEqual(doc.getPages().map((p) => [p.getWidth(), p.getHeight()]), [[2, 1], [1, 1]]);
});

test("A4 pages turn landscape for wide images", async () => {
  const doc = await PDFDocument.load(await imagesToPdf([{ bytes: PNG, type: "image/png" }], { page: "a4", margin: "small" }));
  const p = doc.getPage(0);
  assert.ok(p.getWidth() > p.getHeight());
  assert.equal(Math.round(p.getHeight()), 595);
});

test("margins add space around fitted images", async () => {
  const doc = await PDFDocument.load(await imagesToPdf([{ bytes: JPG, type: "image/jpeg" }], { margin: "large" }));
  assert.deepEqual([doc.getPage(0).getWidth(), doc.getPage(0).getHeight()], [97, 97]);
});

test("needs at least one image", async () => {
  await assert.rejects(imagesToPdf([]), /at least one image/);
});
