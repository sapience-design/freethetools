// Starts the built server over stdio, as an MCP client does, and calls real tools.
// Needs the build first (the package's own `npm test` does it). Uses temporary folders only.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { PDFDocument } from "pdf-lib";
import { parseLog } from "../../../src/agent/library.js";
import { safeName } from "../src/library.js";
import { OPEN_PASSWORD, withPassword, withRestrictions } from "../../../tools/pdf/unlock/tests/helpers.js";

const here = fileURLToPath(new URL(".", import.meta.url));
const CLI = join(here, "../dist/cli.js");
const FIXTURE = join(here, "../../../tools/pdf/compress/tests/fixtures/sample.pdf");
const run = promisify(execFile);

const tmp = mkdtempSync(join(tmpdir(), "ftt-test-"));
const library = join(tmp, "library");
const saveTo = join(tmp, "out");
// A copy in the temporary folder: the repository itself may sit inside a hidden folder, such as .claude/worktrees.
const SAMPLE = join(tmp, "sample.pdf");
copyFileSync(FIXTURE, SAMPLE);
const env = { ...process.env, FREETHETOOLS_LIBRARY: library, FREETHETOOLS_ALLOW_SAVE: tmp, FREETHETOOLS_TIMEOUT_SECONDS: "3", FREETHETOOLS_MAX_BYTES: "300000" };

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

