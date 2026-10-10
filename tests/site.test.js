// Checks on the built site (run `npm run build` first). These guard the promises contributors
// can't see from their own tool folder: every page is findable, described, and locked down.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const DIST = "dist";
const html = (p) => readFileSync(join(DIST, p), "utf8");
const pages = [];
(function walk(dir) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p);
    else if (n.endsWith(".html")) pages.push(p.slice(DIST.length + 1).replace(/\\/g, "/"));
  }
})(DIST);
const tools = JSON.parse(html("api/tools.json")).categories.flatMap((c) => c.tools);
// Translated pages live under /<lang>/ (docs/adr/0014-languages.md). tests/i18n.test.js checks them in full.
const LANGS = readdirSync("src/i18n").filter((f) => f.endsWith(".json") && f !== "en.json").map((f) => f.slice(0, -5));
const langHome = (p) => LANGS.some((l) => p === `${l}/index.html`);
const notFound = (p) => p === "404.html" || LANGS.some((l) => p === `${l}/404.html`);

test("the site built pages and at least one tool", () => {
  assert.ok(pages.includes("index.html"));
  assert.ok(tools.length >= 1);
});

for (const page of pages) {
  test(`${page}: title, description, canonical, language and CSP`, () => {
    const h = html(page);
    const lang = LANGS.find((l) => page.startsWith(`${l}/`)) ?? "en";
    assert.match(h, new RegExp(`<html lang="${lang}"[\\s>]`));
    assert.match(h, /<title>[^<]{10,}<\/title>/);
    assert.match(h, /<meta name="description" content="[^"]{30,}"/);
    if (!notFound(page)) assert.match(h, /<link rel="canonical" href="https:\/\/freethetools\.com\//);
    assert.match(h, /http-equiv="content-security-policy"[^>]*connect-src 'self'/, "CSP must block outside connections");
  });

  test(`${page}: every element id is unique`, () => {
    // Tools share the page with the sidebar, so ids must be prefixed with the tool's slug.
    const ids = [...html(page).matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    assert.deepEqual(dupes, [], `duplicate ids: ${dupes.join(", ")}`);
  });

  test(`${page}: loads nothing from other origins`, () => {
    const h = html(page);
    const external = [...h.matchAll(/<(?:script|link|img|iframe|source)\b[^>]*?(?:src|href)="(https?:\/\/[^"]+)"/g)]
      .map((m) => m[0])
      .filter((tag) => !/<link[^>]+rel="(canonical|alternate)"[^>]+href="https:\/\/freethetools\.com\//.test(tag));
    assert.deepEqual(external, []);
  });

  test(`${page}: share image exists and is 1200×630`, () => {
    const m = /<meta property="og:image" content="https:\/\/freethetools\.com\/([^"]+\.png)"/.exec(html(page));
    assert.ok(m, "og:image missing");
    const png = readFileSync(join(DIST, m[1]));
    assert.equal(png.toString("latin1", 1, 4), "PNG");
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1200, 630]);
  });
}

for (const t of tools) {
  test(`${t.id}: has a page, is in the sitemap, llms.txt and llms-full.txt`, () => {
    assert.ok(existsSync(join(DIST, t.id, "index.html")));
    assert.ok(html("sitemap.xml").includes(t.url));
    assert.ok(html("llms.txt").includes(t.url));
    assert.ok(html("llms-full.txt").includes(t.url));
  });
}

test("robots.txt points at the sitemap", () => {
  assert.match(html("robots.txt"), /Sitemap: https:\/\/freethetools\.com\/sitemap\.xml/);
});

test("Cloudflare headers file is published", () => {
  assert.match(html("_headers"), /X-Content-Type-Options: nosniff/);
});

