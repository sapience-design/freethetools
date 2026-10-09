// Everything the pages, search and API need, built once from tool.json files and wanted.json.
import { getCollection, type CollectionEntry } from "astro:content";
import { CATEGORIES, CATEGORY_SLUGS, type Category } from "./categories";
import wanted from "./wanted.json";
import { expand } from "./synonyms.js";

export const REPO = "https://github.com/sapience-design/freethetools";
export const SITE_NAME = "Free the Tools";
export const REQUEST_URL = `${REPO}/issues/new?template=tool_request.yml`;

export type Tool = CollectionEntry<"tools"> & { category: Category; slug: string; url: string; number: string; icon: string; isNew: boolean };
export type Wanted = { name: string; category: string; section: string; blurb: string; url: string; number: string };
export type Aisle = Category & { live: Tool[]; wanted: Wanted[]; sectionsUsed: { name: string; live: Tool[]; wanted: Wanted[] }[] };

const wantedUrl = (name: string) =>
  `${REPO}/issues?q=${encodeURIComponent(`is:issue is:open label:wanted "${name}"`)}`;

// "New" marks tools added since launch week, for 45 days. Launch-day tools are not new to anyone.
const LAUNCH_WEEK_END = "2026-10-04";
const NEW_FOR_DAYS = 45;
const isNewTool = (added: string) =>
  added > LAUNCH_WEEK_END && Date.now() - Date.parse(`${added}T12:00:00Z`) < NEW_FOR_DAYS * 864e5;

export async function loadCatalogue() {
  const entries = await getCollection("tools");
  const tools: Tool[] = entries.map((e) => {
    const [cat, slug] = e.id.split("/");
    if (!CATEGORY_SLUGS.includes(cat)) throw new Error(`tools/${e.id}: unknown category "${cat}". Add it to src/data/categories.ts.`);
    const category = CATEGORIES.find((c) => c.slug === cat)!;
    if (!(category.sections as readonly string[]).includes(e.data.section))
      throw new Error(`tools/${e.id}: section "${e.data.section}" is not one of ${category.sections.join(", ")}.`);
    return { ...e, category, slug, url: `/${e.id}/`, number: "", icon: e.data.icon ?? category.mark, isNew: isNewTool(e.data.added) };
  });

  const aisles: Aisle[] = CATEGORIES.map((c) => {
    const live = tools.filter((t) => t.category.slug === c.slug).sort((a, b) => a.data.task.localeCompare(b.data.task));
    const want = wanted
      .filter((w) => w.category === c.slug && !live.some((t) => t.data.name === w.name))
      .map((w) => ({ ...w, url: wantedUrl(w.name), number: "" }));
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
  const searchIndex = [
    ...tools.map((t) => ({ n: t.data.name, t: t.data.task, c: t.category.name, g: t.category.slug, u: t.url, k: expand(`${t.data.task} ${t.data.name} ${t.data.short} ${t.data.keywords.join(" ")} ${t.data.tagline}`) })),
    ...aisles.flatMap((a) => a.wanted.map((w) => ({ n: w.name, t: "", c: a.name, g: a.slug, u: w.url, k: expand(`${w.name} ${w.blurb} ${w.section}`), w: 1 as const }))),
  ];

  return { tools, aisles, searchIndex };
}
