# 10. A service worker so tools work offline

Date: 2026-10-10 · Status: accepted (decided by Sapience Design)

## Context

Every tool runs in the browser, so none needs a server once its files are on the device. The "works offline" claim was true only while the tab stayed open. Close the tab, lose the connection, and the tool was gone. Heavy tools make this worse: Compress PDF needs a 13 MB WebAssembly file.

## Decision

A hand-written service worker, `/sw.js`, with scope `/`. It has no dependencies (no Workbox). `scripts/build-sw.mjs` fills in `src/sw/sw.template.js` after each build and writes `dist/sw.js`. It runs as an Astro integration (`astro:build:done`).

- **On install**, it keeps the app shell: the home page, `/offline/`, the manifest, the icons, and the CSS, JavaScript and Latin fonts those pages use. The list is read from the built pages, because Astro hashes file names. About 130 KB.
- **Pages** (navigations): network first, then the cache, then `/offline/`. Online visitors always get the newest page.
- **`/_astro/*` and `*/vendor/*`**: cache first. The names change when the content does.
- **Everything else on our origin** (GET): stale while revalidate.
- **Never kept**: `/api/stats/*`, `/sw.js`, any answer that is not a plain 200, and any other origin. The worker does not touch other origins at all.
- **Per tool**: a tool is kept after it has been opened once, with its page, scripts and files. We do not store all 28 tools up front, because their engines are large. A tool's WebAssembly files load on first use, so the tool page fetches them on the first touch of the tool.
- The registration runs only in the production build, and only where `serviceWorker` exists. Storage errors are caught; the site works the same without storage.
- A tool page shows "Works offline" in its side column when the worker is serving the page and its `tool.json` has `"offline": true`.

## Consequences

- **Size.** The shell is about 130 KB. A tool adds its page, scripts and vendor files: a few hundred KB for most, about 13 MB for Compress PDF. Browsers cap storage per site and may clear it when the disk is low. Then the site works online as before.
- **Updates.** The cache is named after a hash of every published file. A new deploy gives a new worker, which installs, takes over at once, and deletes the older caches. Tools then need one visit online to be kept again. Online visitors see new pages straight away, as pages are network first. An old tab may mix old and new files until it is reloaded; hashed file names keep them from clashing.
- **Busting the cache.** Deploy any change, and the version changes. To clear one browser by hand: DevTools, Application, Storage, Clear site data. To remove the worker for everyone, publish a `/sw.js` that unregisters itself.
- **Privacy.** Nothing new leaves the device. The worker keeps only files from this site.
- **Tests.** `tests/site.test.js` checks the built worker. `e2e/offline.spec.js` opens a tool, switches the network off and merges two PDFs.
