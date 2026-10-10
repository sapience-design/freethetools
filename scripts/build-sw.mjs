// Writes dist/sw.js from src/sw/sw.template.js. Astro hashes its CSS and JS file names, so the
// list of files to keep for offline use is read from the built pages, not written by hand.
// Run by the Astro integration in astro.config.mjs after each build.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

// Pages and files every visitor gets on the first visit. Tool pages are not listed: each one is
// kept after it has been opened, along with its own scripts and vendor files.
const SHELL_PAGES = ["/", "/offline/"];
const SHELL_FILES = ["/manifest.webmanifest", "/icon.svg", "/icon-192.png", "/icon-512.png"];

function files(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

export function buildServiceWorker(dist = join(root, "dist")) {
  const urlOf = (p) => "/" + relative(dist, p).split(sep).join("/");
  const all = files(dist).filter((p) => urlOf(p) !== "/sw.js").sort();
  const astro = new Set(all.map(urlOf).filter((u) => u.startsWith("/_astro/")));

  // Collect the /_astro/ files a page uses, and the ones those files load in turn (script chunks,
  // fonts). A file name is matched as text, which is how Vite writes them.
  const wanted = new Set();
  // Fonts: only the Latin woff2 files. Other scripts load when a page needs them, and are then kept.
  const skip = (name) => /\.woff2?$/.test(name) && !/-latin-(?!ext).*\.woff2$/.test(name);
  const visit = (name) => {
    if (wanted.has(name) || skip(name)) return;
    wanted.add(name);
    if (!/\.(js|css)$/.test(name)) return;
    const text = readFileSync(join(dist, name), "utf8");
    for (const m of text.matchAll(/[A-Za-z0-9_.\-]+\.(?:js|css|woff2?|wasm)/g)) {
      const hit = "/_astro/" + m[0];
      if (astro.has(hit)) visit(hit);
    }
  };
  const pages = SHELL_PAGES.filter((p) => existsSync(join(dist, p === "/" ? "index.html" : p.endsWith("/") ? p + "index.html" : p)));
  for (const p of pages) {
    const file = p === "/" ? "index.html" : p.endsWith("/") ? p + "index.html" : p;
    const html = readFileSync(join(dist, file), "utf8");
    for (const m of html.matchAll(/\/_astro\/[A-Za-z0-9_.\-]+/g)) if (astro.has(m[0])) visit(m[0]);
  }
  const shell = [...pages, ...SHELL_FILES.filter((f) => existsSync(join(dist, f))), ...[...wanted].sort()];

  // The version changes whenever any published file changes, so a new deploy starts a new cache.
  const hash = createHash("sha256");
  for (const p of all) hash.update(urlOf(p)).update(readFileSync(p));
  hash.update(readFileSync(join(root, "src/sw/sw.template.js")));
  const version = hash.digest("hex").slice(0, 12);

  const template = readFileSync(join(root, "src/sw/sw.template.js"), "utf8");
  const out = template.replace("__VERSION__", version).replace("__SHELL__", JSON.stringify(shell, null, 2));
  writeFileSync(join(dist, "sw.js"), out);
  console.log(`sw.js  version ${version}, ${shell.length} files in the shell`);
  return { version, shell };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) buildServiceWorker();
