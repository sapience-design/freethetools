import test from "node:test";
import assert from "node:assert/strict";
import { CSS_COLOURS, parseColour, toHex, toRgb, toHsl, nearestName, contrast, convertColour } from "../core.js";

const rgbOf = (s) => {
  const { r, g, b } = parseColour(s);
  return [Math.round(r), Math.round(g), Math.round(b)];
};

test("short and long HEX", () => {
  assert.deepEqual(rgbOf("#fff"), [255, 255, 255]);
  assert.deepEqual(rgbOf("#FF8800"), [255, 136, 0]);
  assert.deepEqual(rgbOf("f80"), [255, 136, 0]);
  assert.equal(parseColour("#fff").a, 1);
});

test("HEX with alpha", () => {
  const c = parseColour("#FFFFFF80");
  assert.equal(c.r, 255);
  assert.ok(Math.abs(c.a - 128 / 255) < 1e-9);
  assert.equal(toHex(c), "#ffffff80");
  assert.equal(toRgb(c), "rgba(255, 255, 255, 0.5)");
  assert.equal(parseColour("#f008").a, 0x88 / 255);
});

test("rgb() in the space and the comma form, with alpha and percentages", () => {
  const c = parseColour("rgb(255 0 0 / 50%)");
  assert.deepEqual([c.r, c.g, c.b, c.a], [255, 0, 0, 0.5]);
  assert.equal(toHex(c), "#ff000080");
  assert.deepEqual(rgbOf("rgb(255, 136, 0)"), [255, 136, 0]);
  assert.equal(parseColour("rgba(0, 0, 0, 0.25)").a, 0.25);
  assert.deepEqual(rgbOf("rgb(100% 0% 50%)"), [255, 0, 128]);
});

test("hsl() converts to exact RGB where it can", () => {
  assert.equal(toHex(parseColour("hsl(210 50% 40%)")), "#336699");
  assert.equal(toHex(parseColour("hsl(0, 100%, 50%)")), "#ff0000");
  assert.equal(toHex(parseColour("hsla(120, 100%, 25%, 1)")), "#008000");
  assert.equal(toHex(parseColour("hsl(0.5turn 100% 50%)")), "#00ffff");
  assert.equal(toHex(parseColour("hsl(-120 100% 50%)")), "#0000ff");
});

test("CSS names, in any case, and the full list", () => {
  assert.equal(toHex(parseColour("rebeccapurple")), "#663399");
  assert.equal(toHex(parseColour("  CornflowerBlue ")), "#6495ed");
  assert.equal(parseColour("transparent").a, 0);
  assert.equal(Object.keys(CSS_COLOURS).length, 148);
});

test("writes HEX, RGB and HSL, rounding to whole numbers", () => {
  const c = parseColour("hsl(210 50% 40%)");
  assert.equal(toRgb(c), "rgb(51, 102, 153)");
  assert.equal(toHsl(c), "hsl(210, 50%, 40%)");
  assert.equal(toHsl(parseColour("#ff8800")), "hsl(32, 100%, 50%)");
  assert.equal(toHsl(parseColour("rgb(127.6 0 0)")), "hsl(0, 100%, 25%)");
  assert.equal(toHex(parseColour("rgb(127.5 0 0)")), "#800000");
});

test("nearest name: exact match, and a close one", () => {
  assert.deepEqual(nearestName(parseColour("#663399")), { name: "rebeccapurple", exact: true, hex: "#663399" });
  assert.equal(nearestName(parseColour("#ff0001")).name, "red");
  assert.equal(nearestName(parseColour("#ff0001")).exact, false);
  assert.equal(nearestName(parseColour("#00ffff")).name, "cyan");
});

test("WCAG contrast against white and black", () => {
  const white = { r: 255, g: 255, b: 255 };
  const black = { r: 0, g: 0, b: 0 };
  assert.deepEqual(contrast(parseColour("#000"), white), { ratio: 21, normalText: true, largeText: true });
  assert.equal(contrast(parseColour("#fff"), black).ratio, 21);
  assert.equal(contrast(parseColour("#767676"), white).normalText, true);
  const grey = contrast(parseColour("#777"), white);
  assert.equal(grey.normalText, false);
  assert.equal(grey.largeText, true);
  assert.equal(grey.ratio, 4.47); // cut, never rounded up to look like a pass
});

test("convertColour gathers everything for one input", () => {
  const r = convertColour("hsl(210 50% 40%)");
  assert.equal(r.hex, "#336699");
  assert.equal(r.rgb, "rgb(51, 102, 153)");
  assert.equal(r.nameIsExact, false);
  assert.equal(r.contrastWithWhite.normalText, true);
  assert.equal(r.contrastWithBlack.normalText, false);
  assert.equal(r.contrastWithBlack.largeText, true);
});

test("bad input says which forms are accepted", () => {
  for (const text of ["", "   ", "#12345", "#gggggg", "rgb(1,2)", "rgb(1 2 3 4 5)", "hsl(10 50 40)", "not a colour", "rgb(1, 2, 3", "rgb(1 2 3 / 4 / 5)"]) {
    assert.throws(() => parseColour(text), /HEX.*rgb.*hsl.*CSS colour name/, text);
  }
  assert.throws(() => parseColour(42), TypeError);
});

test("out-of-range numbers are held to the limits", () => {
  assert.deepEqual(rgbOf("rgb(300 -5 0)"), [255, 0, 0]);
  assert.equal(parseColour("rgb(0 0 0 / 3)").a, 1);
});
