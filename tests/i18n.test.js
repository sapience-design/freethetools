// Checks on the translated site (run `npm run build` first). docs/adr/0014-languages.md.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { compareKeys, fill, flatten, localePath, lookupPlural, slots, splitPath } from "../src/i18n/core.js";

const DIST = "dist";
const html = (p) => readFileSync(join(DIST, p), "utf8");
const json = (p) => JSON.parse(readFileSync(p, "utf8"));
const walk = (dir, out = []) => {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p.replaceAll("\\", "/"));
  }
  return out;
};
const en = json("src/i18n/en.json");
const langs = readdirSync("src/i18n").filter((f) => f.endsWith(".json") && f !== "en.json").map((f) => f.slice(0, -5));
const decode = (s) => s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

test("the helpers fill, split, count and address as documented", () => {
  assert.equal(fill("Hei {name}, {n}", { name: "Ola" }), "Hei Ola, {n}");
  assert.deepEqual(slots("Press {key} to go"), ["Press ", { slot: "key" }, " to go"]);
  assert.equal(localePath("en", "/pdf/"), "/pdf/");
  assert.equal(localePath("nb", "/pdf/"), "/nb/pdf/");
  assert.equal(localePath("nb", "/"), "/nb/");
  assert.deepEqual(splitPath("/nb/pdf/compress/", ["en", "nb"]), { lang: "nb", path: "/pdf/compress/" });
  assert.deepEqual(splitPath("/nb/", ["en", "nb"]), { lang: "nb", path: "/" });
  assert.deepEqual(splitPath("/nbx/", ["en", "nb"]), { lang: "en", path: "/nbx/" });
  const flat = { "a.one": "{n} ting", "a.other": "{n} ting" };
  assert.equal(lookupPlural(flat, flat, "nb", "a", 1), "{n} ting");
  assert.deepEqual(compareKeys({ a: "1", "b.one": "x", "b.other": "y" }, { a: "1", c: "2", "b.few": "z", "b.other": "y" }), { extra: ["c"], missing: ["b.one"] });
});

test("at least one translation exists, with the meta block", () => {
  assert.ok(langs.includes("nb"));
  for (const l of langs) {
    const m = json(`src/i18n/${l}.json`).meta;
    assert.equal(typeof m.name, "string");
    assert.ok(["ltr", "rtl"].includes(m.dir));
    assert.equal(typeof m.reviewed, "boolean");
    assert.match(m.locale, /^[a-z]{2,3}_[A-Z]{2}$/);
  }
});

