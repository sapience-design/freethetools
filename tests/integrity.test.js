// Unit test for the hashing helper in scripts/build-integrity.mjs (no build needed).
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hashTree, sha256 } from "../scripts/build-integrity.mjs";

test("sha256 matches a known value", () => {
  assert.equal(sha256("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("hashTree sorts paths, uses forward slashes and leaves out integrity.json", () => {
  const dir = mkdtempSync(join(tmpdir(), "integrity-"));
  try {
    mkdirSync(join(dir, "b"));
    writeFileSync(join(dir, "z.txt"), "z");
    writeFileSync(join(dir, "b", "a.txt"), "a");
    writeFileSync(join(dir, "integrity.json"), "{}");
    const files = hashTree(dir);
    assert.deepEqual(Object.keys(files), ["b/a.txt", "z.txt"]);
    assert.equal(files["z.txt"], sha256("z"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
