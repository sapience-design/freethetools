// The site's languages and interface strings, for pages at build time. The pure helpers are in
// ./core.js. A language exists when src/i18n/<code>.json exists (docs/adr/0014-languages.md).
import { DEFAULT_LANG, LANG_CODE, compareKeys, fill, flatten, localePath, lookup, lookupPlural, sortLangs } from "./core.js";
export { DEFAULT_LANG, localePath, slots, splitPath, fill } from "./core.js";

type Meta = { name: string; dir: "ltr" | "rtl"; locale: string; reviewed: boolean };
type LangFile = {
  meta: Meta;
  ui: Record<string, unknown>;
  /** { pdf: { name, label, title, blurb, sub } } */
  groups?: Record<string, { name: string; label: string; title: string; blurb: string; sub: string }>;
  /** { Optimize: "Optimaliser" } by the English section name */
  sections?: Record<string, string>;
  /** { "pdf/page-delete": { name, task, blurb, concept: { in, out, options } } } */
  wanted?: Record<string, { name: string; task: string; blurb: string; concept: { in: string; out: string; options: string[] } }>;
  /** { "pdf/compress": "For email or an upload limit" } */
  popular?: Record<string, string>;
  search?: { synonyms?: string[][]; stop?: string[] };
};
export type Lang = Meta & { code: string };

const files = import.meta.glob<LangFile>("./*.json", { eager: true, import: "default" });
const data: Record<string, LangFile> = {};
for (const [path, file] of Object.entries(files)) {
  const code = path.replace(/^\.\/(.+)\.json$/, "$1");
  if (!LANG_CODE.test(code)) throw new Error(`src/i18n/${code}.json: a language code is two or three lower-case letters.`);
  for (const k of ["name", "dir", "locale", "reviewed"] as const) if (!(k in (file.meta ?? {}))) throw new Error(`src/i18n/${code}.json: meta.${k} is missing.`);
  data[code] = file;
}
if (!data[DEFAULT_LANG]) throw new Error("src/i18n/en.json is missing.");

const flat: Record<string, Record<string, string>> = {};
for (const [code, file] of Object.entries(data)) flat[code] = flatten(file.ui);

// A key a translation has and English lacks is a typo or a leftover: stop the build.
for (const code of Object.keys(data)) {
  if (code === DEFAULT_LANG) continue;
  const { extra } = compareKeys(flat[DEFAULT_LANG], flat[code]);
  if (extra.length) throw new Error(`src/i18n/${code}.json has keys that src/i18n/en.json does not: ${extra.join(", ")}`);
}

export const LANGS: Lang[] = sortLangs(Object.keys(data)).map((code) => ({ code, ...data[code].meta }));
export const OTHER_LANGS = LANGS.filter((l) => l.code !== DEFAULT_LANG);
export const langOf = (code: string): Lang => LANGS.find((l) => l.code === code) ?? LANGS[0];
export const langFile = (code: string): LangFile => data[code] ?? data[DEFAULT_LANG];

/** An interface string, in English when the language lacks it. {name} placeholders come from vars. */
export function t(lang: string, key: string, vars: Record<string, string | number> = {}): string {
  return fill(lookup(flat[lang] ?? {}, flat[DEFAULT_LANG], `${key}`), vars);
}

/** A string that depends on a count: key.one, key.few, key.other ... {n} is the count. */
export function tn(lang: string, key: string, n: number, vars: Record<string, string | number> = {}): string {
  return fill(lookupPlural(flat[lang] ?? {}, flat[DEFAULT_LANG], lang, key, n), { n, ...vars });
}

/** Every string under ui.js.<section>, with English filling gaps, for the page to embed. */
export function jsStrings(lang: string, section: string): Record<string, string> {
  const prefix = `js.${section}.`;
  const out: Record<string, string> = {};
  for (const src of [flat[DEFAULT_LANG], flat[lang] ?? {}]) for (const [k, v] of Object.entries(src)) if (k.startsWith(prefix)) out[k.slice(prefix.length)] = v;
  return out;
}

/** The warnings for the build log: strings a language has not translated yet. */
export function missingKeys(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const code of Object.keys(data)) if (code !== DEFAULT_LANG) out[code] = compareKeys(flat[DEFAULT_LANG], flat[code]).missing;
  return out;
}

