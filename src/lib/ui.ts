// Words that scripts show, in the language of the page. The page embeds them as JSON in
// <script type="application/json" id="..."> (Base.astro, and the pages with their own). Every call
// gives an English fallback, so a script still works if the block is missing.
import { fill, pluralForm } from "../i18n/core.js";

const cache = new Map<string, Record<string, string>>();
function strings(id: string): Record<string, string> {
  let s = cache.get(id);
  if (!s) {
    try { s = JSON.parse(document.getElementById(id)?.textContent || "{}"); } catch { s = {}; }
    cache.set(id, s!);
  }
  return s!;
}

/** The language of the page: <html lang>. */
export const pageLang = () => document.documentElement.lang || "en";

/** The text for a key, or the English fallback. {name} placeholders come from vars. */
export function txt(key: string, fallback: string, vars: Record<string, string | number> = {}, id = "ftt-ui"): string {
  return fill(strings(id)[key] ?? fallback, vars);
}

/** A text that depends on a count: key.one, key.few, key.other ... {n} is the count. */
export function txtN(key: string, n: number, fallback: { one: string; other: string }, vars: Record<string, string | number> = {}, id = "ftt-ui"): string {
  const s = strings(id);
  const form = pluralForm(pageLang(), n);
  const text = s[`${key}.${form}`] ?? s[`${key}.other`] ?? (n === 1 ? fallback.one : fallback.other);
  return fill(text, { n, ...vars });
}
