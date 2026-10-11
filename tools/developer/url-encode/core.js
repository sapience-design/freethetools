// URL encoding: percent-encode and decode text, and take a full web address apart.
// "component" mode is for one part of an address (a query value, a path piece).
// "url" mode is for a whole address: it keeps the characters that give an address its shape.

const BAD_TEXT = "That text can't be encoded: it contains half of an emoji or other character pair. Remove the stray character and try again.";

/** @param {string} text @param {"component"|"url"} [mode] */
export function encode(text, mode = "component") {
  try { return mode === "url" ? encodeURI(text) : encodeURIComponent(text); }
  catch { throw new Error(BAD_TEXT); }
}

/** Describe the first broken % sequence in text, or return "" when every sequence is fine. */
function findProblem(text) {
  const half = /%(?![0-9A-Fa-f]{2})/.exec(text);
  if (half) {
    const shown = text.slice(half.index, half.index + 3);
    return `"${shown}" is not a complete % sequence. A % must be followed by two hex digits (0-9, A-F), like %20. If you meant a real % sign, write it as %25.`;
  }
  for (const run of text.match(/(?:%[0-9A-Fa-f]{2})+/g) ?? []) {
    try { decodeURIComponent(run); }
    catch { return `"${run}" is not valid text. These % codes don't form a whole character, so part of the sequence is missing or damaged. Check that none of it was cut off.`; }
  }
  return "";
}

/** @param {string} text @param {{ mode?: "component"|"url", plusAsSpace?: boolean }} [opts] */
export function decode(text, { mode = "component", plusAsSpace = false } = {}) {
  const problem = findProblem(text);
  if (problem) throw new Error(problem);
  const src = plusAsSpace ? text.replace(/\+/g, " ") : text;
  try { return mode === "url" ? decodeURI(src) : decodeURIComponent(src); }
  catch { throw new Error("That text has a broken % sequence. Check each % is followed by two hex digits."); }
}

// Decode for display: never throws, and marks whether the text was readable.
function soften(raw, plusAsSpace) {
  try { return { text: decodeURIComponent(plusAsSpace ? raw.replace(/\+/g, " ") : raw), ok: true }; }
  catch { return { text: raw, ok: false }; }
}

/**
 * Split a full web address into parts, with every part decoded.
 * @param {string} text
 */
export function parseUrl(text) {
  const raw = text.trim();
  let u;
  try { u = new URL(raw); }
  catch {
    throw new Error(/^[a-z][a-z0-9+.-]*:/i.test(raw) || !raw
      ? "That isn't a web address this tool can read. Check it for spaces or missing parts."
      : "That isn't a full web address. Start it with a protocol, such as https://.");
  }
  const params = u.search.length > 1
    ? u.search.slice(1).split("&").filter(Boolean).map((pair) => {
        const eq = pair.indexOf("=");
        const k = soften(eq < 0 ? pair : pair.slice(0, eq), true);
        const v = soften(eq < 0 ? "" : pair.slice(eq + 1), true);
        return { name: k.text, value: v.text, valid: k.ok && v.ok };
      })
    : [];
  const path = soften(u.pathname, false);
  const hash = u.hash.length > 1 ? soften(u.hash.slice(1), false) : { text: "", ok: true };
  const user = u.username ? soften(u.username, false).text : "";
  const parts = [
    { name: "Protocol", value: u.protocol.replace(/:$/, "") },
    ...(user ? [{ name: "User name", value: user }] : []),
    { name: "Host", value: u.hostname },
    ...(u.port ? [{ name: "Port", value: u.port }] : []),
    { name: "Path", value: path.text },
    ...(hash.text ? [{ name: "Fragment", value: hash.text }] : []),
  ];
  return { parts, params, warning: path.ok && hash.ok && params.every((p) => p.valid) ? "" : "Some parts have a broken % sequence, so they are shown as written." };
}
