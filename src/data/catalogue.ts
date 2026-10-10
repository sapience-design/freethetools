// Everything the pages, search and API need, built once from tool.json files and wanted.json.
import { getCollection, type CollectionEntry } from "astro:content";
import { CATEGORIES, CATEGORY_SLUGS, type Category } from "./categories";
import wanted from "./wanted.json";
import { SYNONYMS, expand } from "./synonyms.js";
import { DEFAULT_LANG, LANGS, OTHER_LANGS, langFile, missingKeys, localePath } from "../i18n/index";

export const REPO = "https://github.com/sapience-design/freethetools";
export const SITE_NAME = "Free the Tools";
export const REQUEST_URL = `${REPO}/issues/new?template=tool_request.yml`;
// Suggestions and problem reports go through our own form, which emails the maintainers.
export const SUGGEST_URL = "/suggest/";

export type ToolTexts = CollectionEntry<"toolTexts">["data"];
export type Tool = CollectionEntry<"tools"> & { category: Category; slug: string; url: string; number: string; icon: string; isNew: boolean; texts: Record<string, ToolTexts> };
export type Wanted = {
  name: string; category: string; section: string; blurb: string;
  slug: string; issue?: number; task: string; concept: { in: string; out: string; options: string[] };
  /** "group/slug": the address the tool will have, and the id votes are counted under. */
  id: string;
  /** The page for this tool-to-be, /group/slug/. */
  url: string;
  /** The GitHub issue for developers, or a search for it. */
  request: string;
  number: string;
};
export type Aisle = Category & { live: Tool[]; wanted: Wanted[]; sectionsUsed: { name: string; live: Tool[]; wanted: Wanted[] }[] };

const requestUrl = (w: { name: string; issue?: number }) =>
  w.issue
    ? `${REPO}/issues/${w.issue}`
    : `${REPO}/issues?q=${encodeURIComponent(`is:issue is:open label:wanted "${w.name}"`)}`;

// "New" marks tools added since launch week, for 45 days. Launch-day tools are not new to anyone.
const LAUNCH_WEEK_END = "2026-10-04";
const NEW_FOR_DAYS = 45;
const isNewTool = (added: string) =>
  added > LAUNCH_WEEK_END && Date.now() - Date.parse(`${added}T12:00:00Z`) < NEW_FOR_DAYS * 864e5;

/** The words of a tool in a language: its own text file where it has one, otherwise the English. */
export function toolIn(tool: Tool, lang: string) {
  const own = tool.texts[lang];
  const d = tool.data;
  if (lang === DEFAULT_LANG || !own) return { name: d.name, task: d.task, tagline: d.tagline, description: d.description, seoTitle: d.seoTitle, faq: d.faq, specs: d.specs, keywords: d.keywords };
  return { name: own.name, task: own.task, tagline: own.tagline, description: own.description, seoTitle: own.seoTitle, faq: own.faq ?? d.faq, specs: own.specs ?? d.specs, keywords: own.keywords };
}
export function groupIn(a: Category, lang: string) {
  const own = langFile(lang).groups?.[a.slug];
  return { name: own?.name ?? a.name, label: own?.label ?? a.label, title: own?.title ?? a.title, blurb: own?.blurb ?? a.blurb, sub: own?.sub ?? a.sub };
}
export const sectionIn = (lang: string, name: string) => langFile(lang).sections?.[name] ?? name;
export function wantedIn(w: Wanted, lang: string) {
  const own = langFile(lang).wanted?.[w.id];
  return { name: own?.name ?? w.name, task: own?.task ?? w.task, blurb: own?.blurb ?? w.blurb, concept: own?.concept ?? w.concept };
}
export const popularIn = (lang: string, id: string, when: string) => langFile(lang).popular?.[id] ?? when;
/** Does this wanted tool have a page in this language? */
export function hasWantedIn(lang: string, id: string) {
  return lang === DEFAULT_LANG || !!langFile(lang).wanted?.[id];
}

let checked = false;

