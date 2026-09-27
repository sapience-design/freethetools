# Architecture and the no-upload guarantee

## The promise

Every tool runs on the visitor's device, and their files never leave it. Everything else follows from that.

## A static site with the work in the browser

The site is plain HTML, CSS and JavaScript built by [Astro](https://astro.build) and served as static files by Cloudflare Workers. There is no application server and no database. A tool is a page whose script does the work in the browser tab, in a Web Worker when it is heavy (Compress PDF runs Ghostscript compiled to WebAssembly).

This keeps hosting free, pages fast, and means there is nowhere for a file to be uploaded to. See [ADR 0002](../adr/0002-static-site-work-in-the-browser.md).

## Enforcing it, not just promising it

1. **Content Security Policy.** `astro.config.mjs` puts a CSP on every page: `default-src 'self'` and `connect-src 'self'`. The browser refuses any request to another origin (fetch, image, script, font, form), so even a buggy or malicious tool can't send data out. Astro adds hashes for its own inline scripts, so no `unsafe-inline` is needed.
2. **Workers too.** Workers take their policy from their own HTTP response, so `public/_headers` gives files under `/_astro/` the same policy plus `wasm-unsafe-eval` for WebAssembly.
3. **Vendored runtime files.** Libraries that fetch files at runtime are copied into the site at build time ([how-to](../how-to/vendor-a-library.md)), so nothing needs another origin.
4. **Tests.** `tests/site.test.js` fails if a page references another origin or lacks the policy. The browser tests in `e2e/` record every request and every CSP violation while using the tools, and fail on either.

See [ADR 0003](../adr/0003-csp-enforces-no-uploads.md).

## One folder per tool

`tools/<group>/<slug>/` holds everything about a tool. The site reads every `tool.json` through an Astro content collection (`src/content.config.ts`) and generates the sidebar, group pages, tool page, search index, sitemap, `llms.txt` and `/api/tools.json`. Contributors never edit shared files, so pull requests don't conflict and every page gets the same metadata and structure. See [ADR 0004](../adr/0004-one-folder-per-tool.md).

## Pages

| URL | Built from |
|---|---|
| `/` | `src/pages/index.astro`: all groups, first row of each |
| `/<group>/` | `src/pages/[category]/index.astro`: every tool and wanted tool in the group |
| `/<group>/<tool>/` | `src/pages/[category]/[tool]/index.astro` wrapping the tool's `Tool.astro` |
| `/saved/` | Tools the visitor saved, from their own `localStorage` |
| `/api/tools.json`, `/llms.txt`, `/sitemap.xml`, `/robots.txt` | Endpoints in `src/pages/` |

## The look

White space, small uppercase navigation, and each tool shown as a studio "product shot" (`src/data/art.ts`) with a yellow **$0** sticker: a shop where everything is free. Sapience navy and the Outfit typeface tie it to Sapience Design. Colours are tokens in `src/styles/global.css` with a dark theme.

## Search engines and AI

Each tool page has its own title, description, canonical URL, and `WebApplication` plus `FAQPage` structured data. The sitemap lists every page. `/llms.txt` and `/api/tools.json` give language models and programs the catalogue directly.
