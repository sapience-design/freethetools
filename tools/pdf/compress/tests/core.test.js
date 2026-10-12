// Compress PDF: the argument builder, and the same Ghostscript WASM build the page ships.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DPIS, JPEG_LEVELS, PRESETS, buildArgs, checkOptions } from "../core.js";
import { makePdf } from "./helpers.js";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const GS_DIR = dirname(require.resolve("@jspawn/ghostscript-wasm/gs.js"));
const createGs = require(join(GS_DIR, "gs.js"));
const FIXTURE = readFileSync(join(here, "fixtures", "sample.pdf"));

async function compress(input, opts) {
  const wasm = readFileSync(join(GS_DIR, "gs.wasm"));
  const gs = await createGs({
    noInitialRun: true,
    print: () => {},
    printErr: () => {},
    // Node's fetch cannot read local paths, so hand Emscripten the bytes directly.
    instantiateWasm: (imports, ok) => {
      WebAssembly.instantiate(wasm, imports).then((r) => ok(r.instance));
      return {};
    },
  });
  gs.FS.writeFile("/in.pdf", input);
  assert.equal(gs.callMain(buildArgs(opts)), 0, "Ghostscript exit code");
  return Buffer.from(gs.FS.readFile("/out.pdf"));
}

// Page count from the page tree root, e.g. "/Type /Pages /Kids [...] /Count 3".
const pageCount = (pdf) => Math.max(...[...pdf.toString("latin1").matchAll(/\/Count\s+(\d+)/g)].map((m) => +m[1]));

test("presets are Ghostscript's four, smallest first", () => {
  assert.deepEqual(PRESETS, ["screen", "ebook", "printer", "prepress"]);
});

test("default args use the ebook preset and every page", () => {
  const args = buildArgs();
  assert.ok(args.includes("-dPDFSETTINGS=/ebook"));
  assert.ok(!args.some((a) => a.startsWith("-dFirstPage")));
  assert.deepEqual(args.slice(-2), ["-sOutputFile=/out.pdf", "/in.pdf"]);
});

test("firstPage limits output to page 1", () => {
  const args = buildArgs({ firstPage: true });
  assert.ok(args.includes("-dFirstPage=1") && args.includes("-dLastPage=1"));
});

test("an unknown preset is rejected", () => {
  assert.throws(() => buildArgs({ preset: "tiny" }), /Unknown preset/);
});

test("the fixture has three pages", () => {
  assert.equal(pageCount(FIXTURE), 3);
});

test("ebook output is a smaller PDF with every page", { timeout: 120_000 }, async () => {
  const out = await compress(FIXTURE, { preset: "ebook" });
  assert.equal(out.subarray(0, 5).toString(), "%PDF-");
  assert.ok(out.length < FIXTURE.length * 0.5, `${out.length} vs ${FIXTURE.length}`);
  assert.equal(pageCount(out), 3);
});

test("firstPage output has one page", { timeout: 120_000 }, async () => {
  assert.equal(pageCount(await compress(FIXTURE, { firstPage: true })), 1);
});

test("the screen preset is smaller than the printer preset", { timeout: 120_000 }, async () => {
  const small = await compress(FIXTURE, { preset: "screen" });
  const large = await compress(FIXTURE, { preset: "printer" });
  assert.ok(small.length < large.length, `${small.length} vs ${large.length}`);
});

// ---- Finer options ----

const PHOTO = makePdf();
const sizeOf = async (opts, input = PHOTO) => (await compress(input, { preset: "printer", ...opts })).length;

test("no finer options leaves the arguments as they were", () => {
  const plain = buildArgs({ preset: "ebook", firstPage: true });
  assert.deepEqual(plain, buildArgs({ preset: "ebook", firstPage: true, dpi: null, jpeg: null, gray: false, stripInfo: false }));
  assert.ok(!plain.some((a) => /Resolution|ColorConversion|^-c$/.test(a)));
});

