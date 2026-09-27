// JSON Formatter: validate, pretty-print, minify and sort keys, with errors that point at the problem.

/**
 * Find where JSON first goes wrong, as a character offset. Browsers word JSON.parse errors
 * differently and recent ones omit the position, so we scan the text ourselves.
 * @returns {number | null}
 */
function errorOffset(text) {
  let i = 0;
  const WS = " \t\n\r";
  const ws = () => { while (i < text.length && WS.includes(text[i])) i++; };
  const fail = () => { throw i; };
  const lit = (w) => { if (text.startsWith(w, i)) i += w.length; else fail(); };
  function str() {
    i++;
    while (i < text.length && text[i] !== '"') {
      if (text[i] === "\\") {
        i++;
        if (text[i] === "u") { if (!/^[0-9a-fA-F]{4}$/.test(text.slice(i + 1, i + 5))) fail(); i += 4; }
        else if (!'"\\/bfnrt'.includes(text[i])) fail();
      } else if (text.charCodeAt(i) < 0x20) fail();
      i++;
    }
    if (text[i] !== '"') fail();
    i++;
  }
  function num() {
    const m = text.slice(i).match(/^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/);
    if (!m || !m[0]) fail();
    i += m[0].length;
  }
  function val() {
    ws();
    const c = text[i];
    if (c === "{") {
      i++; ws();
      if (text[i] === "}") { i++; return; }
      for (;;) {
        ws(); if (text[i] !== '"') fail(); str(); ws();
        if (text[i] !== ":") fail(); i++; val(); ws();
        if (text[i] === ",") { i++; continue; }
        if (text[i] === "}") { i++; return; }
        fail();
      }
    }
    if (c === "[") {
      i++; ws();
      if (text[i] === "]") { i++; return; }
      for (;;) {
        val(); ws();
        if (text[i] === ",") { i++; continue; }
        if (text[i] === "]") { i++; return; }
        fail();
      }
    }
    if (c === '"') return str();
    if (c === "t") return lit("true");
    if (c === "f") return lit("false");
    if (c === "n") return lit("null");
    return num();
  }
  try { val(); ws(); if (i < text.length) fail(); return null; }
  catch (pos) { return typeof pos === "number" ? pos : null; }
}

function locate(text) {
  const pos = errorOffset(text);
  if (pos === null) return null;
  const before = text.slice(0, pos);
  return { line: before.split("\n").length, column: pos - before.lastIndexOf("\n") };
}

function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]));
  return v;
}

/**
 * @param {string} text
 * @param {{ indent?: number | "tab" | 0, sort?: boolean }} [opts] indent 0 means minify
 * @returns {{ ok: true, output: string } | { ok: false, error: string, line?: number, column?: number }}
 */
export function formatJson(text, opts = {}) {
  const { indent = 2, sort = false } = opts;
  if (!text.trim()) return { ok: false, error: "Paste some JSON to format." };
  try {
    let value = JSON.parse(text);
    if (sort) value = sortKeys(value);
    const space = indent === "tab" ? "\t" : indent;
    return { ok: true, output: JSON.stringify(value, null, space || undefined) };
  } catch (e) {
    const where = locate(text);
    return { ok: false, error: `Not valid JSON: ${String(e.message).split(",")[0]}`, ...(where ?? {}) };
  }
}
