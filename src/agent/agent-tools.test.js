// Checks every agent tool definition (tools/<group>/<slug>/agent.js) against the contract in
// contract.js, runs each one in Node the way a channel would, and checks the library format.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { PDFDocument } from "pdf-lib";
import { checkArgs, cleanArgs, detectType, fileFields, settingsOf, wireSchema } from "./contract.js";
import { libraryEntry, logLine, parseLog } from "./library.js";
import { OPEN_PASSWORD, qpdf as realQpdf, withPassword, withRestrictions } from "../../tools/pdf/unlock/tests/helpers.js";

const ROOT = new URL("../../", import.meta.url);
const TOOLS = join(ROOT.pathname.replace(/^\/(\w:)/, "$1"), "tools");
const folders = readdirSync(TOOLS)
  .filter((g) => !g.startsWith("_"))
  .flatMap((g) => readdirSync(join(TOOLS, g)).map((s) => `${g}/${s}`))
  .filter((id) => existsSync(join(TOOLS, id, "agent.js")));

/** @type {{ id: string, def: import("./contract.js").AgentTool }[]} */
const all = [];
for (const id of folders) {
  const mod = await import(pathToFileURL(join(TOOLS, id, "agent.js")).href);
  for (const def of [mod.default].flat()) all.push({ id, def });
}
const byName = Object.fromEntries(all.map((t) => [t.def.name, t.def]));

const SAMPLE_PDF = new Uint8Array(readFileSync(join(TOOLS, "pdf/compress/tests/fixtures/sample.pdf")));
const PNG = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAAEElEQVR4nGP4z8DAwMDAAAAN/gH/7yFJ5QAAAABJRU5ErkJggg==", "base64"));
const pdf = (name = "report.pdf", bytes = SAMPLE_PDF) => ({ name, type: "application/pdf", bytes });
const pages = async (bytes) => (await PDFDocument.load(bytes)).getPageCount();

/** Call a tool the way a channel does: check the wire arguments, then run. */
async function call(name, args, ctx = {}) {
  const def = byName[name];
  assert.ok(def, `no tool named ${name}`);
  const wire = Object.fromEntries(Object.entries(args).map(([k, v]) => [k, Array.isArray(v) ? v.map((x) => x?.bytes ? x.name : x) : v?.bytes ? v.name : v]));
  const problems = checkArgs(wireSchema(def.input, () => ({ type: "string" })), wire);
  assert.deepEqual(problems, [], `${name}: ${problems.join(" ")}`);
  const result = await def.run(args, ctx);
  if (result.files?.length) assert.equal(def.makesFiles, true, `${name} returned files, so it needs makesFiles: true`);
  return result;
}

test("there are definitions, and names are unique", () => {
  assert.ok(all.length >= 20, `found ${all.length}`);
  const names = all.map((t) => t.def.name);
  assert.deepEqual(names.filter((n, i) => names.indexOf(n) !== i), []);
});

for (const { id, def } of all) {
  test(`${id} ${def.name}: schema is well formed and the example runs`, async () => {
    assert.ok(def.description.includes("this device"), "say that it runs on the device");
    for (const [k, s] of Object.entries(def.input.properties)) assert.ok(s.description, `${k} needs a description`);
    if (def.example) {
      assert.deepEqual(checkArgs(def.input, def.example), []);
      const r = await def.run(def.example, {});
      assert.equal(typeof r.summary, "string");
      assert.ok(r.summary.length > 0);
    } else {
      assert.ok(fileFields(def.input).length > 0, "a tool without file inputs needs an example");
    }
  });
}

test("checkArgs explains problems in plain words", () => {
  const s = byName.convert_case.input;
  assert.deepEqual(checkArgs(s, { text: "a", case: "upper" }), []);
  assert.match(checkArgs(s, { case: "upper" })[0], /text is required/);
  assert.match(checkArgs(s, { text: "a", case: "shout" })[0], /one of: upper/);
  assert.match(checkArgs(s, { text: "a", case: "upper", extra: 1 })[0], /not an option/);
  assert.match(checkArgs(byName.generate_uuids.input, { count: 5000 })[0], /at most 1000/);
});

