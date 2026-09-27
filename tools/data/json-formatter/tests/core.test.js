import test from "node:test";
import assert from "node:assert/strict";
import { formatJson } from "../core.js";

test("pretty-prints with two spaces by default", () => {
  assert.deepEqual(formatJson('{"a":1,"b":[1,2]}'), { ok: true, output: '{\n  "a": 1,\n  "b": [\n    1,\n    2\n  ]\n}' });
});

test("minifies with indent 0 and uses tabs on request", () => {
  assert.equal(formatJson('{ "a" : 1 }', { indent: 0 }).output, '{"a":1}');
  assert.equal(formatJson('{"a":1}', { indent: "tab" }).output, '{\n\t"a": 1\n}');
});

test("sorts keys deeply", () => {
  assert.equal(formatJson('{"b":1,"a":{"d":1,"c":2}}', { indent: 0, sort: true }).output, '{"a":{"c":2,"d":1},"b":1}');
});

test("reports errors with a line number", () => {
  const r = formatJson('{\n  "a": 1,\n  "b": \n}');
  assert.equal(r.ok, false);
  assert.match(r.error, /Not valid JSON/);
  assert.equal(r.line, 4);
});

test("empty input asks for JSON", () => {
  assert.match(formatJson("  ").error, /Paste some JSON/);
});
