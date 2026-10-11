import test from "node:test";
import assert from "node:assert/strict";
import { encode, decode, parseUrl } from "../core.js";

test("encodes spaces, accents and emoji as UTF-8", () => {
  assert.equal(encode("a b"), "a%20b");
  assert.equal(encode("café"), "caf%C3%A9");
  assert.equal(encode("👍"), "%F0%9F%91%8D");
});

test("component mode escapes address characters, whole-URL mode keeps them", () => {
  const url = "https://example.com/a b?q=x&y=1#top";
  assert.equal(encode(url, "component"), "https%3A%2F%2Fexample.com%2Fa%20b%3Fq%3Dx%26y%3D1%23top");
  assert.equal(encode(url, "url"), "https://example.com/a%20b?q=x&y=1#top");
});

test("+ is encoded as %2B in component mode and left alone in whole-URL mode", () => {
  assert.equal(encode("1+1"), "1%2B1");
  assert.equal(encode("1+1", "url"), "1+1");
});

test("text that is already encoded is encoded again, so % becomes %25", () => {
  assert.equal(encode("a%20b"), "a%2520b");
  assert.equal(decode(encode("a%20b")), "a%20b");
});

test("a lone surrogate gives a plain error", () => {
  assert.throws(() => encode("\ud83d"), /can't be encoded/);
});

test("decodes in both modes and round-trips", () => {
  const s = "ünï cödé 👍 & 100% = ok";
  assert.equal(decode(encode(s)), s);
  assert.equal(decode("%2F%3F%20", { mode: "component" }), "/? ");
  assert.equal(decode("a%2Fb%20c", { mode: "url" }), "a%2Fb c");
});

test("+ is a space only when asked", () => {
  assert.equal(decode("a+b%2Bc"), "a+b+c");
  assert.equal(decode("a+b%2Bc", { plusAsSpace: true }), "a b+c");
});

test("a broken % sequence names the problem", () => {
  assert.throws(() => decode("%E0%A4%A"), /"%A" is not a complete % sequence/);
  assert.throws(() => decode("100%"), /"%" is not a complete/);
  assert.throws(() => decode("50% off"), /"% o" is not a complete/);
  assert.throws(() => decode("%E0%A4"), /"%E0%A4" is not valid text/);
  assert.throws(() => decode("%FF"), /"%FF" is not valid text/);
});

test("takes an address apart", () => {
  const r = parseUrl("https://user@example.com:8080/caf%C3%A9/a%20b?q=hello+world&tag=%F0%9F%91%8D&flag#top");
  const get = (n) => r.parts.find((p) => p.name === n)?.value;
  assert.equal(get("Protocol"), "https");
  assert.equal(get("Host"), "example.com");
  assert.equal(get("Port"), "8080");
  assert.equal(get("User name"), "user");
  assert.equal(get("Path"), "/café/a b");
  assert.equal(get("Fragment"), "top");
  assert.deepEqual(r.params.map((p) => [p.name, p.value]), [["q", "hello world"], ["tag", "👍"], ["flag", ""]]);
  assert.equal(r.warning, "");
});

test("an address with no query has no parameters", () => {
  assert.deepEqual(parseUrl("https://example.com").params, []);
});

test("a broken % in an address is shown as written with a warning", () => {
  const r = parseUrl("https://example.com/?q=%E0%A4%A");
  assert.equal(r.params[0].value, "%E0%A4%A");
  assert.match(r.warning, /broken % sequence/);
});

test("explains an address that cannot be read", () => {
  assert.throws(() => parseUrl("example.com/path"), /Start it with a protocol/);
  assert.throws(() => parseUrl(""), /can read/);
  assert.throws(() => parseUrl("https://"), /can read/);
});
