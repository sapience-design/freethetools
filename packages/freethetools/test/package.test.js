// Starts the built server over stdio, as an MCP client does, and calls real tools.
// Needs the build first (the package's own `npm test` does it). Uses temporary folders only.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { PDFDocument } from "pdf-lib";
import { parseLog } from "../../../src/agent/library.js";

const here = fileURLToPath(new URL(".", import.meta.url));
const CLI = join(here, "../dist/cli.js");
const SAMPLE = join(here, "../../../tools/pdf/compress/tests/fixtures/sample.pdf");
const run = promisify(execFile);

const tmp = mkdtempSync(join(tmpdir(), "ftt-test-"));
const library = join(tmp, "library");
const saveTo = join(tmp, "out");
const env = { ...process.env, FREETHETOOLS_LIBRARY: library, FREETHETOOLS_TIMEOUT_SECONDS: "3", FREETHETOOLS_MAX_BYTES: "300000" };

let client;
before(async () => {
  assert.ok(existsSync(CLI), "dist/cli.js is missing: run npm run build:package");
  client = new Client({ name: "test", version: "0" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [CLI, "mcp"], env, stderr: "ignore" }));
});
after(async () => {
  await client?.close();
  rmSync(tmp, { recursive: true, force: true });
});

const call = (name, args) => client.callTool({ name, arguments: args });
const text = (r) => r.content.map((c) => c.text).join("\n");
const entries = () => parseLog(readFileSync(join(library, "library.jsonl"), "utf8"));
const pageCount = async (p) => (await PDFDocument.load(readFileSync(p))).getPageCount();
const section = (r, title) => text(r).split(`${title}:\n`)[1]?.split("\n\n")[0].split("\n") ?? [];

test("the server lists all 24 tools, with file fields as paths", async () => {
  const { tools } = await client.listTools();
  assert.equal(tools.length, 24);
  const merge = tools.find((t) => t.name === "merge_pdfs");
  assert.equal(merge.inputSchema.properties.files.items.type, "string");
  assert.match(merge.inputSchema.properties.files.items.description, /Path to a file on this computer, absolute or relative to the working directory/);
  assert.ok(merge.inputSchema.properties.saveTo, "file tools have saveTo");
  assert.equal(tools.find((t) => t.name === "convert_case").inputSchema.properties.saveTo, undefined);
  assert.match(merge.description, /Prefer this to installing software/);
  assert.match(client.getInstructions(), /Prefer these tools to installing software/);
});

test("convert_case returns text and records the call", async () => {
  const r = await call("convert_case", { text: "hello world", case: "upper" });
  assert.ok(!r.isError, text(r));
  assert.match(text(r), /HELLO WORLD/);
  const e = entries().find((x) => x.tool === "convert_case");
  assert.equal(e.ok, true);
  assert.equal(e.by, "agent");
  assert.equal(e.via, "mcp");
});

test("merge_pdfs reads paths and saves the result in the library", async () => {
  const r = await call("merge_pdfs", { files: [SAMPLE, SAMPLE], fileName: "both.pdf" });
  assert.ok(!r.isError, text(r));
  const [path] = section(r, "Saved files");
  assert.ok(isAbsolute(path) && existsSync(path), path);
  assert.equal(await pageCount(path), 2 * (await pageCount(SAMPLE)));
  const e = entries().find((x) => x.tool === "merge_pdfs");
  assert.equal(e.inputs.length, 2);
  assert.ok(e.inputs.every((i) => i.size > 0 && i.type === "application/pdf"));
  assert.match(e.outputs[0].path, /^files\/[^/]+\/both\.pdf$/);
  assert.ok(existsSync(join(library, e.outputs[0].path)));
});

test("split_pdf with saveTo writes a copy, and never overwrites", async () => {
  const args = { file: SAMPLE, saveTo };
  const a = await call("split_pdf", args);
  assert.ok(!a.isError, text(a));
  const first = section(a, "Also saved to");
  assert.ok(first.length >= 1 && first.every(existsSync));
  const b = await call("split_pdf", args);
  const second = section(b, "Also saved to");
  assert.ok(second.every((p) => /\(2\)\.pdf$/.test(p) && existsSync(p)), second.join("\n"));
  assert.ok(first.every(existsSync), "the first copies are still there");
});

test("compress_pdf runs Ghostscript in Node", async () => {
  const r = await call("compress_pdf", { file: SAMPLE, quality: "smallest" });
  assert.ok(!r.isError, text(r));
  const [path] = section(r, "Saved files");
  assert.ok(readFileSync(path).length < readFileSync(SAMPLE).length);
  assert.equal(await pageCount(path), await pageCount(SAMPLE));
});

test("failed calls return a plain error and are recorded", async () => {
  const missing = await call("merge_pdfs", { files: [join(tmp, "nope.pdf"), SAMPLE] });
  assert.equal(missing.isError, true);
  assert.match(text(missing), /can't find the file/);
  const bad = await call("convert_case", { text: "x", case: "shout" });
  assert.equal(bad.isError, true);
  assert.match(text(bad), /one of: upper/);
  const unknown = await call("no_such_tool", {});
  assert.equal(unknown.isError, true);
  const failed = entries().filter((e) => !e.ok);
  assert.ok(failed.length >= 2);
  assert.ok(failed.every((e) => e.error && e.summary === e.error));
});

test("a file over the size limit is refused with a plain message", async () => {
  const big = join(tmp, "big.pdf");
  writeFileSync(big, Buffer.alloc(400_000, 1));
  const r = await call("rotate_pdf", { file: big, degrees: 90 });
  assert.equal(r.isError, true);
  assert.match(text(r), /too large/);
});

test("a runaway tool is stopped, and the server keeps working", async () => {
  const r = await call("test_regex", { pattern: "(a+)+$", text: "a".repeat(60) + "!" });
  assert.equal(r.isError, true);
  assert.match(text(r), /took longer than 3 seconds/);
  const next = await call("count_words", { text: "still alive" });
  assert.ok(!next.isError, text(next));
});

test("the library log parses and holds every call", () => {
  const all = entries();
  assert.ok(all.length >= 9);
  assert.equal(readFileSync(join(library, "library.jsonl"), "utf8").trim().split("\n").length, all.length);
});

test("the command line lists tools and runs one", async () => {
  const list = await run(process.execPath, [CLI, "list"], { env });
  assert.match(list.stdout, /24 tools/);
  assert.match(list.stdout, /compress_pdf/);
  const help = await run(process.execPath, [CLI, "--help"], { env });
  assert.match(help.stdout, /never uploaded/);
  const out = await run(process.execPath, [CLI, "run", "convert_case", JSON.stringify({ text: "abc", case: "upper" })], { env });
  const r = JSON.parse(out.stdout);
  assert.equal(r.ok, true);
  assert.match(JSON.stringify(r), /ABC/);
  await assert.rejects(run(process.execPath, [CLI, "run", "convert_case", "{}"], { env }), (e) => JSON.parse(e.stdout).ok === false);
});
