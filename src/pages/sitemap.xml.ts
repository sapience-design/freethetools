import type { APIRoute } from "astro";
import { loadCatalogue } from "../data/catalogue";
import { OTHER_LANGS, localePath } from "../i18n/index";

export const GET: APIRoute = async ({ site }) => {
  const { tools, aisles } = await loadCatalogue();
  const urls = [
    { loc: "/", lastmod: undefined as string | undefined },
    { loc: "/about/" },
    { loc: "/ai/" },
    { loc: "/how-it-works/" },
    { loc: "/support/" },
    { loc: "/changelog/" },
    { loc: "/licenses/" },
    { loc: "/privacy/" },
    { loc: "/verify/" },
    ...aisles.map((a) => ({ loc: `/${a.slug}/` })),
    ...tools.map((t) => ({ loc: t.url, lastmod: t.data.added })),
    // The translated pages: home, groups, and the tools that have a text file in that language.
    ...OTHER_LANGS.flatMap((l) => [
      { loc: localePath(l.code, "/") },
      ...aisles.map((a) => ({ loc: localePath(l.code, `/${a.slug}/`) })),
      ...tools.filter((t) => t.texts[l.code]).map((t) => ({ loc: localePath(l.code, t.url), lastmod: t.data.added })),
    ]),
  ];
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map((u) => `  <url><loc>${new URL(u.loc, site).href}</loc>${"lastmod" in u && u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}</url>`).join("\n") +
    `\n</urlset>\n`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
};
