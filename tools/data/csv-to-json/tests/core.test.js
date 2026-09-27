import test from "node:test";
import assert from "node:assert/strict";
import { csvToJson, jsonToCsv } from "../core.js";

test("uses the header row as keys and keeps values as text by default", () => {
  const r = csvToJson("name,age\nAda,36\nAlan,41");
  assert.deepEqual(JSON.parse(r.json), [{ name: "Ada", age: "36" }, { name: "Alan", age: "41" }]);
  assert.equal(r.rows, 2);
});

test("detects semicolons and converts numbers on request", () => {
  const r = csvToJson("name;age\nAda;36", { typed: true });
  assert.equal(r.delimiter, ";");
  assert.deepEqual(JSON.parse(r.json), [{ name: "Ada", age: 36 }]);
});

test("handles quoted commas and newlines", () => {
  const r = csvToJson('city,note\n"Oslo, Norway","two\nlines"');
  assert.deepEqual(JSON.parse(r.json), [{ city: "Oslo, Norway", note: "two\nlines" }]);
});

test("goes back from JSON to CSV", () => {
  assert.equal(jsonToCsv('[{"a":1,"b":"x,y"}]'), 'a,b\r\n1,"x,y"');
  assert.throws(() => jsonToCsv('{"a":1}'), /JSON array/);
});
