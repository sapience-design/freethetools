import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { hashText, hash } from "../core.js";

const node = (alg, s) => createHash(alg).update(s).digest("hex");

test("known test vectors", async () => {
  assert.equal(await hashText("abc", "SHA-256"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(await hashText("", "MD5"), "d41d8cd98f00b204e9800998ecf8427e");
  assert.equal(await hashText("The quick brown fox jumps over the lazy dog", "MD5"), "9e107d9d372bb6826bd81d3542a419d6");
});

test("matches Node's own hashes for every algorithm and several lengths", async () => {
  const map = { "SHA-1": "sha1", "SHA-256": "sha256", "SHA-384": "sha384", "SHA-512": "sha512", MD5: "md5" };
  for (const s of ["", "a", "æøå 👍", "x".repeat(55), "x".repeat(56), "x".repeat(64), "y".repeat(1000)]) {
    for (const [alg, n] of Object.entries(map)) assert.equal(await hashText(s, alg), node(n, s), `${alg} of ${s.length} chars`);
  }
});

test("hashes raw bytes", async () => {
  const bytes = Uint8Array.from([0, 1, 2, 255]);
  assert.equal(await hash(bytes, "SHA-256"), createHash("sha256").update(bytes).digest("hex"));
});

test("an unknown algorithm lists the valid ones", async () => {
  await assert.rejects(() => hashText("abc", "SHA-3"), /Unknown algorithm "SHA-3"\. Use one of: SHA-256, SHA-512, SHA-384, SHA-1, MD5\./);
});