test("the footer names the released version and links to its notes", () => {
  const { version } = JSON.parse(readFileSync("package.json", "utf8"));
  for (const page of ["index.html", "pdf/compress/index.html", "404.html"]) {
    const link = /<a href="([^"]+)" id="site-version"[^>]*>([^<]+)<\/a>/.exec(html(page));
    assert.ok(link, `${page} has the version link`);
    assert.equal(link[1], `/changelog/#v${version.replaceAll(".", "-")}`, page);
    assert.equal(link[2], `Version ${version}`, page);
  }
});

test("the changelog page shows the latest version and the sitemap lists it", () => {
  const { version } = JSON.parse(readFileSync("package.json", "utf8"));
  const page = html("changelog/index.html");
  assert.ok(page.includes('id="v' + version.replaceAll(".", "-") + '"'));
  assert.ok(page.includes("Version " + version));
  assert.match(html("sitemap.xml"), /<loc>https:\/\/freethetools\.com\/changelog\/<\/loc>/);
  assert.ok(html("index.html").includes('href="/changelog.xml"'));
});

test("changelog.xml is RSS with one item per released version", () => {
  const xml = html("changelog.xml");
  const released = (readFileSync("CHANGELOG.md", "utf8").match(/^## \[\d+\.\d+\.\d+\]/gm) ?? []).length;
  assert.ok(xml.startsWith("<?xml"));
  assert.match(xml, /<rss version="2\.0"/);
  assert.match(xml, /<atom:link [^>]*rel="self"/);
  assert.equal((xml.match(/<item>/g) ?? []).length, released);
  assert.equal((xml.match(/<\/item>/g) ?? []).length, released);
});

// Verifiable builds: dist/integrity.json lists the SHA-256 of every deployed file (ADR 0012).
test("integrity.json lists every file in dist with a SHA-256", async () => {
  const { createHash } = await import("node:crypto");
  const doc = JSON.parse(html("integrity.json"));
  assert.equal(typeof doc.commit, "string");
  assert.ok(!Number.isNaN(Date.parse(doc.built)), "built must be an ISO time");
  const all = [];
  (function walk(dir) {
    for (const n of readdirSync(dir)) {
      const p = join(dir, n);
      if (statSync(p).isDirectory()) walk(p);
      else all.push(p.slice(DIST.length + 1).replaceAll("\\", "/"));
    }
  })(DIST);
  // The host's own files (_headers) are not served, so they are not listed.
  const expected = all.filter((f) => f !== "integrity.json" && !["_headers", "_redirects", "_routes.json"].includes(f)).sort();
  assert.deepEqual(Object.keys(doc.files), expected, "integrity.json must list every served file except itself, sorted");
  assert.ok(!("_headers" in doc.files), "_headers is not served, so it is not listed");
  for (const [path, hash] of Object.entries(doc.files)) assert.match(hash, /^[0-9a-f]{64}$/, path);
  for (const path of ["index.html", "verify/index.html", expected.find((f) => f.endsWith(".js"))]) {
    const again = createHash("sha256").update(readFileSync(join(DIST, path))).digest("hex");
    assert.equal(doc.files[path], again, `${path} hash must match the file`);
  }
});

test("the verify page and its footer link exist", () => {
  assert.match(html("verify/index.html"), /<h1[^>]*>Check that this site/);
  assert.match(html("index.html"), /href="\/verify\/"/);
  assert.match(html("sitemap.xml") , /\/verify\//);
});

test("the service worker is built, same-origin only, and registered from the pages", () => {
  assert.ok(existsSync(join(DIST, "sw.js")), "dist/sw.js is missing");
  const sw = html("sw.js");
  assert.doesNotMatch(sw, /__VERSION__|__SHELL__/, "the template was not filled in");
  assert.doesNotMatch(sw, /https?:\/\/(?!freethetools\.com)/, "the worker must not name another origin");
  const shell = JSON.parse(sw.match(/const SHELL = (\[[\s\S]*?\]);/)[1]);
  assert.ok(shell.includes("/") && shell.includes("/offline/"));
  for (const path of shell) {
    assert.ok(path.startsWith("/") && !path.startsWith("//"), `${path} is not a same-origin path`);
    const file = path.endsWith("/") ? `${path}index.html` : path;
    assert.ok(existsSync(join(DIST, file)), `${path} is in the shell but not in dist`);
  }
  assert.match(sw, /\/api\/stats\//, "the worker must leave usage totals alone");
  // The registration lives in a bundled script; follow the script imports from a page to find it.
  const seen = new Set();
  const queue = [...html("pdf/merge/index.html").matchAll(/\/_astro\/[\w.\-]+\.js/g)].map((m) => m[0]);
  let registers = false;
  while (queue.length) {
    const f = queue.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    const js = html(f.slice(1));
    if (js.includes("/sw.js")) registers = true;
    for (const m of js.matchAll(/[\w.\-]+\.js/g)) if (existsSync(join(DIST, "_astro", m[0]))) queue.push(`/_astro/${m[0]}`);
  }
  assert.ok(registers, "no script on the tool page registers /sw.js");
  assert.match(html("offline/index.html"), /You're offline|You&#39;re offline/);
});

test("the AI assistants page is in the sitemap, and /ai.md has the prompt and every agent tool name", async () => {
  assert.match(html("sitemap.xml"), /<loc>https:\/\/freethetools\.com\/ai\/<\/loc>/);
  assert.ok(existsSync(join(DIST, "ai.md")), "dist/ai.md is missing");
  const md = html("ai.md");
  assert.ok(md.includes("I'd like you to use Free the Tools for file jobs on my computer"), "ai.md must contain the prompt");
  assert.ok(md.includes("`npx -y freethetools list` shows the tools"), "ai.md must contain the whole prompt");
  const names = [];
  for (const g of readdirSync("tools")) {
    if (g.startsWith("_") || !statSync(join("tools", g)).isDirectory()) continue;
    for (const s of readdirSync(join("tools", g))) {
      const f = join("tools", g, s, "agent.js");
      if (existsSync(f)) for (const d of [(await import(pathToFileURL(resolve(f)).href)).default].flat()) names.push(d.name);
    }
  }
  assert.ok(names.length > 0);
  for (const n of names) assert.ok(md.includes("`" + n + "`"), `ai.md lacks ${n}`);
  assert.match(html("ai/index.html"), /<h1[^>]*>Use these tools from your AI assistant/);
  assert.match(html("llms.txt"), /\/ai\.md/);
});

// Structured data search engines read: breadcrumbs on every page but home, and the studio as an
// organisation (docs/explanation/seo-policy.md).
const ldBlocks = (h) => [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
for (const page of pages.filter((p) => p !== "index.html" && !notFound(p) && !langHome(p))) {
  test(`${page}: breadcrumbs end at this page`, () => {
    const h = html(page);
    const crumbs = ldBlocks(h).find((b) => b["@type"] === "BreadcrumbList");
    assert.ok(crumbs, "no BreadcrumbList");
    const items = crumbs.itemListElement;
    assert.ok(items.length >= 2, "needs at least two steps");
    assert.match(items[0].item, new RegExp(`^https://freethetools\\.com/((?:${LANGS.join("|")})/)?$`));
    assert.deepEqual(items.map((i) => i.position), items.map((_, n) => n + 1));
    const canonical = h.match(/<link rel="canonical" href="([^"]+)"/)[1];
    assert.equal(items.at(-1).item, canonical, "the last step is this page");
  });
}
for (const t of tools) {
  test(`${t.id}: breadcrumbs go home, group, tool, and the studio is an organisation`, () => {
    const blocks = ldBlocks(html(`${t.id}/index.html`));
    assert.equal(blocks.find((b) => b["@type"] === "BreadcrumbList").itemListElement.length, 3);
    const app = blocks.flatMap((b) => b["@graph"] ?? [b]).find((b) => b["@type"] === "WebApplication");
    for (const a of app.author) if (a.name === "Sapience Design") assert.equal(a["@type"], "Organization");
  });
}
