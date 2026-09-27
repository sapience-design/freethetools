// Regex Tester: run a JavaScript regular expression over text, listing matches and groups, with a
// match limit so a runaway pattern can't freeze the page.

/**
 * @param {string} pattern
 * @param {string} flags e.g. "gi"
 * @param {string} text
 * @param {number} [limit]
 */
export function runRegex(pattern, flags, text, limit = 500) {
  if (!pattern) return { matches: [], error: null, truncated: false };
  let re;
  try { re = new RegExp(pattern, flags.includes("g") ? flags : flags + "g"); }
  catch (e) { return { matches: [], error: String(e.message).replace(/^Invalid regular expression: /, ""), truncated: false }; }
  const matches = [];
  let truncated = false;
  for (const m of text.matchAll(re)) {
    if (matches.length >= limit) { truncated = true; break; }
    matches.push({ index: m.index, text: m[0], groups: m.slice(1), named: m.groups ? { ...m.groups } : null });
    if (!flags.includes("g")) break;
  }
  return { matches, error: null, truncated };
}

/** Split text into plain and matched pieces for highlighting. */
export function segments(text, matches) {
  const out = [];
  let at = 0;
  for (const m of matches) {
    if (m.text === "") continue;
    if (m.index > at) out.push({ text: text.slice(at, m.index), match: false });
    out.push({ text: m.text, match: true });
    at = m.index + m.text.length;
  }
  if (at < text.length) out.push({ text: text.slice(at), match: false });
  return out;
}
