# Architecture and the no-upload guarantee

## The promise

Every tool runs on the visitor's device, and their files never leave it. Everything else follows from that.

## A static site with the work in the browser

The site is plain HTML, CSS and JavaScript built by [Astro](https://astro.build) and served as static files by Cloudflare Workers. A tool is a page whose script does the work in the browser tab, in a Web Worker when it is heavy (Compress PDF runs Ghostscript compiled to WebAssembly). No server ever sees a file.

This keeps hosting free, pages fast, and means there is nowhere for a file to be uploaded to. See [ADR 0002](../adr/0002-static-site-work-in-the-browser.md).

The one piece of server code is a small Worker (`worker/`) for anonymous usage totals at `/api/stats/*`. It is described [below](#anonymous-usage-totals). Cloudflare serves every other request straight from the static files, without running it.

## Enforcing it, not just promising it

1. **Content Security Policy.** `astro.config.mjs` puts a CSP on every page: `default-src 'self'` and `connect-src 'self'`. The browser refuses any request to another origin (fetch, image, script, font, form), so even a buggy or malicious tool can't send data out. Astro adds hashes for its own inline scripts, so no `unsafe-inline` is needed; style attributes are not allowed either, so pages set dynamic styles through CSS variables from script.
2. **Workers too.** Workers take their policy from their own HTTP response, so `public/_headers` gives files under `/_astro/` the same policy plus `wasm-unsafe-eval` for WebAssembly.
3. **Vendored runtime files.** Libraries that fetch files at runtime are copied into the site at build time ([how-to](../how-to/vendor-a-library.md)), so nothing needs another origin.
4. **Tests.** `tests/site.test.js` fails if a page references another origin, lacks the policy, or repeats an element id. The browser tests in `e2e/` record every request and every CSP violation while using the tools, and fail on either.

See [ADR 0003](../adr/0003-csp-enforces-no-uploads.md).

## One folder per tool

`tools/<group>/<slug>/` holds everything about a tool. The site reads every `tool.json` through an Astro content collection (`src/content.config.ts`) and generates the home page, group pages, tool page, search index, sitemap, `llms.txt` and `/api/tools.json`. Contributors never edit shared files, so pull requests don't conflict and every page gets the same metadata and structure. See [ADR 0004](../adr/0004-one-folder-per-tool.md).

## Pages

| URL | Built from |
|---|---|
| `/` | `src/pages/index.astro`: every group as a shelf, with sorting |
| `/<group>/` | `src/pages/[category]/index.astro`: every tool and wanted tool in the group |
| `/<group>/<tool>/` | `src/pages/[category]/[tool]/index.astro` wrapping the tool's `Tool.astro`, with Like, usage count and FAQ |
| `/saved/` | Tools the visitor saved, from their own `localStorage` |
| `/stats/` | Anonymous usage totals, and exactly what is and isn't counted |
| `/about/`, `/licenses/` | The pledge and the third-party credits |
| `/api/tools.json`, `/llms.txt`, `/sitemap.xml`, `/robots.txt` | Endpoints in `src/pages/` |

## Search and sorting

Search runs in the browser with [MiniSearch](https://github.com/lucaong/minisearch) over an index built from every `tool.json`, expanded with synonyms (`src/data/synonyms.js`) so "combine" finds Merge. It allows typos in longer words, matches partial words, and ignores filler words (`src/lib/search.js`). Shelves sort by Featured, Most used, Most liked, Newest or A–Z, using the totals below when they are available.

## Anonymous usage totals

`worker/index.js` answers `/api/stats/*` and nothing else. Cloudflare D1 (`freethetools-stats`) holds only daily totals:

- per tool: views, uses, results downloaded or copied, errors, and likes
- per site visit, one per browser session: separate counts of referring site (a name, never a link), country and device type

The Worker writes only for requests from the site's own origin and for known tool ids. It never stores IP addresses, cookies or user agents. The browser sends nothing, apart from likes pressed by hand, when it has Global Privacy Control or Do Not Track set. Branch previews have no database binding, so they never touch the real numbers. The data model is in `migrations/`, and the reasoning is in [ADR 0006](../adr/0006-anonymous-usage-totals.md) and [ADR 0007](../adr/0007-visits-and-outcomes.md).

## The look

Design round 4 ("v4"), from the Claude Design project *Free the Tools v4*. The design files are kept outside the repo; the owner has them.

Layout:

- A sticky top bar: the mark and name, About, and Saved (on the home page) or All tools (elsewhere).
- Home: one headline, a search box ("What do you need to do?"), group filter chips, a sort control, "Most people come for", then one card per group with its top three tools.
- Tools are named by the job they do ("Make a PDF smaller"); the product name ("Compress PDF") sits in a tag above. Both come from `tool.json` (`task`, `name`).
- Each tool page is a column of numbered steps (`src/components/Step.astro`): choose, pick options, save. File tools run when you press the button; text tools work as you type. A side column holds the privacy note, the questions and the tool's details and credits.
- Each group has a tint and a mark (a Phosphor icon); each tool has its own icon (`icon` in `tool.json`). The studio product shots (`src/data/art.ts`) sit on the group's tint.
- Chosen files are rows with a thumbnail and the details that matter for the tool (`fileRow`, `photoRow` in `src/lib/files.ts`; PDF pages and paper size from `src/lib/pdfinfo.ts`).
- Raised things have an ink outline and a 3px drop shadow. Requested tools that aren't built yet are listed on group pages as "Not built yet", linking to the request.

Type:

- Bricolage Grotesque for headings, Schibsted Grotesk for text, IBM Plex Mono for code and numbers. All three are self-hosted.

Colour:

- Cream paper, warm ink and one yellow highlight, with a tint for each group.
- Light, Dark and System themes, switched in the footer. The choice is stored per browser and applied before the first paint.
- Dark mode inverts the sticker look (neutral charcoal page, light outlines and shadows) and keeps the coloured parts as pastel "islands", a step dimmer, with ink text. The island list is one selector in `src/styles/global.css`; add an element to it when it sits on a tint.
- Colours, radii and shadows are tokens in `src/styles/global.css`, which also holds the shared tool classes (steps, choices, pills, fields, file rows, result boxes).

Icons are Phosphor (MIT), inlined at build time by `src/components/Icon.astro`, so pages load no icon files.

## Search engines and AI

Each tool page has its own title, description, canonical URL, and `WebApplication` plus `FAQPage` structured data. The sitemap lists every page. `/llms.txt` and `/api/tools.json` give language models and programs the catalogue directly; `openapi.yaml` describes the API, including the public stats summary.
