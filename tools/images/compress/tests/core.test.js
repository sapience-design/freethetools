import test from "node:test";
import assert from "node:assert/strict";
import { outputType, worthIt, saving, PRESETS } from "../core.js";

test("keeps JPEG and WebP, moves PNG to WebP when possible", () => {
  assert.equal(outputType("image/jpeg", true), "image/jpeg");
  assert.equal(outputType("image/webp", true), "image/webp");
  assert.equal(outputType("image/png", true), "image/webp");
  assert.equal(outputType("image/png", false), "image/jpeg");
  assert.equal(outputType("image/jpeg", true, false), "image/webp");
});

test("only keeps results that are actually smaller", () => {
  assert.equal(worthIt(1000, 990), false);
  assert.equal(worthIt(1000, 700), true);
  assert.equal(saving(1000, 250), 75);
});

test("presets get smaller in order", () => {
  assert.ok(PRESETS.high.quality > PRESETS.balanced.quality && PRESETS.balanced.quality > PRESETS.small.quality);
  assert.ok(PRESETS.high.maxSide > PRESETS.small.maxSide);
});
