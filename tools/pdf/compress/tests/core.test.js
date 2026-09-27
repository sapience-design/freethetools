// Compress PDF: the argument builder, and the same Ghostscript WASM build the page ships.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PRESETS, buildArgs } from "../core.js";

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