test("wireSchema replaces file fields and keeps the rest", () => {
  const w = wireSchema(byName.merge_pdfs.input, () => ({ type: "string", description: "path" }));
  assert.deepEqual(w.properties.files.items, { type: "string", description: "path" });
  assert.equal(w.properties.fileName.type, "string");
  assert.deepEqual(fileFields(byName.merge_pdfs.input), [{ key: "files", multiple: true, accept: ["application/pdf"], required: true }]);
  assert.deepEqual(settingsOf(byName.rotate_pdf.input, { file: "x", degrees: 90 }), { degrees: 90 });
});

test("detectType reads the first bytes before the extension", () => {
  assert.equal(detectType(SAMPLE_PDF, "notes.txt"), "application/pdf");
  assert.equal(detectType(PNG, "x.bin"), "image/png");
  assert.equal(detectType(new TextEncoder().encode("a,b"), "data.CSV"), "text/csv");
});

test("text tools: text in, text out", async () => {
  assert.equal((await call("convert_case", { text: "free the tools", case: "kebab" })).data.text, "free-the-tools");
  assert.equal((await call("count_words", { text: "one two three" })).data.words, 3);
  const d = await call("compare_texts", { original: "a\nb\n", changed: "a\nc\n" });
  assert.equal(d.data.diff, "  a\n- b\n+ c");
  const j = await call("csv_to_json", { text: "name,age\nAda,36", typed: true });
  assert.deepEqual(JSON.parse(j.data.json), [{ name: "Ada", age: 36 }]);
  assert.equal((await call("json_to_csv", { text: '[{"a":1}]' })).data.csv, "a\r\n1");
  assert.match((await call("format_json", { text: '{"b":1,"a":2}', sort: true, indent: 0 })).data.json, /^\{"a":2,"b":1\}$/);
  await assert.rejects(call("format_json", { text: '{"a":}' }), /line 1, column 6/);
});

test("text tools: a file in gives a file out", async () => {
  const csv = { name: "people.csv", type: "text/csv", bytes: new TextEncoder().encode("name\nAda") };
  const r = await call("csv_to_json", { file: csv });
  assert.equal(r.files[0].name, "people.json");
  assert.deepEqual(JSON.parse(new TextDecoder().decode(r.files[0].bytes)), [{ name: "Ada" }]);
  await assert.rejects(call("csv_to_json", { text: "a", file: csv }), /not both/);
  await assert.rejects(call("csv_to_json", {}), /Give some CSV/);
});

