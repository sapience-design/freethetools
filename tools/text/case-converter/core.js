// Case Converter: the common cases, plus the programmer ones.

const SMALL = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "in", "nor", "of", "on", "or", "so", "the", "to", "up", "yet"]);
const words = (s) => s.replace(/([a-z0-9])([A-Z])/g, "$1 $2").split(/[^\p{L}\p{N}]+/u).filter(Boolean);

export const CASES = {
  upper: (s) => s.toLocaleUpperCase(),
  lower: (s) => s.toLocaleLowerCase(),
  sentence: (s) => s.toLocaleLowerCase().replace(/(^\s*\p{L}|[.!?]\s+\p{L})/gu, (m) => m.toLocaleUpperCase()),
  title: (s) =>
    s.toLocaleLowerCase().replace(/\p{L}[\p{L}'’]*/gu, (w, i) => (i > 0 && SMALL.has(w) ? w : w[0].toLocaleUpperCase() + w.slice(1))),
  camel: (s) => words(s).map((w, i) => (i ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase())).join(""),
  pascal: (s) => words(s).map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(""),
  snake: (s) => words(s).map((w) => w.toLowerCase()).join("_"),
  kebab: (s) => words(s).map((w) => w.toLowerCase()).join("-"),
  constant: (s) => words(s).map((w) => w.toUpperCase()).join("_"),
};

/** @param {string} text @param {keyof typeof CASES} kind */
export function convert(text, kind) {
  const fn = CASES[kind];
  if (!fn) throw new Error(`Unknown case "${kind}".`);
  return fn(text);
}
