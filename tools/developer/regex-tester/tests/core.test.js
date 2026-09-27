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