test("the server lists all 25 tools, with file fields as paths", async () => {
  const { tools } = await client.listTools();
  assert.equal(tools.length, 25);
  const merge = tools.find((t) => t.name === "merge_pdfs");
  assert.equal(merge.inputSchema.properties.files.items.type, "string");
  assert.match(merge.inputSchema.properties.files.items.description, /Path to a file on this computer, absolute or relative to the working directory/);
  assert.ok(merge.inputSchema.properties.saveTo, "file tools have saveTo");
  assert.equal(tools.find((t) => t.name === "convert_case").inputSchema.properties.saveTo, undefined);
  assert.equal(tools.find((t) => t.name === "list_pdf_form_fields").inputSchema.properties.saveTo, undefined, "only tools that can make files");
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

test("unlock_pdf runs qpdf in Node, and the password never reaches the library", async () => {
  const locked = join(tmp, "locked.pdf");
  writeFileSync(locked, withPassword);
  const r = await call("unlock_pdf", { file: locked, password: OPEN_PASSWORD });
  assert.ok(!r.isError, text(r));
  const [path] = section(r, "Saved files");
  assert.match(path, /locked_unlocked.pdf$/);
  assert.equal(await pageCount(path), await pageCount(SAMPLE));
  assert.ok(!text(r).includes(OPEN_PASSWORD), "the password is not echoed back");

  const wrong = await call("unlock_pdf", { file: locked, password: "not-the-password" });
  assert.equal(wrong.isError, true);
  assert.match(text(wrong), /doesn.t open/);

  const limited = join(tmp, "limited.pdf");
  writeFileSync(limited, withRestrictions);
  const free = await call("unlock_pdf", { file: limited });
  assert.ok(!free.isError, text(free));
  assert.match(text(free), /restrictions on printing, copying/);

  const log = readFileSync(join(library, "library.jsonl"), "utf8");
  assert.ok(!log.includes(OPEN_PASSWORD) && !log.includes("not-the-password"), "no password in library.jsonl");
  const mine = entries().filter((e) => e.tool === "unlock_pdf");
  assert.equal(mine.length, 3);
  assert.deepEqual(mine.map((e) => e.settings), [{}, {}, {}]);
  for (const f of readdirSync(library, { recursive: true, withFileTypes: true })) if (f.isFile() && f.name.endsWith(".jsonl")) assert.ok(!readFileSync(join(f.parentPath, f.name), "utf8").includes(OPEN_PASSWORD));
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
  assert.match(list.stdout, /25 tools/);
  assert.match(list.stdout, /compress_pdf/);
  const help = await run(process.execPath, [CLI, "--help"], { env });
  assert.match(help.stdout, /never uploaded/);
  const out = await run(process.execPath, [CLI, "run", "convert_case", JSON.stringify({ text: "abc", case: "upper" })], { env });
  const r = JSON.parse(out.stdout);
  assert.equal(r.ok, true);
  assert.match(JSON.stringify(r), /ABC/);
  await assert.rejects(run(process.execPath, [CLI, "run", "convert_case", "{}"], { env }), (e) => JSON.parse(e.stdout).ok === false);
});

// ---- Safety: what the package may write and read ----------------------------------------------

const other = mkdtempSync(join(tmpdir(), "ftt-other-")); // a folder nobody allowed
after(() => rmSync(other, { recursive: true, force: true }));
const B64 = "RnJlZSB0aGUgVG9vbHM="; // "Free the Tools"
const decodeToFile = (args) => call("base64_decode", { base64: B64, output: "file", ...args });
const cli = (args, opts = {}) => run(process.execPath, [CLI, ...args], { env, maxBuffer: 20_000_000, ...opts });
const linkDir = (target, path) => symlinkSync(target, path, "junction"); // a junction needs no privileges on Windows
const listDir = (dir) => {
  try { return readdirSync(dir); } catch { return []; }
};

test("saveTo outside the allowed folders is refused, and nothing is written", async () => {
  const r = await decodeToFile({ fileName: "note.txt", saveTo: other });
  assert.equal(r.isError, true);
  assert.match(text(r), /won't save to/);
  assert.match(text(r), /--allow-save/);
  assert.deepEqual(listDir(other), []);
  const home = join(homedir(), "freethetools-test-never-made");
  const inHome = await decodeToFile({ fileName: "note.txt", saveTo: home });
  assert.equal(inHome.isError, true);
  assert.equal(existsSync(home), false);
});

test("saveTo cannot escape through a link", async () => {
  const link = join(tmp, "escape-link");
  linkDir(other, link);
  const r = await decodeToFile({ fileName: "note.txt", saveTo: link });
  assert.equal(r.isError, true, text(r));
  assert.match(text(r), /won't save to/);
  const through = await decodeToFile({ fileName: "note.txt", saveTo: join(link, "deeper") });
  assert.equal(through.isError, true);
  assert.deepEqual(listDir(other), []);
});

test("saveTo never goes into a hidden folder", async () => {
  for (const dir of [join(tmp, ".git", "hooks"), join(tmp, "project", ".hidden")]) {
    const r = await decodeToFile({ fileName: "note.txt", saveTo: dir });
    assert.equal(r.isError, true, dir);
    assert.match(text(r), /hidden folder/);
    assert.equal(existsSync(dir), false);
  }
});

test("saveTo works in an allowed folder, the working directory and a folder given with --allow-save", async () => {
  const ok = await decodeToFile({ fileName: "note.txt", saveTo: join(tmp, "allowed-by-env") });
  assert.ok(!ok.isError, text(ok));
  assert.ok(section(ok, "Also saved to").every(existsSync));

  const cwd = join(tmp, "work");
  mkdirSync(cwd);
  const noAllow = { ...env, FREETHETOOLS_ALLOW_SAVE: "" };
  const args = JSON.stringify({ base64: B64, output: "file", fileName: "note.txt", saveTo: "results" });
  const inCwd = JSON.parse((await cli(["run", "base64_decode", args], { cwd, env: noAllow })).stdout);
  assert.equal(inCwd.saved.length, 1);
  assert.ok(existsSync(join(cwd, "results", "note.txt")));

  const elsewhere = JSON.stringify({ base64: B64, output: "file", fileName: "note.txt", saveTo: other });
  const refused = await cli(["run", "base64_decode", elsewhere], { cwd, env: noAllow }).catch((e) => e);
  assert.equal(JSON.parse(refused.stdout).ok, false);
  const allowed = await cli(["run", "base64_decode", elsewhere, "--allow-save", other], { cwd, env: noAllow });
  assert.equal(JSON.parse(allowed.stdout).ok, true);
  assert.ok(existsSync(join(other, "note.txt")));
  rmSync(join(other, "note.txt"));
});

test("names that can run a program, hidden names and names without an extension are refused", async () => {
  const refused = ["evil.bat", "RUN.PS1", "x.js", "mod.mjs", "mod.cjs", "run.scpt", "Do.workflow", "tool.exe", "a.sh", "evil.bat.", "evil.lnk", "installer.msi", "noextension", ".hidden.txt", ".env"];
  for (const fileName of refused) {
    const before = entries().length;
    const r = await decodeToFile({ fileName, saveTo: join(tmp, "names") });
    assert.equal(r.isError, true, fileName);
    assert.match(text(r), /I won't save a file named/, fileName);
    assert.match(text(r), /Use another name/, fileName);
    assert.ok(text(r).includes(fileName.replace(/[. ]+$/, "")), `${fileName}: ${text(r)}`);
    assert.equal(entries().length, before + 1, "the refusal is recorded");
  }
  assert.deepEqual(listDir(join(tmp, "names")), [], "nothing was written to the folder");
  for (const fileName of ["note.txt", "data.json", "picture.png"]) assert.ok(!(await decodeToFile({ fileName })).isError, fileName);
});

test("safeName keeps the extension when it cuts a long name", () => {
  const long = safeName(`${"a".repeat(300)}.pdf`);
  assert.equal(long.length, 180);
  assert.ok(long.endsWith("a.pdf"));
  assert.equal(safeName(`${"b".repeat(179)} .pdf`).endsWith(".pdf"), true);
  assert.equal(safeName("short.pdf"), "short.pdf");
  assert.equal(safeName("..\\..\\evil.txt"), "evil.txt");
  assert.equal(safeName(`${"c".repeat(200)}.${"x".repeat(40)}`).length, 180);
});

test("secrets and saveTo never reach library.jsonl", async () => {
  const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2ln";
  const a = await call("decode_jwt", { token: jwt, secret: "SUPERSECRET" });
  assert.ok(!a.isError, text(a));
  const b = await call("make_qr_code", { wifi: { ssid: "HomeNet", password: "WIFIPASS" }, fileName: "wifi.svg", saveTo: join(tmp, "qr-copies") });
  assert.ok(!b.isError, text(b));
  const raw = readFileSync(join(library, "library.jsonl"), "utf8");
  assert.ok(!raw.includes("SUPERSECRET"), "the JWT secret is not recorded");
  assert.ok(!raw.includes("WIFIPASS"), "the Wi-Fi password is not recorded");
  assert.ok(!raw.includes("qr-copies"), "saveTo is not recorded");
  assert.deepEqual(entries().find((e) => e.tool === "make_qr_code").settings, { fileName: "wifi.svg" });
  assert.deepEqual(entries().find((e) => e.tool === "decode_jwt").settings, {});
});

test("hidden files and files in hidden folders are never read", async () => {
  mkdirSync(join(tmp, ".ssh"));
  writeFileSync(join(tmp, ".ssh", "id_rsa"), "PRIVATEKEY");
  writeFileSync(join(tmp, ".env"), "TOKEN=PRIVATEVALUE");
  writeFileSync(join(tmp, "plain.txt"), "plain");
  mkdirSync(join(tmp, ".git"));
  writeFileSync(join(tmp, ".git", "config"), "PRIVATEGIT");
  const leaked = (r) => text(r).includes(Buffer.from("PRIVATE").toString("base64").slice(0, 8));
  for (const file of [join(tmp, ".ssh", "id_rsa"), join(tmp, ".env"), join(tmp, ".git", "config")]) {
    const r = await call("base64_encode", { file });
    assert.equal(r.isError, true, file);
    assert.match(text(r), /hidden/);
    assert.ok(!leaked(r));
  }
  const ok = await call("base64_encode", { file: join(tmp, "plain.txt") });
  assert.ok(!ok.isError, text(ok));
  // a link in a normal folder that points into a hidden one
  linkDir(join(tmp, ".ssh"), join(tmp, "innocent"));
  const viaLink = await call("base64_encode", { file: join(tmp, "innocent", "id_rsa") });
  assert.equal(viaLink.isError, true);
  assert.match(text(viaLink), /hidden/);
  assert.ok(!leaked(viaLink));
});

test("data over 1 MB goes to a file in the library, and the whole result reaches the command line", async () => {
  const big = join(tmp, "big.bin");
  writeFileSync(big, Buffer.alloc(1_500_000, 7));
  const bigEnv = { ...env, FREETHETOOLS_MAX_BYTES: "5000000" };
  const r = JSON.parse((await cli(["run", "base64_encode", JSON.stringify({ file: big })], { env: bigEnv })).stdout);
  assert.equal(r.ok, true);
  assert.equal(r.data, undefined, "the data is not returned inline");
  assert.match(r.summary, /saved as the file base64_encode-data\.json/);
  const file = r.files.find((f) => f.name === "base64_encode-data.json");
  assert.ok(file && existsSync(file.path) && file.path.startsWith(library));
  assert.equal(JSON.parse(readFileSync(file.path, "utf8")).base64.length, 2_000_000);

  // Under the cap: returned inline, and the command line prints all of it before it exits.
  const mid = join(tmp, "mid.bin");
  writeFileSync(mid, Buffer.alloc(600_000, 9));
  const out = await cli(["run", "base64_encode", JSON.stringify({ file: mid })], { env: bigEnv });
  assert.ok(out.stdout.length > 800_000);
  assert.equal(JSON.parse(out.stdout).data.base64.length, 800_000);
});

test("options sent as null get their defaults", async () => {
  const r = await call("compress_pdf", { file: SAMPLE, quality: null, firstPageOnly: null });
  assert.ok(!r.isError, text(r));
  assert.match(text(r), /"quality": "balanced"/);
  assert.deepEqual(entries().filter((e) => e.tool === "compress_pdf").pop().settings, {});
});

test("calls queued behind the worker limit all finish", async () => {
  const results = await Promise.all(Array.from({ length: 8 }, (_, i) => call("count_words", { text: `one two ${i}` })));
  assert.ok(results.every((r) => !r.isError));
});

test("each tool says whether it only reads or also makes files", async () => {
  const { tools } = await client.listTools();
  for (const t of tools) {
    assert.equal(t.annotations.openWorldHint, false, t.name);
    if (t.inputSchema.properties.saveTo) {
      assert.equal(t.annotations.readOnlyHint, false, t.name);
      assert.equal(t.annotations.destructiveHint, false, t.name);
    } else {
      assert.equal(t.annotations.readOnlyHint, true, t.name);
    }
  }
  assert.equal(tools.find((t) => t.name === "convert_case").annotations.readOnlyHint, true);
  assert.equal(tools.find((t) => t.name === "merge_pdfs").annotations.readOnlyHint, false);
});
