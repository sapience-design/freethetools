// Checks on the built site (run `npm run build` first). These guard the promises contributors
// can't see from their own tool folder: every page is findable, described, and locked down.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

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

test("the site built pages and at least one tool", () => {
  assert.ok(pages.includes("index.html"));
  assert.ok(tools.length >= 1);
});

for (const page of pages) {
  test(`${page}: title, description, canonical, language and CSP`, () => {
    const h = html(page);
    assert.match(h, /<html lang="en"[\s>]/);
    assert.match(h, /<title>[^<]{10,}<\/title>/);
    assert.match(h, /<meta name="description" content="[^"]{30,}"/);
    if (page !== "404.html") assert.match(h, /<link rel="canonical" href="https:\/\/freethetools\.com\//);
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
      .filter((tag) => !/<link[^>]+rel="canonical"/.test(tag));
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
  test(`${t.id}: has a page, is in the sitemap and in llms.txt`, () => {
    assert.ok(existsSync(join(DIST, t.id, "index.html")));
    assert.ok(html("sitemap.xml").includes(t.url));
    assert.ok(html("llms.txt").includes(t.url));
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
    assert.ok(link[1].endsWith(`/releases/tag/v${version}`), page);
    assert.equal(link[2], `Version ${version}`, page);
  }
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
