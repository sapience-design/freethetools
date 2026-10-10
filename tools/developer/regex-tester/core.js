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
  catch (e) {
    const engine = String(e.message).replace(/^Invalid regular expression: /, "");
    const hint = plainHint(pattern, engine);
    return { matches: [], error: hint ? `${engine} (${hint})` : engine, truncated: false };
  }
  const matches = [];
  let truncated = false;
  for (const m of text.matchAll(re)) {
    if (matches.length >= limit) { truncated = true; break; }
    matches.push({ index: m.index, text: m[0], groups: m.slice(1), named: m.groups ? { ...m.groups } : null });
    if (!flags.includes("g")) break;
  }
  return { matches, error: null, truncated };
}

/** Short plain-language hint for common invalid-pattern cases. */
function plainHint(pattern, engine) {
  if (/\([^)]*$/.test(pattern) || /Unterminated group/i.test(engine)) return "an unclosed round bracket";
  if (/\[[^\]]*$/.test(pattern) || /Unterminated character class/i.test(engine)) return "an unclosed square bracket";
  if (/\\$/.test(pattern)) return "a pattern that ends in a backslash";
  if (/^\s*[*+]/.test(pattern) || /Nothing to repeat/i.test(engine)) return "a star or plus with nothing before it";
  return "";
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
