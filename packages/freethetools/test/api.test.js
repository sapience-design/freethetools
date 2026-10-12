// The package as a code library: import { run, listTools, compressPdf, ... } from "freethetools".
// Files go in as paths or bytes and come back as bytes. Nothing is written to disk or recorded.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PDFDocument } from "pdf-lib";

const here = fileURLToPath(new URL(".", import.meta.url));
const INDEX = join(here, "../dist/index.js");
const FIXTURE = join(here, "../../../tools/pdf/compress/tests/fixtures/sample.pdf");
const tmp = mkdtempSync(join(tmpdir(), "ftt-api-"));
// A copy in the temporary folder: the repository itself may sit inside a hidden folder, such as .claude/worktrees.
const SAMPLE = join(tmp, "sample.pdf");
copyFileSync(FIXTURE, SAMPLE);
after(() => rmSync(tmp, { recursive: true, force: true }));

assert.ok(existsSync(INDEX), "dist/index.js is missing: run the package build");
const api = await import(pathToFileURL(INDEX).href);
const pages = async (bytes) => (await PDFDocument.load(bytes)).getPageCount();
const samplePages = await pages(readFileSync(SAMPLE));

test("listTools gives every tool with its name, description and options", () => {
  const list = api.listTools();
  assert.ok(list.length >= 20, `only ${list.length} tools`);
  const merge = list.find((t) => t.name === "merge_pdfs");
  assert.ok(merge, "merge_pdfs is listed");
  assert.equal(merge.makesFiles, true);
  assert.ok(merge.description.length > 20);
  assert.ok(merge.input.properties.files, "merge_pdfs takes files");
  assert.equal(list.find((t) => t.name === "convert_case").makesFiles, false);
});

test("run returns a text tool's data", async () => {
  const r = await api.run("convert_case", { text: "free the tools", case: "title" });
  assert.equal(r.tool, "convert_case");
  assert.equal(r.data.text, "Free the Tools"); // title case keeps small words such as "the" lower case
  assert.match(r.summary, /title case/);
  assert.deepEqual(r.files, []);
});

test("every tool also has a named function: convert_case is convertCase", async () => {
  assert.equal(typeof api.convertCase, "function");
  assert.equal(typeof api.compressPdf, "function");
  assert.equal(typeof api.mergePdfs, "function");
  const r = await api.convertCase({ text: "free the tools", case: "constant" });
  assert.equal(r.data.text, "FREE_THE_TOOLS");
  for (const t of api.listTools()) {
    const fn = t.name.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
    assert.equal(typeof api[fn], "function", `${fn} for ${t.name}`);
  }
});

test("files go in as a path, bytes, a Blob or { name, bytes }, and come back as bytes", async () => {
  const bytes = readFileSync(SAMPLE);
  const mine = new Uint8Array(bytes); // a whole buffer of its own: the case a transfer would empty
  const r = await api.mergePdfs({
    files: [SAMPLE, mine, new Blob([bytes], { type: "application/pdf" }), { name: "four.pdf", bytes }],
    fileName: "all.pdf",
  });
  assert.equal(mine.length, bytes.length, "the caller's bytes are left as they were");
  assert.equal(mine[0], 0x25); // "%" of "%PDF"
  assert.equal(r.files.length, 1);
  const [out] = r.files;
  assert.equal(out.name, "all.pdf");
  assert.equal(out.type, "application/pdf");
  assert.ok(out.bytes instanceof Uint8Array);
  assert.equal(out.size, out.bytes.length);
  assert.equal(await pages(out.bytes), 4 * samplePages);
});

test("nothing is written to disk", async () => {
  const before = readdirSync(tmp).sort();
  const cwd = process.cwd();
  process.chdir(tmp);
  try {
    await api.mergePdfs({ files: [SAMPLE, SAMPLE] });
  } finally {
    process.chdir(cwd);
  }
  assert.deepEqual(readdirSync(tmp).sort(), before);
});

test("a tool that runs an engine works: compress_pdf with Ghostscript", async () => {
  const r = await api.compressPdf({ file: readFileSync(SAMPLE) });
  assert.equal(r.files.length, 1);
  assert.equal(await pages(r.files[0].bytes), samplePages);
});

test("mistakes throw a FreeTheToolsError with a plain message", async () => {
  await assert.rejects(api.run("no_such_tool", {}), (e) => e instanceof api.FreeTheToolsError && /There is no tool named no_such_tool/.test(e.message));
  await assert.rejects(api.convertCase({ text: "x", case: "sideways" }), (e) => e instanceof api.FreeTheToolsError && /case should be one of/.test(e.message));
  await assert.rejects(api.mergePdfs({ files: [SAMPLE] }), (e) => e instanceof api.FreeTheToolsError && /at least 2/.test(e.message));
  await assert.rejects(api.mergePdfs({ files: [SAMPLE, 42] }), (e) => e instanceof api.FreeTheToolsError && /path, bytes/.test(e.message));
  await assert.rejects(api.mergePdfs({ files: [SAMPLE, join(tmp, "missing.pdf")] }), (e) => e instanceof api.FreeTheToolsError && /can't find/.test(e.message));
});

test("types declare run, listTools and every tool's function, with its description", () => {
  const dts = readFileSync(join(here, "../dist/index.d.ts"), "utf8");
  assert.match(dts, /export declare function run\(/);
  assert.match(dts, /export declare function listTools\(\)/);
  for (const t of api.listTools()) {
    const fn = t.name.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
    assert.match(dts, new RegExp(`export declare function ${fn}\\(`), fn);
  }
  assert.ok(!/\*\/ \*\//.test(dts), "no description ends a comment early");
});

test("hidden files are refused, as in the MCP server", async () => {
  const dir = join(tmp, ".secret");
  mkdirSync(dir);
  const hidden = join(dir, "key.pdf");
  copyFileSync(SAMPLE, hidden);
  await assert.rejects(api.mergePdfs({ files: [SAMPLE, hidden] }), (e) => e instanceof api.FreeTheToolsError && /hidden/.test(e.message));
});
