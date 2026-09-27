import test from "node:test";
import assert from "node:assert/strict";
import { encodeText, decodeText, bytesToBase64, base64ToBytes } from "../core.js";

test("round-trips UTF-8 text, including emoji and Norwegian letters", () => {
  const s = "Free the Tools 👍 æøå";
  assert.equal(decodeText(encodeText(s)), s);
  assert.equal(encodeText("hi"), "aGk=");
});

test("URL-safe output drops padding and uses - and _", () => {
  const bytes = Uint8Array.from([251, 255, 191]);
  assert.equal(bytesToBase64(bytes), "+/+/");
  assert.equal(bytesToBase64(bytes, true), "-_-_");
  assert.deepEqual([...base64ToBytes("-_-_")], [251, 255, 191]);
});

test("accepts missing padding and whitespace", () => {
  assert.equal(decodeText("aGVs\nbG8"), "hello");
});

test("explains bad input and binary output", () => {
  assert.throws(() => decodeText("not base64!"), /isn't valid Base64/);
  assert.throws(() => decodeText(bytesToBase64(Uint8Array.from([0xff, 0xfe, 0xfd]))), /binary data/);
});

test("handles large inputs", () => {
  const big = new Uint8Array(300000).map((_, i) => i % 256);
  assert.deepEqual(base64ToBytes(bytesToBase64(big)), big);
});
