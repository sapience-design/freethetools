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

test("JSON to CSV uses the union of keys across all rows, in first-seen order", () => {
  const csv = jsonToCsv('[{"a":1,"b":2},{"a":3,"c":4}]');
  assert.equal(csv, "a,b,c\r\n1,2,\r\n3,,4");
});

test("JSON to CSV keeps nested values as JSON text and rejects a mix of objects and arrays", () => {
  assert.equal(jsonToCsv('[{"a":{"x":1},"b":[1,2]}]'), 'a,b\r\n"{""x"":1}","[1,2]"');
  assert.throws(() => jsonToCsv('[{"a":1},[1,2]]'), /mixes objects and arrays/);
  assert.throws(() => jsonToCsv("[1,2]"), /object|array/);
  assert.equal(jsonToCsv('[["a","b"],[1,2]]'), "a,b\r\n1,2");
});

test("CSV to JSON keeps empty cells on the last row (tab separated)", () => {
  const r = csvToJson("a\tb\tc\n1\t2\t3\n4\t\t", { delimiter: "\t" });
  assert.deepEqual(JSON.parse(r.json), [{ a: "1", b: "2", c: "3" }, { a: "4", b: "", c: "" }]);
});

test("JSON to CSV uses the union of keys across all rows, in first-seen order", () => {
  assert.equal(jsonToCsv('[{"a":1,"b":2},{"a":3,"c":4}]'), "a,b,c\r\n1,2,\r\n3,,4");
});

test("JSON to CSV keeps nested values as JSON text and rejects a mix of objects and arrays", () => {
  assert.equal(jsonToCsv('[{"a":{"x":1},"b":[1,2]}]'), 'a,b\r\n"{""x"":1}","[1,2]"');
  assert.throws(() => jsonToCsv('[{"a":1},[1,2]]'), /mixes objects and arrays/);
  assert.throws(() => jsonToCsv("[1,2]"), /object|array/);
  assert.equal(jsonToCsv('[["a","b"],[1,2]]'), "a,b\r\n1,2");
});

test("CSV to JSON keeps empty cells on the last row of a TSV", () => {
  const r = csvToJson("a\tb\tc\n1\t2\t3\n4\t\t", { delimiter: "\t" });
  assert.deepEqual(JSON.parse(r.json), [{ a: "1", b: "2", c: "3" }, { a: "4", b: "", c: "" }]);
});

test("CSV to JSON warns when repeated column names are renamed", () => {
  const r = csvToJson("a,a,b\n1,2,3");
  assert.deepEqual(JSON.parse(r.json), [{ a: "1", a_1: "2", b: "3" }]);
  assert.match(r.warnings.join(" "), /renamed.*a to a_1/);
});
