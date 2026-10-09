// Paper sizes shown next to PDFs: "A4", "Letter landscape", or millimetres.
import test from "node:test";
import assert from "node:assert/strict";
import { paperName, paperOf } from "../src/lib/paper.js";

test("names common paper sizes in either orientation", () => {
  assert.equal(paperName(595.28, 841.89), "A4");
  assert.equal(paperName(841.89, 595.28), "A4 landscape");
  assert.equal(paperName(612, 792), "Letter");
  assert.equal(paperName(612, 1008), "Legal");
});

test("anything else in millimetres", () => {
  assert.equal(paperName(300, 200), "106 × 71 mm");
});

test("one name for a document, or mixed sizes", () => {
  assert.equal(paperOf([{ width: 595, height: 842 }, { width: 596, height: 841 }]), "A4");
  assert.equal(paperOf([{ width: 595, height: 842 }, { width: 612, height: 792 }]), "mixed page sizes");
  assert.equal(paperOf([]), "");
});
