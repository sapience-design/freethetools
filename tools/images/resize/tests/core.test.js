import test from "node:test";
import assert from "node:assert/strict";
import { targetSize, checkSize } from "../core.js";

test("percent, width and height keep the proportions", () => {
  assert.deepEqual(targetSize(4000, 3000, { mode: "percent", percent: 25 }), { width: 1000, height: 750 });
  assert.deepEqual(targetSize(4000, 3000, { mode: "width", width: 1200 }), { width: 1200, height: 900 });
  assert.deepEqual(targetSize(4000, 3000, { mode: "height", height: 600 }), { width: 800, height: 600 });
});

test("box fits inside, or stretches when asked", () => {
  assert.deepEqual(targetSize(4000, 3000, { mode: "box", width: 1080, height: 1080 }), { width: 1080, height: 810 });
  assert.deepEqual(targetSize(4000, 3000, { mode: "box", width: 500, height: 500, keep: false }), { width: 500, height: 500 });
});

test("never rounds down to zero", () => {
  assert.deepEqual(targetSize(10, 1000, { mode: "width", width: 1 }), { width: 1, height: 100 });
  assert.deepEqual(targetSize(1000, 10, { mode: "percent", percent: 1 }), { width: 10, height: 1 });
});

test("explains missing values and impossible sizes", () => {
  assert.throws(() => targetSize(10, 10, { mode: "width", width: 0 }), /Enter a width/);
  assert.throws(() => checkSize({ width: 40000, height: 10 }), /larger than browsers/);
});
