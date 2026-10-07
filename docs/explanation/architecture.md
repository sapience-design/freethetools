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

`tools/<group>/<slug>/` holds everything about a tool. The site reads every `tool.json` through an Astro content collection (`src/content.config.ts`) and generates the sidebar, group pages, tool page, search index, sitemap, `llms.txt` and `/api/tools.json`. Contributors never edit shared files, so pull requests don't conflict and every page gets the same metadata and structure. See [ADR 0004](../adr/0004-one-folder-per-tool.md).

## Pages

| URL | Built from |
|---|---|
| `/` | `src/pages/index.astro`: every group as a shelf, with sorting |
| `/<group>/` | `src/pages/[category]/index.astro`: every tool and wanted tool in the group |
| `/<group>/<tool>/` | `src/pages/[category]/[tool]/index.astro` wrapping the tool's `Tool.astro`, with Like, usage count and FAQ |
| `/saved/` | Tools the visitor saved, from their own `localStorage` |
| `/library/` | `src/pages/library.astro`: every job done in this browser, by the visitor or an AI agent, with the results to download again. It can also open the package's library folder (Chrome and Edge). |
| `/stats/` | Anonymous usage totals, and exactly what is and isn't counted |
| `/about/`, `/licenses/` | The pledge and the third-party credits |
| `/api/tools.json`, `/llms.txt`, `/sitemap.xml`, `/robots.txt` | Endpoints in `src/pages/` |

## Tools for AI agents

AI assistants can use the tools instead of installing software to do a file job. Each tool folder can have an `agent.js`: a name, a description, an input schema and a `run` function built on the tool's `core.js`. The contract is in `src/agent/contract.js`, and the reasoning in [ADR 0008](../adr/0008-tools-for-ai-agents.md).

The same definitions serve two channels. Neither sends files anywhere.

| Channel | Code | How it works |
|---|---|---|
| WebMCP on tool pages | `src/agent/page.js` | When the browser supports WebMCP (Chrome and Edge origin trials), the page registers its tools. An AI agent in the browser calls them on files the person added to the page, or on small files passed in the call. Each call shows in an "AI agent activity" panel on the page. |
| MCP server in the npm package `freethetools` | `packages/freethetools/` | `npx freethetools mcp` runs the same definitions in Node on the person's computer, for Claude Code, Claude Desktop, Cursor and other MCP clients. Files are paths on disk. Ghostscript runs as WebAssembly, as on the site. |

There is no hosted MCP server, because the agent would have to upload the files.

## The library

Every job is recorded on the device that did it, so a person can see what they or an agent did and download the results again. The library is on by default and can be cleared at any time.

- **On the site**, records and result files live in the browser's IndexedDB (`src/agent/db.js`). A person's own jobs are captured from the download links a tool creates; agent jobs are recorded when they run. Nothing is sent.
- **In the package**, records go to `library.jsonl` in a `freethetools` folder in the person's home folder, with result files beside it.
- Both use one record format, `src/agent/library.js`, so `/library/` can open the package's folder too.

## Search and sorting

Search runs in the browser with [MiniSearch](https://github.com/lucaong/minisearch) over an index built from every `tool.json`, expanded with synonyms (`src/data/synonyms.js`) so "combine" finds Merge. It allows typos in longer words, matches partial words, and ignores filler words (`src/lib/search.js`). Shelves sort by Featured, Most used, Most liked, Newest or A–Z, using the totals below when they are available.

## Anonymous usage totals

`worker/index.js` answers `/api/stats/*` and nothing else. Cloudflare D1 (`freethetools-stats`) holds only daily totals:

- per tool: views, uses, results downloaded or copied, errors, and likes
- per site visit, one per browser session: separate counts of referring site (a name, never a link), country and device type

The Worker writes only for requests from the site's own origin and for known tool ids. It never stores IP addresses, cookies or user agents. The browser sends nothing, apart from likes pressed by hand, when it has Global Privacy Control or Do Not Track set. Branch previews have no database binding, so they never touch the real numbers. The data model is in `migrations/`, and the reasoning is in [ADR 0006](../adr/0006-anonymous-usage-totals.md) and [ADR 0007](../adr/0007-visits-and-outcomes.md).

## The look

A minimal shop:

- A full-height sidebar that drills into each group.
- White space.
- Each tool shown as a studio "product shot" (`src/data/art.ts`). Tools that have been requested but not built appear as clay prototypes marked "Made to order".

Type:

- Follows Cloudflare's open-source Kumo scale (12–30px).
- Set in Schibsted Grotesk, with Instrument Serif for headings and IBM Plex Mono for code.
- All three are self-hosted.

Colour:

- Kumo's neutrals, plus a single yellow accent. The accent and the Sapience wordmark tie the site to Sapience Design.
- Light, Dark and System themes. The choice is stored per browser and applied before the first paint.
- Colours and sizes are tokens in `src/styles/global.css`.

## Search engines and AI

Each tool page has its own title, description, canonical URL, and `WebApplication` plus `FAQPage` structured data. The sitemap lists every page. `/llms.txt` and `/api/tools.json` give language models and programs the catalogue directly; `openapi.yaml` describes the API, including the public stats summary.
