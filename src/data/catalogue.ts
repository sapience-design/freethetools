// Everything the sidebar, pages and API need, built once from tool.json files and wanted.json.
import { getCollection, type CollectionEntry } from "astro:content";
import { CATEGORIES, CATEGORY_SLUGS, type Category } from "./categories";
import wanted from "./wanted.json";

export const REPO = "https://github.com/sapience-design/freethetools";
export const SITE_NAME = "Free the Tools";

export type Tool = CollectionEntry<"tools"> & { category: Category; slug: string; url: string };
export type Wanted = { name: string; category: string; section: string; url: string };
export type Aisle = Category & { live: Tool[]; wanted: Wanted[]; sectionsUsed: { name: string; live: Tool[]; wanted: Wanted[] }[] };

const wantedUrl = (name: string) =>
  `${REPO}/issues?q=${encodeURIComponent(`is:issue is:open label:wanted "${name}"`)}`;

export async function loadCatalogue() {
  const entries = await getCollection("tools");
  const tools: Tool[] = entries.map((e) => {
    const [cat, slug] = e.id.split("/");
    if (!CATEGORY_SLUGS.includes(cat)) throw new Error(`tools/${e.id}: unknown category "${cat}". Add it to src/data/categories.ts.`);
    const category = CATEGORIES.find((c) => c.slug === cat)!;
    if (!(category.sections as readonly string[]).includes(e.data.section))
      throw new Error(`tools/${e.id}: section "${e.data.section}" is not one of ${category.sections.join(", ")}.`);
    return { ...e, category, slug, url: `/${e.id}/` };
  });

  const aisles: Aisle[] = CATEGORIES.map((c) => {
    const live = tools.filter((t) => t.category.slug === c.slug).sort((a, b) => a.data.short.localeCompare(b.data.short));
    const want = wanted
      .filter((w) => w.category === c.slug && !live.some((t) => t.data.name === w.name))
      .map((w) => ({ ...w, url: wantedUrl(w.name) }));
    return {
      ...c,
      live,
      wanted: want,
      sectionsUsed: c.sections
        .map((s) => ({ name: s, live: live.filter((t) => t.data.section === s), wanted: want.filter((w) => w.section === s) }))
        .filter((s) => s.live.length || s.wanted.length),
    };
  });

  const searchIndex = [
    ...tools.map((t) => ({ n: t.data.name, c: t.category.name, u: t.url, k: `${t.data.short} ${t.data.keywords.join(" ")} ${t.data.tagline}` })),
    ...aisles.flatMap((a) => a.wanted.map((w) => ({ n: w.name, c: a.name, u: w.url, k: w.section, w: 1 }))),
  ];

  return { tools, aisles, searchIndex };
}
