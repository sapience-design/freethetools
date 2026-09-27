import test from "node:test";
import assert from "node:assert/strict";
import { uuidV4, uuidV7, generate, UUID_RE } from "../core.js";

test("v4 has the right shape, version and variant", () => {
  for (let i = 0; i < 200; i++) {
    const id = uuidV4();
    assert.match(id, UUID_RE);
    assert.equal(id[14], "4");
    assert.ok("89ab".includes(id[19]));
  }
});

test("v7 encodes the timestamp and sorts by time", () => {
  const t = 1759000000000;
  const id = uuidV7(t);
  assert.equal(id[14], "7");
  assert.equal(parseInt(id.replace(/-/g, "").slice(0, 12), 16), t);
  assert.ok(uuidV7(t) < uuidV7(t + 1));
});

test("generates many unique ids with styles applied", () => {
  const ids = generate("v4", 500);
  assert.equal(new Set(ids).size, 500);
  const [styled] = generate("v7", 1, { upper: true, braces: true, hyphens: false });
  assert.match(styled, /^\{[0-9A-F]{32}\}$/);
});

test("clamps the count between 1 and 1000", () => {
  assert.equal(generate("v4", 0).length, 1);
  assert.equal(generate("v4", 5000).length, 1000);
});
