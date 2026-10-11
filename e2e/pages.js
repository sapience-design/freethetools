// The pages that the page-by-page browser tests visit (axe-core and reflow).
// Every English page is tested on every push. A translated page shares its layout and code with
// the English page, so each language is tested on a fixed sample: its home page, one group page
// and three tools. The daily run sets FTT_ALL_PAGES=1 to test every translated page
// (.github/workflows/all-pages.yml).
import { readFileSync, readdirSync } from "node:fs";

export const LANGS = readdirSync("src/i18n").filter((f) => f.endsWith(".json") && f !== "en.json").map((f) => f.slice(0, -5));

/** Paths after the language prefix. A drop-zone tool, a tool with a video, and a tool with lists and fields. */
const SAMPLE = ["", "pdf/", "pdf/merge/", "images/video-to-gif/", "everyday/time-zone-converter/"];

export const allPaths = [...readFileSync("dist/sitemap.xml", "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);

for (const lang of LANGS) {
  for (const rest of SAMPLE) {
    if (!allPaths.includes(`/${lang}/${rest}`)) throw new Error(`e2e/pages.js: /${lang}/${rest} is not in the sitemap. Update SAMPLE.`);
  }
}

const langOf = (path) => LANGS.find((lang) => path.startsWith(`/${lang}/`));

export const ALL_PAGES = process.env.FTT_ALL_PAGES === "1";

export const paths = ALL_PAGES ? allPaths : allPaths.filter((path) => {
  const lang = langOf(path);
  return !lang || SAMPLE.includes(path.slice(lang.length + 2));
});
