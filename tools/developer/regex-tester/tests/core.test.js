import test from "node:test";
import assert from "node:assert/strict";
import { runRegex, segments } from "../core.js";

test("finds all matches with groups and named groups", () => {
  const r = runRegex("(?<user>\\w+)@(\\w+)\\.com", "g", "ada@site.com and alan@mail.com");
  assert.equal(r.matches.length, 2);
  assert.deepEqual(r.matches[0].groups, ["ada", "site"]);
  assert.deepEqual(r.matches[1].named, { user: "alan" });
});

test("without g, stops at the first match", () => {
  assert.equal(runRegex("\\d", "", "1 2 3").matches.length, 1);
});

test("reports invalid patterns without throwing", () => {
  const r = runRegex("(", "g", "x");
  assert.ok(r.error);
  assert.equal(r.matches.length, 0);
});

test("caps the number of matches", () => {
  const r = runRegex(".", "g", "x".repeat(1000), 100);
  assert.equal(r.matches.length, 100);
  assert.equal(r.truncated, true);
});

test("segments text for highlighting, skipping empty matches", () => {
  const r = runRegex("o", "g", "foo bar");
  assert.deepEqual(segments("foo bar", r.matches).map((s) => [s.text, s.match]), [["f", false], ["o", true], ["o", true], [" bar", false]]);
  assert.deepEqual(segments("ab", runRegex("x*", "g", "ab").matches), [{ text: "ab", match: false }]);
});

test("plain hint for unclosed round bracket", () => {
  const r = runRegex("(", "g", "x");
  assert.match(r.error, /an unclosed round bracket/);
});

test("plain hint for unclosed square bracket", () => {
  const r = runRegex("[", "g", "x");
  assert.match(r.error, /an unclosed square bracket/);
});

test("plain hint for pattern ending in backslash", () => {
  const r = runRegex("abc\\", "g", "x");
  assert.match(r.error, /a pattern that ends in a backslash/);
});

test("plain hint for star or plus with nothing before it", () => {
  const r = runRegex("*", "g", "x");
  assert.match(r.error, /a star or plus with nothing before it/);
  const r2 = runRegex("+", "g", "x");
  assert.match(r2.error, /a star or plus with nothing before it/);
});