test("developer tools", async () => {
  const b = await call("base64_encode", { text: "Free the Tools" });
  assert.equal((await call("base64_decode", { base64: b.data.base64 })).data.text, "Free the Tools");
  const f = await call("base64_decode", { base64: Buffer.from(PNG).toString("base64"), output: "file", fileName: "x.png" });
  assert.equal(f.files[0].type, "image/png");
  const h = await call("generate_hash", { text: "abc", algorithms: ["SHA-256", "MD5"] });
  assert.equal(h.data["SHA-256"], "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(h.data.MD5, "900150983cd24fb0d6963f7d28e17f72");
  const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
  assert.equal((await call("decode_jwt", { token, secret: "your-256-bit-secret" })).data.signature, "valid");
  assert.equal((await call("decode_jwt", { token, secret: "wrong" })).data.signature, "invalid");
  const p = await call("generate_password", { count: 3, length: 24 });
  assert.equal(p.data.values.length, 3);
  assert.ok(p.data.values.every((v) => v.length === 24));
  assert.equal((await call("generate_password", { kind: "passphrase", words: 4, separator: "." })).data.values[0].split(".").length, 4);
  const q = await call("make_qr_code", { wifi: { ssid: "Home", password: "secret" } });
  assert.match(new TextDecoder().decode(q.files[0].bytes), /^<svg /);
  await assert.rejects(call("make_qr_code", {}), /either text or wifi/);
  const rx = await call("test_regex", { pattern: "(?<y>\\d{4})", text: "1999 and 2026" });
  assert.deepEqual(rx.data.matches.map((m) => m.named.y), ["1999", "2026"]);
  await assert.rejects(call("test_regex", { pattern: "(", text: "x" }), /isn't valid/);
  assert.match((await call("generate_uuids", { version: "v7", count: 2 })).data.uuids[1], /^[0-9a-f-]{36}$/);
});

test("everyday tools", async () => {
  const t = await call("convert_time_zone", { time: "2026-07-01T09:00", from: "Europe/Oslo", to: ["UTC", "Asia/Tokyo"] });
  assert.equal(t.data.utc, "2026-07-01T07:00:00.000Z");
  assert.deepEqual(t.data.times.map((x) => x.time), ["07:00", "16:00"]);
  await assert.rejects(call("convert_time_zone", { time: "2026-07-01T09:00", from: "Mars/Base", to: ["UTC"] }), /isn't a time zone/);
  const u = await call("convert_units", { value: 100, category: "temperature", from: "C", to: "F" });
  assert.equal(u.data.result, 212);
});

test("photo metadata: removes the EXIF block from a JPEG", async () => {
  // Minimal JPEG: SOI, an APP1 Exif segment, then start of scan.
  const exif = [0xff, 0xe1, 0x00, 0x10, ...Buffer.from("Exif\0\0"), 0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 0];
  const jpg = Uint8Array.from([0xff, 0xd8, ...exif, 0xff, 0xda, 0x00, 0x02, 0x00]);
  const r = await call("remove_photo_metadata", { files: [{ name: "beach.jpg", type: "image/jpeg", bytes: jpg }] });
  assert.equal(r.files[0].name, "beach_clean.jpg");
  assert.equal(r.files[0].bytes.length, jpg.length - exif.length);
  assert.deepEqual(r.data.photos[0].removed, ["exif"]);
});

test("PDF tools", async () => {
  const total = await pages(SAMPLE_PDF);
  const m = await call("merge_pdfs", { files: [pdf("a.pdf"), pdf("b.pdf")] });
  assert.equal(await pages(m.files[0].bytes), total * 2);
  const s = await call("split_pdf", { file: pdf(), ranges: "1-2, 3" });
  assert.deepEqual(s.files.map((f) => f.name), ["report_pages-1-2.pdf", "report_page-3.pdf"]);
  const r = await call("rotate_pdf", { file: pdf(), degrees: 90, pages: "2" });
  const doc = await PDFDocument.load(r.files[0].bytes);
  assert.deepEqual(doc.getPages().map((p) => p.getRotation().angle), [0, 90, 0]);
  const fields = await call("list_pdf_form_fields", { file: pdf() });
  assert.equal(fields.data.fields.length, 0);
  const i = await call("images_to_pdf", { files: [{ name: "a.png", type: "image/png", bytes: PNG }] });
  assert.equal(await pages(i.files[0].bytes), 1);
  await assert.rejects(call("merge_pdfs", { files: [pdf(), { name: "x.png", type: "image/png", bytes: PNG }] }), /isn't a PDF/);
});

test("fill_pdf_form fills known fields and reports the rest", async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage();
  doc.getForm().createTextField("name").addToPage(page, { x: 50, y: 700 });
  doc.getForm().createCheckBox("agree").addToPage(page, { x: 50, y: 650 });
  const form = pdf("form.pdf", await doc.save());
  const r = await call("fill_pdf_form", { file: form, values: { name: "Ada", agree: true, missing: "x" } });
  assert.deepEqual(r.data.filled, ["name", "agree"]);
  assert.deepEqual(r.data.skipped, [{ name: "missing", reason: "no field with this name" }]);
  const out = (await PDFDocument.load(r.files[0].bytes)).getForm();
  assert.equal(out.getTextField("name").getText(), "Ada");
});

test("compress_pdf uses the engine the channel lends it", async () => {
  await assert.rejects(call("compress_pdf", { file: pdf() }), /isn't available here/);
  let seen;
  const ghostscript = async (args, input) => { seen = args; return input.subarray(0, 100); };
  const r = await call("compress_pdf", { file: pdf(), quality: "smallest", firstPageOnly: true }, { ghostscript });
  assert.ok(seen.includes("-dPDFSETTINGS=/screen") && seen.includes("-dFirstPage=1"));
  assert.equal(r.files[0].name, "report_p1_small.pdf");
  assert.ok(r.data.percentSmaller > 0);
});

test("unlock_pdf uses the engine the channel lends it, and says what it did", async () => {
  await assert.rejects(call("unlock_pdf", { file: pdf() }), /isn.t available here/);
  const seen = [];
  const fake = async (args, input) => {
    seen.push(args);
    if (args[0] === "--show-encryption") return { code: 0, lines: ["R = 6", "Supplied password is user password", "print low resolution: not allowed", "extract for any purpose: not allowed"] };
    return { code: 0, lines: [], output: input.subarray(0, 100) };
  };
  const r = await call("unlock_pdf", { file: pdf("secret.pdf"), password: "hunter2" }, { qpdf: fake });
  assert.ok(seen.some((a) => a.includes("--password=hunter2") && a[0] === "--decrypt"));
  assert.equal(r.files[0].name, "secret_unlocked.pdf");
  assert.deepEqual(r.data, { lock: "password", restrictions: ["printing", "copying text and images"] });
  assert.match(r.summary, /Removed the password and the restrictions on printing and copying text and images/);
  assert.ok(!JSON.stringify([r.summary, r.data]).includes("hunter2"), "the password is not echoed back");
  const none = await call("unlock_pdf", { file: pdf() }, { qpdf: async () => ({ code: 0, lines: ["File is not encrypted"] }) });
  assert.equal(none.files, undefined);
  assert.equal(none.data.lock, "none");
  const needs = async () => ({ code: 2, lines: ["qpdf: /in.pdf: invalid password"] });
  await assert.rejects(call("unlock_pdf", { file: pdf() }, { qpdf: needs }), /needs a password/);
  await assert.rejects(call("unlock_pdf", { file: pdf(), password: "x" }, { qpdf: needs }), /doesn.t open/);
  await assert.rejects(call("unlock_pdf", { file: pdf() }, { qpdf: async () => ({ code: 2, lines: ["qpdf: damaged"] }) }), /damaged or not a PDF/);
});

test("unlock_pdf unlocks real encrypted files with qpdf", async () => {
  const ctx = { qpdf: realQpdf };
  const opened = await call("unlock_pdf", { file: pdf("locked.pdf", withPassword), password: OPEN_PASSWORD }, ctx);
  assert.equal(await pages(opened.files[0].bytes), await pages(SAMPLE_PDF));
  const free = await call("unlock_pdf", { file: pdf("limited.pdf", withRestrictions) }, ctx);
  assert.equal(free.data.lock, "restrictions");
  assert.ok(free.data.restrictions.includes("printing"));
  await assert.rejects(call("unlock_pdf", { file: pdf("locked.pdf", withPassword), password: "wrong" }, ctx), /doesn.t open/);
});

test("the library never keeps an unlock password", () => {
  const input = byName.unlock_pdf.input;
  assert.equal(input.properties.password["x-setting"], undefined, "password must not be a recorded setting");
  assert.deepEqual(settingsOf(input, { file: "a.pdf", password: "hunter2" }), {});
  assert.deepEqual(settingsOf(input, { password: "" }), {});
  assert.match(byName.unlock_pdf.description, /password passes through the AI conversation/);
  assert.match(byName.unlock_pdf.description, /right to unlock/);
  assert.deepEqual(byName.unlock_pdf.needs, ["qpdf"]);
  assert.equal(byName.unlock_pdf.makesFiles, true);
  const entry = libraryEntry({ tool: "pdf/unlock", title: "Unlock PDF", by: "agent", via: "mcp", ok: true, summary: "Removed the password.", settings: settingsOf(input, { file: "a.pdf", password: "hunter2" }), inputs: [pdf("a.pdf")], outputs: [] });
  assert.ok(!logLine(entry).includes("hunter2"));
});

test("library records round-trip through library.jsonl", () => {
  const e = libraryEntry({
    tool: "pdf/merge", title: "Merge PDFs", by: "agent", via: "mcp", ok: true, summary: "Merged",
    settings: { fileName: "x.pdf" }, inputs: [pdf("a.pdf")], outputs: [{ name: "x.pdf", type: "application/pdf", size: 10, path: "files/1/x.pdf" }],
    now: Date.UTC(2026, 9, 6),
  });
  assert.equal(e.time, "2026-10-06T00:00:00.000Z");
  assert.deepEqual(e.inputs, [{ name: "a.pdf", size: SAMPLE_PDF.length, type: "application/pdf" }]);
  assert.equal(e.outputs[0].path, "files/1/x.pdf");
  const text = logLine(e) + "not json\n" + logLine({ ...e, v: 99 }) + logLine({ ...e, id: "b" });
  assert.deepEqual(parseLog(text).map((x) => x.id), [e.id, "b"]);
});

test("the library keeps options, never content or secrets", () => {
  const s = (name, args) => settingsOf(byName[name].input, args);
  assert.deepEqual(s("make_qr_code", { wifi: { ssid: "Home", password: "WIFIPASS" }, level: "H" }), { level: "H" });
  assert.deepEqual(s("decode_jwt", { token: "a.b.c", secret: "SUPERSECRET" }), {});
  assert.deepEqual(s("fill_pdf_form", { file: "f.pdf", values: { name: "Ada" }, flatten: true }), { flatten: true });
  assert.deepEqual(s("convert_case", { text: "private words", case: "upper" }), { case: "upper" });
  assert.deepEqual(s("base64_decode", { base64: "c2VjcmV0", output: "file", fileName: "x.bin" }), { output: "file", fileName: "x.bin" });
  assert.deepEqual(s("split_pdf", { file: "f.pdf", ranges: "1-3, 5" }), { ranges: "1-3, 5" });
  assert.deepEqual(s("generate_hash", { text: "x", algorithms: ["MD5"] }), { algorithms: ["MD5"] });
  assert.deepEqual(s("convert_case", JSON.parse('{"__proto__": {"x": 1}, "constructor": "y", "case": "lower"}')), { case: "lower" });
});

test("options sent as null count as unset", () => {
  const input = byName.compress_pdf.input;
  assert.deepEqual(checkArgs(wireSchema(input, () => ({ type: "string" })), { file: "a.pdf", quality: null, firstPageOnly: null }), []);
  assert.deepEqual(cleanArgs({ file: "a.pdf", quality: null }), { file: "a.pdf" });
  assert.match(checkArgs(input, { file: null })[0], /file is required/);
  assert.match(checkArgs({ type: "object", properties: { a: { type: "string", minLength: 3 } } }, { a: "x" })[0], /at least 3 characters/);
  assert.match(checkArgs(byName.convert_case.input, { text: "a", case: "upper", toString: 1 })[0], /not an option/);
});

test("json_to_csv counts rows, not lines", async () => {
  const r = await call("json_to_csv", { text: JSON.stringify([{ a: "two\nlines" }, { a: 1 }]) });
  assert.equal(r.data.rows, 2);
});

test("schemas use only keywords that checkArgs understands", () => {
  const KNOWN = new Set(["type", "properties", "required", "additionalProperties", "enum", "minimum", "maximum", "minLength", "maxLength", "minItems", "maxItems", "items", "description", "format", "accept", "x-setting"]);
  const walk = (s, where) => {
    for (const k of Object.keys(s)) assert.ok(KNOWN.has(k), `${where}: unsupported keyword "${k}"`);
    for (const [k, sub] of Object.entries(s.properties ?? {})) walk(sub, `${where}.${k}`);
    if (s.items) walk(s.items, `${where}[]`);
    if (typeof s.additionalProperties === "object") walk(s.additionalProperties, `${where}{}`);
  };
  for (const { def } of all) walk(def.input, def.name);
});

test("parseLog cleans every line, so one bad record can't break the library page", () => {
  const good = { v: 1, id: "a", tool: "pdf/merge", time: "2026-10-06T00:00:00.000Z", ok: true };
  const lines = [
    { v: 1, id: "b", tool: "pdf/merge" }, // no inputs, outputs or time
    { ...good, inputs: "nope", settings: [1, 2], by: "hacker", outputs: [{ name: "x.pdf", size: -5, path: "../../etc/passwd" }, { name: "y.pdf", path: "files/a/y.pdf" }, { size: 1 }] },
    { ...good, id: "c", outputs: [{ name: "z", path: "C:\Windows\z" }, { name: "w", path: "/abs/w" }] },
  ].map((x) => JSON.stringify(x)).join("\n");
  const [b, a, c] = parseLog(lines);
  assert.deepEqual([b.inputs, b.outputs, b.settings, b.by], [[], [], {}, "agent"]);
  assert.equal(b.time, "1970-01-01T00:00:00.000Z");
  assert.deepEqual(a.outputs, [{ name: "x.pdf", size: 0, type: "" }, { name: "y.pdf", size: 0, type: "", path: "files/a/y.pdf" }]);
  assert.deepEqual(c.outputs.map((o) => o.path), [undefined, undefined]);
});
