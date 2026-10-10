import { test } from "node:test";
import assert from "node:assert/strict";
import { unzipSync, strFromU8 } from "fflate";
import { zipAll, uniqueNames } from "../src/lib/zip.js";

test("zipAll builds a ZIP that reads back", async () => {
  const zip = await zipAll([
    { name: "a.txt", blob: new Blob(["hello hello hello"]) },
    { name: "b.pdf", blob: new Blob([new Uint8Array([1, 2, 3])]) },
  ]);
  assert.equal(zip.type, "application/zip");
  const out = unzipSync(new Uint8Array(await zip.arrayBuffer()));
  assert.deepEqual(Object.keys(out).sort(), ["a.txt", "b.pdf"]);
  assert.equal(strFromU8(out["a.txt"]), "hello hello hello");
  assert.deepEqual([...out["b.pdf"]], [1, 2, 3]);
});

test("duplicate names get (2), (3) before the extension", async () => {
  assert.deepEqual(uniqueNames(["a.jpg", "a.jpg", "A.jpg", "x"]), ["a.jpg", "a (2).jpg", "A (3).jpg", "x"]);
  const zip = await zipAll([
    { name: "p.png", blob: new Blob(["1"]) },
    { name: "p.png", blob: new Blob(["2"]) },
  ]);
  const out = unzipSync(new Uint8Array(await zip.arrayBuffer()));
  assert.equal(strFromU8(out["p.png"]), "1");
  assert.equal(strFromU8(out["p (2).png"]), "2");
});

test("folder separators in a name cannot make folders", () => {
  assert.deepEqual(uniqueNames(["../x/y.txt"]), ["_x_y.txt"]);
});