for (const l of langs) {
  const file = json(`src/i18n/${l}.json`);

  test(`${l}: no key in the translation is missing from en.json`, () => {
    const { extra } = compareKeys(flatten(en.ui), flatten(file.ui));
    assert.deepEqual(extra, []);
  });

  test(`${l}: every English string has a translation`, () => {
    const { missing } = compareKeys(flatten(en.ui), flatten(file.ui));
    assert.deepEqual(missing, [], "the page would show English for these");
  });

  test(`${l}: placeholders match the English ones`, () => {
    const fe = flatten(en.ui), ft = flatten(file.ui);
    for (const k of Object.keys(ft)) {
      const base = fe[k] ?? fe[k.replace(/\.[a-z]+$/, ".other")];
      if (base === undefined) continue;
      const ph = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join();
      assert.equal(ph(ft[k]), ph(base), k);
    }
  });

  const dir = join(DIST, l);
  const pages = walk(dir).filter((p) => p.endsWith("/index.html")).map((p) => p.slice(DIST.length + 1));
  test(`${l}: pages were built (home, groups, tools)`, () => {
    assert.ok(pages.includes(`${l}/index.html`));
    assert.ok(pages.includes(`${l}/pdf/index.html`));
    assert.ok(pages.some((p) => p.startsWith(`${l}/pdf/compress/`)));
    assert.ok(existsSync(join(DIST, l, "404.html")), `${l}/404.html must be a file`);
  });

  for (const page of [...pages, `${l}/404.html`]) {
    const is404 = page.endsWith("404.html");
    const enPath = "/" + page.slice(l.length + 1).replace(/index\.html$/, "");
    test(`${page}: language, canonical, hreflang, CSP`, () => {
      const h = html(page);
      assert.match(h, new RegExp(`<html lang="${l}" dir="${file.meta.dir}"`));
      assert.match(h, /http-equiv="content-security-policy"[^>]*connect-src 'self'/);
      assert.match(h, new RegExp(`<meta property="og:locale" content="${file.meta.locale}"`));
      if (is404) return;
      assert.ok(h.includes(`<link rel="canonical" href="https://freethetools.com/${page.replace(/index\.html$/, "")}">`), "self canonical");
      const alt = Object.fromEntries([...h.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)].map((m) => [m[1], m[2]]));
      const wantedPage = !!file.wanted && Object.keys(file.wanted).some((id) => enPath === `/${id}/`);
      assert.equal(alt[l], `https://freethetools.com/${page.replace(/index\.html$/, "")}`);
      assert.equal(alt.en, `https://freethetools.com${enPath}`);
      assert.equal(alt["x-default"], alt.en);
      // Reciprocal: the English page lists this page back, and x-default points at itself.
      const english = html(enPath === "/" ? "index.html" : `${enPath.slice(1)}index.html`);
      assert.ok(english.includes(`<link rel="alternate" hreflang="${l}" href="${alt[l]}">`), `${enPath} must list ${l}`);
      assert.ok(english.includes(`<link rel="alternate" hreflang="x-default" href="${alt.en}">`));
      assert.ok(english.includes(`<link rel="alternate" hreflang="en" href="${alt.en}">`));
      void wantedPage;
    });

    test(`${page}: the not-reviewed note shows exactly while reviewed is false`, () => {
      const h = html(page);
      const note = h.includes('class="review-note"') || /class="review-note[ "]/.test(h);
      assert.equal(note, !file.meta.reviewed);
      if (!file.meta.reviewed) assert.ok(h.includes(file.ui.review.note) && h.includes('href="/suggest/?kind=problem"'));
    });

    test(`${page}: the switcher marks this language and links the same page in English`, () => {
      const h = html(page);
      const current = [...h.matchAll(/<a href="([^"]+)" lang="(\w+)" hreflang="\w+" aria-current="true"[^>]*>([^<]+)<\/a>/g)];
      assert.equal(current.length, 1);
      assert.equal(current[0][2], l);
      assert.equal(decode(current[0][3]), file.meta.name);
      const english = /<a href="([^"]+)" lang="en" hreflang="en"/.exec(h);
      assert.ok(english);
      if (!is404) assert.equal(english[1], enPath);
    });
  }

  // Tool pages: the shell is in the language of the page.
  for (const f of walk("tools").filter((p) => p.endsWith(`/i18n/${l}.json`))) {
    const id = f.split("/").slice(1, 3).join("/");
    const t = json(f);
    const d = json(`tools/${id}/tool.json`);
    test(`${l}/${id}: tool page uses the translated texts`, () => {
      const h = html(`${l}/${id}/index.html`);
      const h1 = decode(/<h1[^>]*>([^<]*)<\/h1>/.exec(h)[1]);
      assert.equal(h1, t.task);
      if (d.task !== t.task) assert.ok(!h1.includes(d.task), "English task in the heading");
      assert.ok(decode(/<title>([^<]*)<\/title>/.exec(h)[1]).startsWith(t.seoTitle));
      assert.ok(h.includes(`content="${t.description.replace(/"/g, "&quot;")}"`) || h.includes(t.description));
      for (const q of t.faq ?? []) assert.ok(decode(h).includes(q.q), `FAQ question missing: ${q.q}`);
      for (const q of d.faq) if (!(t.faq ?? []).some((x) => x.q === q.q)) assert.ok(!decode(h).includes(`>${q.q}<`), "English FAQ question on the translated page");
      assert.ok(h.includes(file.ui.toolNote), "the note that the tool itself is English");
      // Breadcrumbs use translated names and addresses.
      const crumbs = [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1])).find((b) => b["@type"] === "BreadcrumbList");
      assert.equal(crumbs.itemListElement[0].item, `https://freethetools.com/${l}/`);
      assert.equal(crumbs.itemListElement[1].item, `https://freethetools.com/${l}/${id.split("/")[0]}/`);
      assert.equal(crumbs.itemListElement[2].name, t.name);
      assert.equal(crumbs.itemListElement[2].item, `https://freethetools.com/${l}/${id}/`);
    });
    test(`${l}/${id}: the sitemap lists it`, () => {
      assert.ok(html("sitemap.xml").includes(`<loc>https://freethetools.com/${l}/${id}/</loc>`));
    });
  }
}

