import test from "node:test";
import assert from "node:assert/strict";
import { countWords, stats } from "../core.js";

test("counts words across any whitespace and punctuation", () => {
  assert.equal(countWords("Free the  tools.\nNothing uploaded!"), 5);
  assert.equal(countWords("   "), 0);
});

test("counts characters as people see them, emoji included", () => {
  const s = stats("👍🏽 ok");
  assert.equal(s.characters, 4);
  assert.equal(s.charactersNoSpaces, 3);
});

test("counts sentences and paragraphs", () => {
  const s = stats("One. Two? Three!\n\nNew paragraph here");
  assert.equal(s.sentences, 4);
  assert.equal(s.paragraphs, 2);
});

test("reading time is at least a minute once there are words", () => {
  assert.equal(stats("hello").readingMinutes, 1);
  assert.equal(stats("").readingMinutes, 0);
  assert.equal(stats("word ".repeat(476)).readingMinutes, 2);
});
