import test from "node:test";
import assert from "node:assert/strict";
import { checkArgs, wireSchema, files, file } from "./contract.js";
import { groupBursts, resolveArgs, resolveFileArg, snapshotSettings, wireFile, MAX_INLINE_BYTES } from "./page-helpers.js";

test("settings snapshot keys by label and never keeps text", () => {
  const s = snapshotSettings([
    { type: "checkbox", label: "Keep page 1 only", checked: true },
    { type: "checkbox", label: "Strip metadata", checked: false },
    { type: "radio", label: "Smallest", group: "Quality", checked: false },
    { type: "radio", label: "Balanced", group: "Quality", checked: true },
    { type: "select", label: "Format", value: "PNG" },
    { type: "number", label: "Width", value: "800" },
    { type: "number", label: "Height", value: "" },
    { type: "text", label: "Prefix", value: "scan" },
    { type: "text", label: "Long", value: "x".repeat(200) },
    { type: "password", label: "Password", value: "secret" },
    { type: "text", label: "Prefix", value: "again" },
  ]);
  assert.deepEqual(s, { "Keep page 1 only": true, "Strip metadata": false, Quality: "Balanced", Format: "PNG", Width: 800 });
});

test("bursts group downloads made close together", () => {
  const g = groupBursts([{ t: 0 }, { t: 100 }, { t: 300 }, { t: 5000 }, { t: 5100 }], 600);
  assert.deepEqual(g.map((x) => x.length), [3, 2]);
  assert.deepEqual(groupBursts([]), []);
});

const onPage = [
  { name: "a.pdf", size: 3, read: async () => Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d]) },
  { name: "a.pdf", size: 5, read: async () => Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 1]) },
];

test("a file name resolves to the newest file with that name", async () => {
  const f = await resolveFileArg("a.pdf", onPage);
  assert.equal(f.type, "application/pdf");
  assert.equal(f.bytes.length, 6);
});

test("an unknown name lists what is on the page", async () => {
  await assert.rejects(resolveFileArg("b.pdf", onPage), /Files here: a\.pdf/);
  await assert.rejects(resolveFileArg("b.pdf", []), /list_page_files/);
});

test("inline base64 works and is capped", async () => {
  const f = await resolveFileArg({ name: "x.txt", base64: Buffer.from("hello").toString("base64") }, []);
  assert.equal(new TextDecoder().decode(f.bytes), "hello");
  assert.equal(f.type, "text/plain");
  await assert.rejects(resolveFileArg({ name: "big.bin", base64: "A".repeat(Math.ceil((MAX_INLINE_BYTES * 4) / 3) + 8) }, []), /too big/);
  await assert.rejects(resolveFileArg(42, []), /name of a file/);
});

test("wire schema accepts a name or an object and rejects other things", () => {
  const schema = { type: "object", properties: { files: files("PDFs", ["application/pdf"], 2), file: file("One") }, required: ["files"] };
  const wire = wireSchema(schema, wireFile);
  assert.deepEqual(checkArgs(wire, { files: ["a.pdf", { name: "b.pdf", base64: "AAAA" }] }), []);
  assert.ok(checkArgs(wire, { files: ["a.pdf", { name: "b.pdf" }] }).length > 0);
  assert.ok(checkArgs(wire, { files: ["a.pdf", 7] }).length > 0);
});

test("resolveArgs resolves file fields and leaves settings alone", async () => {
  const schema = { type: "object", properties: { files: files("PDFs"), fileName: { type: "string" } } };
  const r = await resolveArgs(schema, { files: ["a.pdf", "a.pdf"], fileName: "m.pdf" }, onPage);
  assert.equal(r.args.fileName, "m.pdf");
  assert.equal(r.inputs.length, 2);
});