test("every interface key the code asks for exists in en.json", () => {
  const fe = flatten(en.ui);
  const has = (k) => k in fe || `${k}.one` in fe || `${k}.other` in fe;
  const files = walk("src").filter((p) => /\.(astro|ts|js)$/.test(p) && !p.includes("/i18n/") && !p.endsWith(".test.js"));
  // How each file names its keys: [file part, regex, key prefix]. T, N and h are small wrappers inside a page;
  // txt and txtN read the #ftt-ui block (js.common), and the scripts of two pages read their own blocks.
  const rules = [
    ["", /\b(?:t|tn|ui)\(\s*lang\s*,\s*"([\w.]+)"/g, ""],
    ["ToolPage", /\bT\("(\w+)"/g, "tool."],
    ["WantedTool", /\bT\("(\w+)"/g, "wanted."],
    ["NotFound", /\bN\("(\w+)"/g, "notFound."],
    ["HomePage", /\bh\("(\w+)"/g, "home."],
  ];
  const common = /\btxtN?\(\s*"(\w+)"/g;
  const scripts = [
    ["HomePage", /\bhn?\("(\w+)",/g, "js.home."],
    ["WantedTool", /\bw\("(\w+)",/g, "js.wanted."],
    ["WantedTool", /txtN\("(\w+)",[^)]*"ftt-wanted"/g, "js.wanted."],
  ];
  let checked = 0;
  const check = (f, text, [part, re, prefix]) => {
    if (part && !f.includes(part)) return;
    for (const m of text.matchAll(re)) {
      if (!has(prefix + m[1])) assert.fail(`${f}: asks for "${prefix + m[1]}", which en.json does not have`);
      checked++;
    }
  };
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    const at = src.search(/\n<script>\n/);
    const body = at > 0 ? src.slice(0, at) : src;
    const script = at > 0 ? src.slice(at) : "";
    for (const r of rules) check(f, body, r);
    for (const r of scripts) check(f, script, r);
    // txt("key") in a script: the common block, except in the two pages with their own.
    for (const m of (script || src).matchAll(common)) {
      if (/ftt-(home|wanted)/.test(m[0] + ((script || src).slice(m.index, m.index + 400)))) continue;
      if (!has(`js.common.${m[1]}`)) assert.fail(`${f}: asks for "js.common.${m[1]}", which en.json does not have`);
      checked++;
    }
  }
  assert.ok(checked > 60, `only ${checked} keys found; the patterns may be out of date`);
});

test("the sitemap lists translated home and group pages", () => {
  const sm = html("sitemap.xml");
  for (const l of langs) {
    assert.ok(sm.includes(`<loc>https://freethetools.com/${l}/</loc>`));
    assert.ok(sm.includes(`<loc>https://freethetools.com/${l}/pdf/</loc>`));
    // Wanted-tool pages stay out of the sitemap, in every language.
    assert.ok(!sm.includes(`/${l}/pdf/watermark/`));
  }
});

test("the service worker shell does not assume English only", () => {
  const sw = html("sw.js");
  const shell = JSON.parse(sw.match(/const SHELL = (\[[\s\S]*?\]);/)[1]);
  for (const p of shell) assert.ok(!/^\/[a-z]{2}\//.test(p) || existsSync(join(DIST, p, "index.html")), p);
});
