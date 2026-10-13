import test from "node:test";
import assert from "node:assert/strict";
import { looksLikeSvg, svgRasterSize } from "../../../../src/lib/svg.js";

test("an SVG is recognised by its root element, after any prologue", () => {
  assert.equal(looksLikeSvg('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), true);
  assert.equal(looksLikeSvg('﻿<?xml version="1.0"?>\n<!-- logo -->\n<!DOCTYPE svg>\n<svg viewBox="0 0 10 10"/>'), true);
  assert.equal(looksLikeSvg("<html><svg></svg></html>"), false);
  assert.equal(looksLikeSvg("<?xml version=\"1.0\"?><rss></rss>"), false);
  assert.equal(looksLikeSvg("\x89PNG"), false);
});

test("a long run of comments is checked quickly", () => {
  const start = Date.now();
  looksLikeSvg("<!--".repeat(50_000));
  assert.ok(Date.now() - start < 500);
});

test("small icons are drawn at 512 px; large drawings keep their size up to 4096", () => {
  assert.deepEqual(svgRasterSize('<svg viewBox="0 0 24 24"></svg>'), { width: 512, height: 512 });
  assert.deepEqual(svgRasterSize('<svg width="1200" height="600"></svg>'), { width: 1200, height: 600 });
  assert.deepEqual(svgRasterSize('<svg width="8000" height="4000"></svg>'), { width: 4096, height: 2048 });
});
