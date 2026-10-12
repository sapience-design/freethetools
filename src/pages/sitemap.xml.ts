import type { APIRoute } from "astro";
import { execFileSync } from "node:child_process";
import { loadCatalogue } from "../data/catalogue";
import { OTHER_LANGS, localePath } from "../i18n/index";

// A tool page's last change comes from git: the newest commit in its folder that changes that
// page. A shallow clone knows only one commit, so every date would read "today": then the date the
// tool was added is used, as before.
const git = (args: string[]) => { try { return execFileSync("git", args, { encoding: "utf8" }).trim(); } catch { return ""; } };
const fullHistory = git(["rev-parse", "--is-shallow-repository"]) === "false";
const lastCommit = (...paths: string[]) => git(["log", "-1", "--format=%cs", "--", ...paths]);
/** An English tool page: its folder, leaving out translations and tests. */
const changed = (id: string, added: string) => (fullHistory && lastCommit(`tools/${id}`, `:(exclude)tools/${id}/i18n`, `:(exclude)tools/${id}/tests`)) || added;
/** A translated tool page: the English page's date or its own translation's, whichever is newer. */
const changedIn = (id: string, lang: string, added: string) => {
  const own = fullHistory ? lastCommit(`tools/${id}/i18n/${lang}.json`) : "";
  const en = changed(id, added);
  return own > en ? own : en;
};

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
    { loc: "/at-work/" },
    { loc: "/offline-use/" },
    { loc: "/terms/" },
    { loc: "/stats/" },
    { loc: "/verify/" },
    ...aisles.map((a) => ({ loc: `/${a.slug}/` })),
    ...tools.map((t) => ({ loc: t.url, lastmod: changed(t.id, t.data.added) })),
    // The translated pages: home, groups, and the tools that have a text file in that language.
    ...OTHER_LANGS.flatMap((l) => [
      { loc: localePath(l.code, "/") },
      ...aisles.map((a) => ({ loc: localePath(l.code, `/${a.slug}/`) })),
      ...tools.filter((t) => t.texts[l.code]).map((t) => ({ loc: localePath(l.code, t.url), lastmod: changedIn(t.id, l.code, t.data.added) })),
    ]),
  ];
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map((u) => `  <url><loc>${new URL(u.loc, site).href}</loc>${"lastmod" in u && u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}</url>`).join("\n") +
    `\n</urlset>\n`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
};
