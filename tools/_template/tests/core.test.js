import test from "node:test";
import assert from "node:assert/strict";
import { run } from "../core.js";

// Test the logic in core.js with real examples. The site-wide browser tests already check
// that your page loads, stays on this site, and breaks no security rules.
test("upper-cases text", () => {
  assert.equal(run("free the tools"), "FREE THE TOOLS");
});

test("rejects things that are not text", () => {
  assert.throws(() => run(42), TypeError);
});
