import test from "node:test";
import assert from "node:assert/strict";
import { compare } from "../core.js";

test("finds added and removed lines", () => {
  const r = compare("one\ntwo\nthree\n", "one\n2\nthree\nfour\n");
  assert.equal(r.removed, 1);
  assert.equal(r.added, 2);
  assert.ok(r.parts.some((p) => p.removed && p.value === "two\n"));
});

test("word mode marks single changed words", () => {
  const r = compare("free the tools", "free all tools", "words");
  assert.deepEqual(r.parts.filter((p) => p.added || p.removed).map((p) => [p.added ? "+" : "-", p.value]), [["-", "the"], ["+", "all"]]);
});

test("identical texts have no changes", () => {
  const r = compare("same\n", "same\n");
  assert.equal(r.added + r.removed, 0);
});
