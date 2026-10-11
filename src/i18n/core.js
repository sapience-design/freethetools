// Language helpers with no imports, so the site, the browser, the build checks and the review sheet
// share them. See docs/adr/0014-languages.md.

export const DEFAULT_LANG = "en";
/** The languages we plan, in switcher order. A language is live when src/i18n/<code>.json exists. */
export const LANG_ORDER = ["en", "nb", "uk", "ru", "es", "de", "pt", "fr", "ja"];
export const LANG_CODE = /^[a-z]{2,3}$/;

/** Every string in a nested object, as { "a.b.c": "text" }. Arrays use their index: "a.0". */
export function flatten(value, prefix = "", out = {}) {
  if (typeof value === "string") out[prefix] = value;
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  }
  return out;
}

/** Replace {name} with vars.name. A placeholder with no value stays as written. */
export function fill(text, vars = {}) {
  return text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

/**
 * Split a string at {slots}: "Or {ask}, or {sponsor}." gives ["Or ", {slot:"ask"}, ", or ", ...].
 * Templates put a link or a tag where the slot is, so a translator can move it in the sentence.
 */
export function slots(text) {
  return text.split(/(\{\w+\})/).filter(Boolean).map((p) => (/^\{\w+\}$/.test(p) ? { slot: p.slice(1, -1) } : p));
}

/** The plural form for a count in a language: "one", "few", "many", "other"... */
export function pluralForm(lang, n) {
  try { return new Intl.PluralRules(lang).select(n); } catch { return n === 1 ? "one" : "other"; }
}

/**
 * Look a key up in a flat dictionary, then in the fallback (English). Throws for a key neither
 * has, so a typo fails the build instead of showing on a page.
 */
export function lookup(flat, fallback, key) {
  const v = flat[key] ?? fallback[key];
  if (v === undefined) throw new Error(`i18n: unknown key "${key}"`);
  return v;
}

/** A plural key: "tools" resolves to tools.one, tools.few, ..., with tools.other as the last resort. */
export function lookupPlural(flat, fallback, lang, key, n) {
  const form = pluralForm(lang, n);
  const own = flat[`${key}.${form}`] ?? flat[`${key}.other`];
  if (own !== undefined) return own;
  const f = fallback[`${key}.${pluralForm(DEFAULT_LANG, n)}`] ?? fallback[`${key}.other`];
  if (f === undefined) throw new Error(`i18n: unknown plural key "${key}"`);
  return f;
}

/** The address of a page in a language. English has no prefix. */
export const localePath = (lang, path) => (lang === DEFAULT_LANG ? path : `/${lang}${path === "/" ? "/" : path}`);

/** { lang, path } for an address: "/nb/pdf/" gives { lang: "nb", path: "/pdf/" }. */
export function splitPath(pathname, langs) {
  for (const l of langs) {
    if (l === DEFAULT_LANG) continue;
    if (pathname === `/${l}` || pathname === `/${l}/`) return { lang: l, path: "/" };
    if (pathname.startsWith(`/${l}/`)) return { lang: l, path: pathname.slice(l.length + 1) };
  }
  return { lang: DEFAULT_LANG, path: pathname };
}

/** Sort language codes into switcher order; unknown codes go last, alphabetically. */
export const sortLangs = (codes) =>
  [...codes].sort((a, b) => {
    const ia = LANG_ORDER.indexOf(a), ib = LANG_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });

/**
 * Compare two flat dictionaries. `extra` keys are in the translation but not in English (an error);
 * `missing` keys are in English but not in the translation (a warning, English is shown instead).
 * A plural key is missing only if its "other" form is, since each language has its own forms.
 */
export function compareKeys(en, tr) {
  const extra = Object.keys(tr).filter((k) => !(k in en));
  const missing = Object.keys(en).filter((k) => !(k in tr));
  // Forms a language does not use (en has one/other; ru has one/few/many/other) are not "extra" when
  // the base key has an English plural form.
  const pluralBases = new Set(Object.keys(en).filter((k) => /\.(one|other)$/.test(k)).map((k) => k.replace(/\.[a-z]+$/, "")));
  return {
    extra: extra.filter((k) => !(/\.(zero|one|two|few|many|other)$/.test(k) && pluralBases.has(k.replace(/\.[a-z]+$/, "")))),
    missing,
  };
}
