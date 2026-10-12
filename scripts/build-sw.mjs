// Writes dist/sw.js from src/sw/sw.template.js, and dist/offline-files.json: every file a visitor
// can keep for offline use, with its SHA-256 and size, grouped by language. Astro hashes its CSS and
// JS file names, so both lists are read from the built pages, not written by hand.
// Run by the Astro integration in astro.config.mjs after each build.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

// Pages and files every visitor gets on the first visit. Tool pages are not listed: each one is
// kept after it has been opened, along with its own scripts and vendor files, or with the full
// download from /offline-use/.
const SHELL_PAGES = ["/", "/offline/"];
const SHELL_FILES = ["/manifest.webmanifest", "/icon.svg", "/icon-192.png", "/icon-512.png"];

export const OFFLINE_LIST = "offline-files.json";
const LANGS = ["nb", "es", "ru"]; // besides English, which has no prefix
// Files that are never part of the offline download: share images, machine-readable copies, the
// host's own files, and pages that only work online (usage totals).
const NEVER = [/^\/og\//, /^\/api\//, /^\/stats\//, /^\/_(headers|redirects|routes\.json)$/, /^\/(sw\.js|offline-files\.json|integrity\.json)$/, /\.(xml|txt|md)$/];
// Engines too large to download for everyone: offered as their own choice.
const ENGINES = { compress: /^\/pdf\/compress\/vendor\/gs\./ };
const isEngine = (u) => Object.values(ENGINES).some((re) => re.test(u));

function files(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

export function buildServiceWorker(dist = join(root, "dist")) {
  const urlOf = (p) => "/" + relative(dist, p).split(sep).join("/");
  const fileOf = (u) => join(dist, u.endsWith("/") ? u + "index.html" : u);
  const pageOf = (u) => (u.endsWith("/index.html") ? u.slice(0, -"index.html".length) : u);
  const all = files(dist).filter((p) => !["/sw.js", "/" + OFFLINE_LIST].includes(urlOf(p))).sort();
  const urls = new Set(all.map(urlOf));
  const astro = new Set([...urls].filter((u) => u.startsWith("/_astro/")));

  // The /_astro/ files a page uses, and the ones those files load in turn (script chunks, fonts,
  // vendor files named in scripts). A file name is matched as text, which is how Vite writes them.
  // Fonts: only the Latin woff2 files; other subsets load when a page needs them, and are then kept.
  const skip = (name) => /\.woff2?$/.test(name) && !/-latin-(?!ext).*\.woff2$/.test(name);
  const closure = (start) => {
    const seen = new Set();
    const visit = (name) => {
      if (seen.has(name) || skip(name)) return;
      seen.add(name);
      if (!/\.(js|mjs|css)$/.test(name)) return;
      const text = readFileSync(join(dist, name), "utf8");
      for (const m of text.matchAll(/[A-Za-z0-9_.\-]+\.(?:js|mjs|css|woff2?|wasm)/g)) if (astro.has("/_astro/" + m[0])) visit("/_astro/" + m[0]);
      for (const m of text.matchAll(/\/(?:[\w-]+\/[\w-]+\/)?vendor\/[\w./-]+/g)) if (urls.has(m[0]) && !isEngine(m[0])) seen.add(m[0]);
    };
    for (const n of start) visit(n);
    return seen;
  };
  // What one page needs besides itself: its scripts, styles and fonts, and the images and icons it
  // names from this site.
  const depsOf = (page) => {
    const html = readFileSync(fileOf(page), "utf8");
    const start = [...html.matchAll(/\/_astro\/[A-Za-z0-9_.\-]+/g)].map((m) => m[0]).filter((u) => astro.has(u));
    const deps = closure(start);
    for (const m of html.matchAll(/(?:src|href)="(\/[^"#?]+\.(?:webp|png|svg|jpg|ico|webmanifest))"/g)) if (urls.has(m[1])) deps.add(m[1]);
    return [...deps].sort();
  };

  // ---- The shell ----
  const pages = SHELL_PAGES.filter((p) => existsSync(fileOf(p)));
  const shellDeps = new Set();
  for (const p of pages) for (const d of depsOf(p)) if (d.startsWith("/_astro/")) shellDeps.add(d);
  const shell = [...pages, ...SHELL_FILES.filter((f) => urls.has(f)), ...[...shellDeps].sort()];

  // The version changes whenever any published file changes, so a new deploy starts a new cache.
  const hash = createHash("sha256");
  for (const p of all) hash.update(urlOf(p)).update(readFileSync(p));
  hash.update(readFileSync(join(root, "src/sw/sw.template.js")));
  const version = hash.digest("hex").slice(0, 12);

  // ---- The offline list ----
  const never = (u) => NEVER.some((re) => re.test(u));
  const htmlPages = [...urls].filter((u) => u.endsWith("/index.html") && !never(u)).map(pageOf).sort();
  const langOf = (page) => LANGS.find((l) => page.startsWith(`/${l}/`)) ?? "en";
  const sets = { en: [], ...Object.fromEntries(LANGS.map((l) => [l, []])) };
  for (const page of htmlPages) sets[langOf(page)].push(page);
  // A language keeps the English pages that have no translation of their own (About, Privacy ...).
  for (const l of LANGS) for (const page of sets.en) if (!urls.has(`/${l}${page}index.html`)) sets[l].push(page);
  for (const l of LANGS) sets[l].sort();
  const vendor = [...urls].filter((u) => /\/vendor\//.test(u) && !never(u));
  const engine = Object.fromEntries(Object.entries(ENGINES).map(([k, re]) => [k, vendor.filter((u) => re.test(u))]));
  sets.common = [...new Set([...shell, ...vendor.filter((u) => !isEngine(u))])].sort();
  Object.assign(sets, engine);

  // Every listed file with the first 128 bits of its SHA-256 (to check what arrives, and to copy
  // unchanged files from one version to the next) and its size. A page also names the set of files
  // it needs; pages share sets. To stay small, sets and dependencies list files by their number:
  //   { version, files: [[path, sha, bytes, depSet?], ...], deps: [[file numbers]], sets: { en: [file numbers], ... } }
  const entries = new Map();
  const add = (u) => {
    if (!entries.has(u)) {
      const bytes = readFileSync(fileOf(u));
      entries.set(u, [u, createHash("sha256").update(bytes).digest("hex").slice(0, 32), bytes.length]);
    }
    return entries.get(u);
  };
  const pageDeps = new Map();
  for (const page of new Set([...htmlPages, ...pages])) {
    add(page);
    const deps = depsOf(page);
    deps.forEach(add);
    pageDeps.set(page, deps);
  }
  for (const u of Object.values(sets).flat()) add(u);
  const order = [...entries.keys()].sort();
  const num = new Map(order.map((u, i) => [u, i]));
  const depSets = [];
  const depIndex = new Map();
  for (const [page, deps] of pageDeps) {
    const key = deps.join("\n");
    if (!depIndex.has(key)) { depIndex.set(key, depSets.length); depSets.push(deps.map((d) => num.get(d))); }
    entries.get(page)[3] = depIndex.get(key);
  }
  const list = {
    version,
    files: order.map((u) => entries.get(u)),
    deps: depSets,
    sets: Object.fromEntries(Object.entries(sets).map(([k, v]) => [k, v.map((u) => num.get(u))])),
  };
  writeFileSync(join(dist, OFFLINE_LIST), JSON.stringify(list));

  const template = readFileSync(join(root, "src/sw/sw.template.js"), "utf8");
  // The release (package.json version, as in the footer) decides whether the page announces an update.
  const release = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
  const out = template.replace("__VERSION__", version).replace("__RELEASE__", release).replace("__SHELL__", JSON.stringify(shell, null, 2));
  writeFileSync(join(dist, "sw.js"), out);
  const size = (set) => {
    const all = new Set(set);
    for (const u of set) for (const d of pageDeps.get(u) ?? []) all.add(d);
    return ([...all].reduce((n, u) => n + entries.get(u)[2], 0) / 1e6).toFixed(1) + " MB";
  };
  console.log(`sw.js  version ${version}, ${shell.length} files in the shell`);
  console.log(`offline  ${order.length} files; en ${size([...sets.common, ...sets.en])}, ${LANGS.map((l) => `${l} ${size([...sets.common, ...sets[l]])}`).join(", ")}; compress engine ${size(sets.compress ?? [])}`);
  return { version, shell, list };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) buildServiceWorker();
