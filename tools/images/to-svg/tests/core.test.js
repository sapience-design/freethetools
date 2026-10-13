import test from "node:test";
import assert from "node:assert/strict";
import { PRESETS, DETAIL, MAX_SIDE, clampColours, traceOptions, traceSize, svgName, isSafeSvg } from "../core.js";

test("offers three presets, logo first", () => {
  assert.deepEqual(Object.keys(PRESETS), ["logo", "illustration", "bw"]);
  assert.equal(PRESETS.bw.colours, 2);
  assert.ok(PRESETS.logo.colours < PRESETS.illustration.colours);
});

test("logo: few colours, medium detail", () => {
  const o = traceOptions({ preset: "logo" });
  assert.equal(o.numberofcolors, 8);
  assert.equal(o.ltres, DETAIL.medium.ltres);
  assert.equal(o.pathomit, DETAIL.medium.pathomit);
  assert.equal(o.desc, false);
  assert.equal(o.pal, undefined);
});

test("illustration: more colours and more detail than a logo", () => {
  const logo = traceOptions({ preset: "logo" });
  const art = traceOptions({ preset: "illustration" });
  assert.ok(art.numberofcolors > logo.numberofcolors);
  assert.ok(art.ltres < logo.ltres);
  assert.ok(art.pathomit < logo.pathomit);
});

test("black and white fixes the palette to black and white, whatever colours say", () => {
  const o = traceOptions({ preset: "bw", colours: 20 });
  assert.equal(o.numberofcolors, 2);
  assert.deepEqual(o.pal, [{ r: 0, g: 0, b: 0, a: 255 }, { r: 255, g: 255, b: 255, a: 255 }]);
});

test("colours and detail override the preset", () => {
  const o = traceOptions({ preset: "logo", colours: 12, detail: "low" });
  assert.equal(o.numberofcolors, 12);
  assert.equal(o.ltres, DETAIL.low.ltres);
  assert.equal(o.pathomit, DETAIL.low.pathomit);
});

test("an unknown preset or detail falls back to the logo defaults", () => {
  assert.deepEqual(traceOptions({ preset: "nope", detail: "nope" }), traceOptions({ preset: "logo" }));
});

test("colours stay between 2 and 32 whole numbers", () => {
  assert.equal(clampColours(1), 2);
  assert.equal(clampColours(99), 32);
  assert.equal(clampColours("7.6"), 8);
  assert.equal(clampColours("abc", 5), 5);
  assert.equal(clampColours(""), 2); // an empty box reads as 0, then clamps up
});

test("large pictures are shrunk to the limit, small ones are left alone", () => {
  assert.deepEqual(traceSize(2400, 1200), { width: MAX_SIDE, height: 600, shrunk: true });
  assert.deepEqual(traceSize(1000, 4800), { width: 250, height: MAX_SIDE, shrunk: true });
  assert.deepEqual(traceSize(300, 200), { width: 300, height: 200, shrunk: false });
  assert.equal(traceSize(1, 5000).width, 1);
});

test("the SVG name replaces the picture's extension", () => {
  assert.equal(svgName("logo.PNG"), "logo.svg");
  assert.equal(svgName("a.b.jpeg"), "a.b.svg");
  assert.equal(svgName("scan"), "scan.svg");
});

const PATH = '<path fill="rgb(10,20,30)" stroke="rgb(10,20,30)" stroke-width="1" opacity="0.5019607843137255" d="M 0 0 L 4.5 0 Q 5 5 0 4.5 Z " />';
const wrap = (inner, attrs = 'xmlns="http://www.w3.org/2000/svg" width="40" height="30" viewBox="0 0 40 30"') => `<svg ${attrs}>${inner}</svg>`;

test("accepts an svg of shapes", () => {
  assert.ok(isSafeSvg(wrap(PATH + PATH)));
  assert.ok(isSafeSvg(wrap("")));
});

test("rejects scripts, text, links, styles and other elements", () => {
  for (const bad of [
    wrap("<script>alert(1)</script>"),
    wrap("<text>hello</text>"),
    wrap("<title>x</title>"),
    wrap("<style>*{}</style>"),
    wrap('<image href="https://example.com/a.png" />'),
    wrap('<use href="#a" />'),
    wrap('<a href="https://example.com"><path d="M 0 0 Z" /></a>'),
    wrap("<foreignObject></foreignObject>"),
    wrap("<g></g>"),
    wrap(PATH + "text between"),
    wrap(PATH.replace("<path ", '<path onload="x()" ')),
    wrap(PATH.replace("<path ", '<path style="fill:red" ')),
    wrap(PATH.replace('d="M 0 0', 'd="javascript:1')),
    wrap(PATH.replace("rgb(10,20,30)", "url(https://example.com/x)")),
    wrap(PATH, 'xmlns="http://www.w3.org/2000/svg" onload="x()" width="1" height="1"'),
    wrap(PATH, 'xmlns="https://example.com/svg" width="1" height="1"'),
    wrap(PATH, 'xmlns="http://www.w3.org/2000/svg" width="1" height="1" href="https://example.com"'),
    "<?xml version=\"1.0\"?>" + wrap(PATH),
    "<!DOCTYPE svg>" + wrap(PATH),
    wrap(PATH) + "<svg></svg>",
    wrap(PATH) + " ",
    wrap("<![CDATA[x]]>"),
    wrap("<!-- c -->"),
    "",
    null,
  ]) assert.equal(isSafeSvg(bad), false, String(bad).slice(0, 80));
});
