import test from "node:test";
import assert from "node:assert/strict";
import { renameTo, qualityFor, FORMATS } from "../core.js";

test("replaces a known image extension, keeps other dots", () => {
  assert.equal(renameTo("holiday.png", "jpg"), "holiday.jpg");
  assert.equal(renameTo("scan.final.JPEG", "webp"), "scan.final.webp");
  assert.equal(renameTo("notes", "png"), "notes.png");
});

test("quality only applies to lossy formats", () => {
  assert.equal(qualityFor("image/png"), undefined);
  assert.ok(qualityFor("image/jpeg") > 0.8);
});

test("offers the four formats", () => {
  assert.deepEqual(FORMATS.map((f) => f.label), ["JPG", "PNG", "WebP", "AVIF"]);
});
