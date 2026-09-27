// The tool's logic, with no page code, so tests, a command-line version or an API can reuse it.
// Replace this example (it upper-cases text) with your tool's real work.

/**
 * @param {string} input
 * @returns {string}
 */
export function run(input) {
  if (typeof input !== "string") throw new TypeError("Expected text");
  return input.toUpperCase();
}
