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

// One year, this host only. includeSubDomains and preload are hard to undo, so they stay off.
test("every page tells browsers to use HTTPS (HSTS)", () => {
  const block = html("_headers").split(/\n(?=\S)/).find((b) => b.startsWith("/*"));
  assert.match(block, /^\s+Strict-Transport-Security: max-age=31536000$/m);
  assert.doesNotMatch(block, /includeSubDomains|preload/);
});

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
  assert.doesNotMatch(sw, /__VERSION__|__RELEASE__|__SHELL__/, "the template was not filled in");
  assert.match(sw, new RegExp(`const RELEASE = "${JSON.parse(readFileSync("package.json", "utf8")).version.replaceAll(".", "\\.")}"`), "the worker carries the release");
  assert.doesNotMatch(sw, /https?:\/\/(?!freethetools\.com)/, "the worker must not name another origin");
  const shell = JSON.parse(sw.match(/const SHELL = (\[[\s\S]*?\]);/)[1]);
  assert.ok(shell.includes("/") && shell.includes("/offline/"));
  assert.ok(!shell.some((f) => /^\/_astro\/(editor|fontkit|pdfthumb)\./.test(f)), "the PDF editor and its libraries load on demand, not with the shell");
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

test("the offline list names every file it offers, with its hash and size, by language", async () => {
  const { createHash } = await import("node:crypto");
  const version = html("sw.js").match(/const VERSION = "([0-9a-f]+)"/)[1];
  const list = JSON.parse(html("offline-files.json"));
  assert.equal(list.version, version, "the list belongs to the same build as the worker");
  const paths = list.files.map((f) => f[0]);
  for (const [path, sha, bytes, dep] of list.files) {
    const buf = readFileSync(join(DIST, path.endsWith("/") ? `${path.slice(1)}index.html` : path.slice(1)));
    assert.equal(buf.length, bytes, `${path}: size`);
    assert.equal(createHash("sha256").update(buf).digest("hex").slice(0, 32), sha, `${path}: hash`);
    assert.doesNotMatch(path, /^\/(og|api|stats)\/|\.(xml|txt|md)$/, `${path} is not for offline use`);
    if (dep !== undefined) assert.ok(list.deps[dep].every((i) => paths[i]), `${path}: dependencies`);
  }
  const named = (set) => (list.sets[set] ?? []).map((i) => paths[i]);
  for (const set of ["en", "nb", "es", "ru", "common", "compress"]) assert.ok(named(set).length, `the "${set}" set is empty`);
  assert.ok(named("en").includes("/pdf/merge/") && named("en").includes("/offline-use/"));
  // Another language has its own pages, and the English pages it has no translation of.
  assert.ok(named("nb").includes("/nb/pdf/merge/") && named("nb").includes("/privacy/") && !named("nb").includes("/pdf/merge/"));
  // The Ghostscript engine is a choice of its own, never part of the shared files.
  assert.ok(named("compress").some((p) => p.endsWith("/gs.wasm")));
  assert.ok(!named("common").some((p) => /\/gs\.(js|wasm)$/.test(p)));
  for (const deps of list.deps) assert.ok(!deps.some((i) => /\/gs\.(js|wasm)$/.test(paths[i])), "a page set pulls in the engine");
  // A page's set holds the scripts it loads.
  const merge = list.files[paths.indexOf("/pdf/merge/")];
  assert.ok(list.deps[merge[3]].some((i) => /^\/_astro\/.+\.js$/.test(paths[i])));
  // The worker never caches the list itself, and waits for the visitor before taking over.
  const sw = html("sw.js");
  assert.match(sw, /path === LIST\) return;/);
  assert.doesNotMatch(sw.replace(/msg\.type === "skip-waiting"\) \{\s*self\.skipWaiting\(\)/, ""), /skipWaiting\(\)/, "skipWaiting only on the visitor's Reload");
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
  // Assistants learn when a tool fits, how to ask for a missing one and how to add one.
  for (const f of ["llms.txt", "llms-full.txt", "ai.md"]) {
    assert.match(html(f), /\/suggest\//, `${f} links the suggest form`);
    assert.match(html(f), /AGENTS\.md/, `${f} links AGENTS.md`);
  }
  assert.ok(existsSync("AGENTS.md"), "AGENTS.md guides coding agents");
  // The npm README's tool table is written from agent.js by scripts/tool-table.mjs on every build.
  const readme = readFileSync("packages/freethetools/README.md", "utf8");
  for (const n of names) assert.ok(readme.includes("`" + n + "`"), `the package README lacks ${n}`);
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
    // The first step is the home page in this page's language: /, /nb/, /es/ and so on.
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

// One-step installs: the plugin and extension files must name the package and carry its version,
// and the Cursor and VS Code links on /ai/ must run the same server.
test("the Claude Code plugin, marketplace and Gemini extension match the npm package", () => {
  const read = (p) => JSON.parse(readFileSync(p, "utf8"));
  const pkg = read("packages/freethetools/package.json");
  const market = read(".claude-plugin/marketplace.json");
  assert.equal(market.name, "freethetools");
  const entry = market.plugins.find((p) => p.name === pkg.name);
  assert.ok(entry, "marketplace.json must list the plugin");
  assert.ok(existsSync(join(entry.source, ".claude-plugin", "plugin.json")), "plugin source folder has no plugin.json");
  const plugin = read(join(entry.source, ".claude-plugin", "plugin.json"));
  assert.equal(plugin.name, pkg.name);
  assert.equal(plugin.version, pkg.version);
  const server = read(join(entry.source, ".mcp.json")).mcpServers[pkg.name];
  assert.deepEqual([server.command, ...server.args], ["npx", "-y", "freethetools", "mcp"]);
  assert.ok(existsSync(join(entry.source, "skills", "free-the-tools", "SKILL.md")), "the plugin needs its skill");
  const gem = read("gemini-extension.json");
  assert.equal(gem.name, pkg.name);
  assert.equal(gem.version, pkg.version);
  assert.deepEqual([gem.mcpServers[pkg.name].command, ...gem.mcpServers[pkg.name].args], ["npx", "-y", "freethetools", "mcp"]);
  assert.ok(existsSync(gem.contextFileName), "contextFileName must point to a file in the repository");
});

test("the Add to Cursor and Add to VS Code links on /ai/ run npx -y freethetools mcp", () => {
  const page = html("ai/index.html");
  const href = (prefix) => {
    const m = page.match(new RegExp(`href="(${prefix}[^"]*)"`));
    assert.ok(m, `no ${prefix} link on /ai/`);
    return m[1].replace(/&amp;/g, "&");
  };
  const want = ["npx", "-y", "freethetools", "mcp"];
  const cursor = new URL(href("cursor://"));
  assert.equal(cursor.searchParams.get("name"), "freethetools");
  const cfg = JSON.parse(Buffer.from(cursor.searchParams.get("config"), "base64").toString("utf8"));
  assert.deepEqual([cfg.command, ...cfg.args], want);
  for (const scheme of ["vscode:mcp/install?", "vscode-insiders:mcp/install?"]) {
    const v = JSON.parse(decodeURIComponent(href(scheme).slice(scheme.length)));
    assert.equal(v.name, "freethetools");
    assert.deepEqual([v.command, ...v.args], want);
  }
});

// The sitemap is the list search engines crawl: every page they may index, and nothing else.
test("the sitemap lists every indexable page, and only built, indexable pages", () => {
  const inMap = new Set([...html("sitemap.xml").matchAll(/<loc>https:\/\/freethetools\.com(\/[^<]*)<\/loc>/g)].map((m) => m[1]));
  const built = new Set();
  for (const p of pages.filter((p) => p.endsWith("index.html"))) {
    const path = "/" + p.slice(0, -"index.html".length);
    built.add(path);
    const noindex = /<meta name="robots" content="noindex/.test(html(p));
    if (noindex) assert.ok(!inMap.has(path), `${path} is marked noindex but is in the sitemap`);
    else assert.ok(inMap.has(path), `${path} can be indexed but is not in the sitemap (src/pages/sitemap.xml.ts)`);
  }
  for (const path of inMap) assert.ok(built.has(path), `${path} is in the sitemap but no page was built`);
});

test("README.md links every tool page", () => {
  const readme = readFileSync("README.md", "utf8");
  for (const tool of tools) {
    const url = tool.url;
    assert.ok(readme.includes(url), `README.md is missing ${url}; run npm run build`);
  }
});

// Related tools: every tool page, in every language it has, links at least 3 other live tool pages
// (the same language where that tool has one, else English). Never itself, never a missing page.
{
  const ids = new Set(tools.map((t) => t.id));
  const toolPages = pages.filter((p) => /index\.html$/.test(p)).flatMap((p) => {
    const parts = p.split("/").slice(0, -1);
    if (LANGS.includes(parts[0])) parts.shift();
    return parts.length === 2 && ids.has(parts.join("/")) ? [{ page: p, id: parts.join("/") }] : [];
  });
  test("every live tool has an English page for the related-tools check", () => {
    for (const t of tools) assert.ok(toolPages.some((x) => x.page === `${t.id}/index.html`), t.id);
  });
  for (const { page, id } of toolPages) {
    test(`${page}: links at least 3 other live tool pages, none to itself`, () => {
      const nav = /<nav\b[^>]*aria-labelledby="related-h"[^>]*>([\s\S]*?)<\/nav>/.exec(html(page));
      assert.ok(nav, "no Related tools block");
      assert.match(nav[1], /<h2\b[^>]*id="related-h"[^>]*>[^<]+<\/h2>/);
      const hrefs = [...nav[1].matchAll(/<a\b[^>]*\shref="([^"]+)"/g)].map((m) => m[1]);
      const lang = LANGS.find((l) => page.startsWith(`${l}/`));
      const targets = hrefs.map((h) => {
        const parts = h.split("/").filter(Boolean);
        if (LANGS.includes(parts[0])) parts.shift();
        return parts.join("/");
      });
      assert.ok(hrefs.length >= 3, `only ${hrefs.length} links`);
      assert.equal(new Set(hrefs).size, hrefs.length, "duplicate links");
      for (const [n, h] of hrefs.entries()) {
        assert.ok(ids.has(targets[n]), `${h} is not a live tool`);
        assert.notEqual(targets[n], id, "links to itself");
        assert.ok(existsSync(join(DIST, h, "index.html")), `${h} has no page`);
        if (lang && existsSync(join(DIST, lang, targets[n], "index.html"))) assert.ok(h.startsWith(`/${lang}/`), `${h} should be the ${lang} page`);
      }
    });
  }
}

test("the installed app lets our top bar fill the title bar (Window Controls Overlay)", () => {
  const m = JSON.parse(html("manifest.webmanifest"));
  assert.deepEqual(m.display_override, ["window-controls-overlay"]);
  assert.equal(m.display, "standalone", "other browsers keep the plain app window");
  const css = readdirSync(join(DIST, "_astro")).filter((f) => f.endsWith(".css")).map((f) => readFileSync(join(DIST, "_astro", f), "utf8")).join("\n");
  const block = css.match(/@media \(display-mode:\s*window-controls-overlay\)\{[^@]*?\}\}/)?.[0] ?? "";
  assert.ok(block, "the overlay media query is in the built CSS");
  assert.match(block, /titlebar-area-x/);
  assert.match(block, /titlebar-area-width/);
  assert.match(block, /app-region:\s*drag/);
  assert.match(block, /app-region:\s*no-drag/);
  assert.match(block, /-webkit-app-region:\s*drag/);
  assert.match(block, /-webkit-app-region:\s*no-drag/);
});

// The PDF tools share one copy of the pdf.js worker, so the site (and its offline copy) ships it once.
test("the pdf.js worker is in dist once, and the PDF tools use that copy", () => {
  const copies = [];
  (function walk(dir) {
    for (const n of readdirSync(dir)) {
      const p = join(dir, n);
      if (statSync(p).isDirectory()) walk(p);
      else if (n === "pdf.worker.min.mjs") copies.push(p.slice(DIST.length + 1).replaceAll("\\", "/"));
    }
  })(DIST);
  assert.deepEqual(copies, ["vendor/pdfjs/pdf.worker.min.mjs"]);
  const users = ["compress", "edit", "fill-form", "merge", "rotate", "split", "to-images", "unlock"];
  for (const t of users) {
    const manifest = JSON.parse(readFileSync(`tools/pdf/${t}/tool.json`, "utf8"));
    const worker = manifest.vendor.find((v) => v.to === "pdf.worker.min.mjs");
    assert.equal(worker?.shared, "pdfjs", `pdf/${t} must list the worker as shared`);
    assert.ok(html(`pdf/${t}/index.html`).includes("/vendor/pdfjs/pdf.worker.min.mjs"), `pdf/${t} must load the shared worker`);
  }
});
