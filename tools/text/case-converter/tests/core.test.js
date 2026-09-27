import test from "node:test";
import assert from "node:assert/strict";
import { convert } from "../core.js";

test("everyday cases", () => {
  assert.equal(convert("free the tools", "upper"), "FREE THE TOOLS");
  assert.equal(convert("FREE The Tools", "lower"), "free the tools");
  assert.equal(convert("hello there. how ARE you? fine!", "sentence"), "Hello there. How are you? Fine!");
  assert.equal(convert("the lord of the rings", "title"), "The Lord of the Rings");
});

test("programmer cases split on spaces, punctuation and existing camelCase", () => {
  assert.equal(convert("free the tools", "camel"), "freeTheTools");
  assert.equal(convert("free-the_tools", "pascal"), "FreeTheTools");
  assert.equal(convert("freeTheTools now", "snake"), "free_the_tools_now");
  assert.equal(convert("Free The Tools", "kebab"), "free-the-tools");
  assert.equal(convert("free the tools", "constant"), "FREE_THE_TOOLS");
});

test("keeps non-English letters", () => {
  assert.equal(convert("ærlig øl", "title"), "Ærlig Øl");
});

test("rejects unknown cases", () => {
  assert.throws(() => convert("x", "wavy"), /Unknown case/);
});