export async function loadCatalogue() {
  const entries = await getCollection("tools");
  const textEntries = await getCollection("toolTexts");
  const tools: Tool[] = entries.map((e) => {
    const [cat, slug] = e.id.split("/");
    if (!CATEGORY_SLUGS.includes(cat)) throw new Error(`tools/${e.id}: unknown category "${cat}". Add it to src/data/categories.ts.`);
    const category = CATEGORIES.find((c) => c.slug === cat)!;
    if (!(category.sections as readonly string[]).includes(e.data.section))
      throw new Error(`tools/${e.id}: section "${e.data.section}" is not one of ${category.sections.join(", ")}.`);
    return { ...e, category, slug, url: `/${e.id}/`, number: "", icon: e.data.icon ?? category.mark, isNew: isNewTool(e.data.added), texts: {} };
  });

  // Translated tool texts (tools/<group>/<slug>/i18n/<lang>.json): each must belong to a tool and a
  // language that has a file in src/i18n/, and match the English FAQ and spec table in length.
  for (const e of textEntries) {
    const [cat, slug, lang] = e.id.split("/");
    const tool = tools.find((x) => x.id === `${cat}/${slug}`);
    if (!tool) throw new Error(`tools/${cat}/${slug}/i18n/${lang}.json: there is no tool ${cat}/${slug}.`);
    if (!LANGS.some((l) => l.code === lang && l.code !== DEFAULT_LANG)) throw new Error(`tools/${tool.id}/i18n/${lang}.json: add src/i18n/${lang}.json first (English text stays in tool.json).`);
    if (e.data.faq && e.data.faq.length !== tool.data.faq.length) throw new Error(`tools/${tool.id}/i18n/${lang}.json: faq has ${e.data.faq.length} entries, tool.json has ${tool.data.faq.length}.`);
    if (e.data.specs && Object.keys(e.data.specs).length !== Object.keys(tool.data.specs).length) throw new Error(`tools/${tool.id}/i18n/${lang}.json: specs has ${Object.keys(e.data.specs).length} entries, tool.json has ${Object.keys(tool.data.specs).length}.`);
    tool.texts[lang] = e.data;
  }

  // A wanted tool has the address it will have once built. If a real tool already has it, the
  // entry is out of date and must be removed from src/data/wanted.json.
  const seen = new Set<string>();
  for (const w of wanted) {
    const id = `${w.category}/${w.slug}`;
    if (!CATEGORY_SLUGS.includes(w.category)) throw new Error(`wanted.json: "${w.name}" has unknown group "${w.category}".`);
    if (!CATEGORIES.find((c) => c.slug === w.category)!.sections.includes(w.section as never)) throw new Error(`wanted.json: "${w.name}" has section "${w.section}", which "${w.category}" does not have.`);
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(w.slug)) throw new Error(`wanted.json: "${w.name}" has a bad slug "${w.slug}". Use lower-case words joined by hyphens.`);
    if (tools.some((t) => t.id === id)) throw new Error(`wanted.json: "${w.name}" is now a real tool at /${id}/. Remove its entry from src/data/wanted.json.`);
    if (seen.has(id)) throw new Error(`wanted.json: two entries share the address /${id}/.`);
    seen.add(id);
  }

  // Language files: names that point at nothing are mistakes (the build stops); things not yet
  // translated are warnings, and English shows instead.
  const wantedIds = new Set(wanted.map((w) => `${w.category}/${w.slug}`));
  const RESERVED = ["about", "ai", "api", "og", "library", "saved", "support", "stats", "suggest", "privacy", "verify", "licenses", "changelog", "offline", "how-it-works", "404"];
  for (const l of OTHER_LANGS) {
    const f = langFile(l.code);
    const bad = [
      ...Object.keys(f.groups ?? {}).filter((g) => !CATEGORY_SLUGS.includes(g)).map((g) => `groups.${g}`),
      ...Object.keys(f.sections ?? {}).filter((x) => !CATEGORIES.some((c) => (c.sections as readonly string[]).includes(x))).map((x) => `sections.${x}`),
      ...Object.keys(f.wanted ?? {}).filter((x) => !wantedIds.has(x)).map((x) => `wanted.${x}`),
      ...Object.keys(f.popular ?? {}).filter((x) => !tools.some((t) => t.id === x)).map((x) => `popular.${x}`),
      ...(CATEGORY_SLUGS.includes(l.code) || RESERVED.includes(l.code) ? [`the code "${l.code}" is also a page or group address`] : []),
    ];
    if (bad.length) throw new Error(`src/i18n/${l.code}.json refers to things that do not exist: ${bad.join(", ")}`);
  }
  if (!checked) {
    checked = true;
    for (const l of OTHER_LANGS) {
      const f = langFile(l.code);
      const gaps = [
        ...missingKeys()[l.code].map((k) => `ui.${k}`),
        ...CATEGORIES.filter((c) => !f.groups?.[c.slug]).map((c) => `groups.${c.slug}`),
        ...CATEGORIES.flatMap((c) => [...c.sections]).filter((x, i, a) => a.indexOf(x) === i && !f.sections?.[x]).map((x) => `sections.${x}`),
        ...wanted.filter((w) => !f.wanted?.[`${w.category}/${w.slug}`]).map((w) => `wanted.${w.category}/${w.slug}`),
        ...tools.filter((t) => !t.texts[l.code]).map((t) => `tools/${t.id}/i18n/${l.code}.json`),
      ];
      if (gaps.length) console.warn(`[i18n] ${l.code}: ${gaps.length} not translated yet (English is shown): ${gaps.slice(0, 12).join(", ")}${gaps.length > 12 ? ", ..." : ""}`);
    }
  }

  const aisles: Aisle[] = CATEGORIES.map((c) => {
    const live = tools.filter((t) => t.category.slug === c.slug).sort((a, b) => a.data.task.localeCompare(b.data.task));
    const want = wanted
      .filter((w) => w.category === c.slug)
      .map((w) => ({ ...w, id: `${w.category}/${w.slug}`, url: `/${w.category}/${w.slug}/`, request: requestUrl(w), number: "" }));
    return {
      ...c,
      live,
      wanted: want,
      sectionsUsed: c.sections
        .map((s) => ({ name: s, live: live.filter((t) => t.data.section === s), wanted: want.filter((w) => w.section === s) }))
        .filter((s) => s.live.length || s.wanted.length),
    };
  });

  // Product numbers follow catalogue order: group, then section, finished tools before planned ones.
  let n = 0;
  for (const a of aisles) for (const sec of a.sectionsUsed) for (const item of [...sec.live, ...sec.wanted]) item.number = `No. ${String(++n).padStart(3, "0")}`;

  // n name, t task, c group name, g group slug, u url, k keywords, w planned
  const searchIndexFor = (lang: string) => {
    const own = lang !== DEFAULT_LANG;
    const extra = langFile(lang).search?.synonyms ?? [];
    return [
      ...tools.map((t) => {
        const x = toolIn(t, lang);
        const en = expand(`${t.data.task} ${t.data.name} ${t.data.short} ${t.data.keywords.join(" ")} ${t.data.tagline}`);
        // A translated page also finds English words: the English name, keywords and synonyms stay in the index.
        const k = own ? `${expand(`${x.task} ${x.name} ${x.keywords.join(" ")} ${x.tagline}`, [...SYNONYMS, ...extra])} ${en}` : en;
        return { n: x.name, t: x.task, c: groupIn(t.category, lang).name, g: t.category.slug, u: t.texts[lang] ? localePath(lang, t.url) : t.url, k };
      }),
      ...aisles.flatMap((a) => a.wanted.map((w) => {
        const x = wantedIn(w, lang);
        const en = expand(`${w.name} ${w.task} ${w.blurb} ${w.section}`);
        const k = own ? `${expand(`${x.name} ${x.task} ${x.blurb}`, [...SYNONYMS, ...extra])} ${en}` : en;
        return { n: x.name, t: "", c: groupIn(a, lang).name, g: a.slug, u: hasWantedIn(lang, w.id) ? localePath(lang, w.url) : w.url, k, w: 1 as const };
      })),
    ];
  };
  const searchIndex = searchIndexFor(DEFAULT_LANG);

  /** Is there a page for this English address in this language? Used for the switcher and hreflang. */
  const hasPage = (lang: string, enPath: string) => {
    if (lang === DEFAULT_LANG || enPath === "/") return true;
    const parts = enPath.split("/").filter(Boolean);
    if (parts.length === 1) return CATEGORY_SLUGS.includes(parts[0]);
    if (parts.length === 2) {
      const id = parts.join("/");
      const tool = tools.find((x) => x.id === id);
      return tool ? !!tool.texts[lang] : wantedIds.has(id) && hasWantedIn(lang, id);
    }
    return false;
  };

  return { tools, aisles, searchIndex, searchIndexFor, hasPage };
}

/** The address of a tool's page in a language: its own, or the English one where it has no text yet. */
export const toolUrl = (tool: Tool, lang: string) => (tool.texts[lang] ? localePath(lang, tool.url) : tool.url);
/** The address of a wanted tool's page in a language, or the English one. */
export const wantedUrl = (w: Wanted, lang: string) => (hasWantedIn(lang, w.id) ? localePath(lang, w.url) : w.url);