test("a picture resolution sets colour, grey and (never below 300) black-and-white pictures", () => {
  const a = buildArgs({ dpi: 72 });
  assert.ok(a.includes("-dColorImageResolution=72") && a.includes("-dGrayImageResolution=72") && a.includes("-dMonoImageResolution=300"));
  assert.ok(a.includes("-dDownsampleColorImages=true"));
  assert.ok(buildArgs({ dpi: 300 }).includes("-dMonoImageResolution=300"));
  // The preset comes first, so the finer option wins.
  assert.ok(a.indexOf("-dPDFSETTINGS=/ebook") < a.indexOf("-dColorImageResolution=72"));
});

test("grey and JPEG quality add their arguments, and the file name stays last", () => {
  const g = buildArgs({ gray: true });
  assert.ok(g.includes("-sColorConversionStrategy=Gray") && g.includes("-dProcessColorModel=/DeviceGray"));
  const j = buildArgs({ jpeg: "high" });
  assert.match(j[j.indexOf("-c") + 1], /QFactor 0\.4 /);
  assert.equal(j.at(-1), "/in.pdf");
  assert.equal(j.at(-2), "-f");
  const s = buildArgs({ stripInfo: true });
  assert.equal(s.at(-2), "-c");
  assert.match(s.at(-1), /DOCINFO pdfmark$/);
  assert.equal(s.at(-3), "/in.pdf");
});

test("lastPage keeps pages 1 to N", () => {
  const a = buildArgs({ lastPage: 5 });
  assert.ok(a.includes("-dFirstPage=1") && a.includes("-dLastPage=5"));
  assert.ok(buildArgs({ firstPage: true, lastPage: 5 }).includes("-dLastPage=1"));
});

test("every finer value is checked against a fixed list", () => {
  for (const bad of [{ dpi: 96 }, { dpi: "150" }, { dpi: "72; rm" }, { dpi: 0 }, { jpeg: "ultra" }, { jpeg: "__proto__" }, { jpeg: "constructor" }, { gray: "yes" }, { stripInfo: 1 }]) {
    assert.throws(() => buildArgs(bad), /Unknown|must be/, JSON.stringify(bad));
  }
  for (const bad of [0, -1, 1.5, "3", 99999, NaN]) assert.throws(() => buildArgs({ lastPage: bad }), /lastPage/);
  assert.deepEqual(checkOptions({ dpi: 150, jpeg: "low", gray: true, stripInfo: false, junk: "x" }), { dpi: 150, jpeg: "low", gray: true });
  assert.deepEqual(DPIS, [72, 100, 150, 200, 300]);
  assert.deepEqual(Object.keys(JPEG_LEVELS), ["low", "medium", "high"]);
});

test("a lower resolution gives a smaller file", { timeout: 120_000 }, async () => {
  const [d72, d300] = [await sizeOf({ dpi: 72 }), await sizeOf({ dpi: 300 })];
  assert.ok(d72 < d300 * 0.5, `${d72} vs ${d300}`);
});

test("a lower JPEG quality gives a smaller file", { timeout: 120_000 }, async () => {
  const [low, high] = [await sizeOf({ jpeg: "low" }), await sizeOf({ jpeg: "high" })];
  assert.ok(low < high * 0.6, `${low} vs ${high}`);
});

test("grey makes a smaller file than colour, and the page count stays", { timeout: 120_000 }, async () => {
  const colour = await compress(FIXTURE, { preset: "printer" });
  const grey = await compress(FIXTURE, { preset: "printer", gray: true });
  assert.ok(grey.length < colour.length, `${grey.length} vs ${colour.length}`);
  assert.equal(pageCount(grey), 3);
});

test("remove details empties title, author and creator and drops them from the XMP too", { timeout: 120_000 }, async () => {
  const kept = (await compress(PHOTO, { preset: "ebook" })).toString("latin1");
  assert.match(kept, /Secret Title/);
  const clean = (await compress(PHOTO, { preset: "ebook", stripInfo: true })).toString("latin1");
  assert.ok(!clean.includes("Secret"), "no secret text left anywhere");
  assert.equal(clean.slice(0, 5), "%PDF-");
});

test("finer options combine with the first-page limit", { timeout: 120_000 }, async () => {
  const out = await compress(FIXTURE, { preset: "ebook", firstPage: true, dpi: 72, jpeg: "low", gray: true, stripInfo: true });
  assert.equal(pageCount(out), 1);
});
