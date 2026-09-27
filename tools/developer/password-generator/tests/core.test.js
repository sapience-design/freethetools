import test from "node:test";
import assert from "node:assert/strict";
import { password, passphrase, strength, randomInt } from "../core.js";
import { WORDS } from "../words.js";

test("passwords have the length and include every chosen kind", () => {
  for (let i = 0; i < 100; i++) {
    const { value } = password({ length: 16 });
    assert.equal(value.length, 16);
    assert.match(value, /[a-z]/);
    assert.match(value, /[A-Z]/);
    assert.match(value, /[0-9]/);
    assert.match(value, /[^A-Za-z0-9]/);
  }
});

test("look-alike characters are left out by default", () => {
  for (let i = 0; i < 50; i++) assert.doesNotMatch(password({ length: 64 }).value, /[lIO01]/);
});

test("entropy and strength labels", () => {
  assert.equal(password({ length: 20, symbols: false, digits: false, upper: false }).bits, Math.round(20 * Math.log2(25)));
  assert.equal(strength(40), "Weak");
  assert.equal(strength(128), "Very strong");
});

test("passphrases use real words", () => {
  const { value, bits } = passphrase(WORDS, { count: 6, separator: " " });
  assert.equal(value.split(" ").length, 6);
  assert.ok(value.split(" ").every((w) => WORDS.includes(w)));
  assert.equal(bits, Math.round(6 * Math.log2(WORDS.length)));
});

test("random integers stay in range and cover it", () => {
  const seen = new Set(Array.from({ length: 2000 }, () => randomInt(7)));
  assert.deepEqual([...seen].sort(), [0, 1, 2, 3, 4, 5, 6]);
});

test("explains impossible options", () => {
  assert.throws(() => password({ lower: false, upper: false, digits: false, symbols: false }), /at least one kind/);
  assert.throws(() => passphrase(WORDS, { count: 2 }), /3 to 12/);
});
