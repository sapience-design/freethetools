# Free the Tools — what is left

*Single list. Update it as things move; delete what ships. Live state (2026-10-15): 37 tools in four languages (English, Norwegian, Spanish and Russian), 28 of them in the
npm package for AI assistants, with themes, search, sorting, anonymous usage totals, visit breakdowns and likes, all on freethetools.com.*

## Build (Claude sessions or contributors)

| # | Task | Why | Status |
|---|---|---|---|
| B8 | UI lab: shared UI components, a colour and symbol for each group and tool, and three friendlier layout variants at `/lab/` (noindex) | Product shots are hard to tell apart; tools repeat their own CSS | Superseded by the v4 design port: shared step components, a tint and mark per group, an icon per tool. No `/lab/` |
| B9 | Manual accessibility pass: keyboard only, NVDA and VoiceOver, 200%/400% zoom, text spacing, focus not hidden by sticky bars | Automated checks (now in CI) catch about a third of WCAG issues; see docs/research/2026-09-28-accessibility-speed-audit.md | Automated part done (`e2e/a11y-manual.spec.js`, rewritten for the v4 top bar); the screen-reader pass is O17 |
| B10 | Compress PDF and Compress Images: "Does it need to be under a size?" (No limit / 1 MB / 2 MB / 5 MB), trying lower qualities until the file fits | In the v4 design; not built, so the port leaves it out | Ready |
| B12 | Fill PDF Form: drawn signatures | The v4 help text mentions them as "coming later"; the port does not promise them | Idea |
| B13 | `agent.js` for Markdown to HTML and File Converter | Their logic needs the browser's DOM or canvas, so the contract needs a "browser only" mark first | Ready |
| B14 | A WebAssembly image engine (for example jSquash) for Compress, Convert and Resize Images and PDF to Images | Lets these tools join the agent tools and the npm package, which have no canvas | Ready |

## Shared screens ([ADR 0016](docs/adr/0016-shared-screens.md))

One pull request each, in this order. Every tool keeps its page, its URL and its row in the lists; the tools in one row below open the same screen, ready for their own job. A requested tool keeps the address it has now. Sharing is optional: when it would make a job harder, the tools keep their own screens.

| # | Shared screen | Tools that open it | Request met | Status |
|---|---|---|---|---|
| C1 | The `screen` field: the build check, sharing tools first under "Related tools", tests | — | — | Done with C2a |
| C2a | PDF pages: every page as a tile to move, turn or delete, with buttons as well as dragging (WCAG 2.2, 2.5.7); buttons at the top switch jobs on the same file | Rotate, Delete or Reorder Pages (`/pdf/page-delete/`) | #63 | In review |
| C2b | PDF pages: several output files, and whole files put in order | Split, Merge | — | Ready, after C2a |
| C3 | PDF editor: also fills forms, and stamps text or page numbers on every page | View and Edit, Fill PDF Form, Watermark and page numbers (`/pdf/watermark/`) | #64 | Ready |
| C4 | PDF password: sees whether a PDF is locked and offers the right action | Protect, Unlock | — | Ready |
| C5 | Photo: size, crop, format and quality on one screen; the photo's location is removed by default | Compress, Resize, Convert, HEIC to JPG, Crop (`/images/crop/`) | #66 | Ready |
| C6 | Data: paste CSV, JSON or YAML, tidy it and convert it | JSON Formatter, CSV to JSON, JSON to YAML (`/data/json-to-yaml/`) | #67 | Ready |
| C7 | File Converter: also opens and makes zip files, and refuses zip bombs | File Converter, Zip and Unzip (`/everyday/zip/`) | #65 | Ready |
| C8 | Encode (Base64 and URL Encode) and Time (Unix Timestamp and Time Zone) | — | — | Idea: only if `/stats/` shows people use them together |

## Done recently

Older entries are in [CHANGELOG.md](CHANGELOG.md).

| What | PR | Date |
|---|---|---|
| Release 1.5.0 | — | 2026-10-11 |
| Three new tools: Colour Converter, URL Encode and Decode, Unix Timestamp Converter | — | 2026-10-11 |
| A terms of use page at `/terms/` | — | 2026-10-11 |
| A three-step suggest dialog, also opened from a search with no results | — | 2026-10-11 |
| "I want this" and "Sponsor this tool" on the rows of requested tools | — | 2026-10-11 |
| Anonymous counts of searches that find nothing, shown on `/stats/` (ADR 0007) | — | 2026-10-11 |
| Security checks for every tool (`tests/tool-safety.test.js`) and dependency review on pull requests | — | 2026-10-11 |
| Faster CI: a sample of pages per language on each push, and a daily run of every page | — | 2026-10-11 |
| The npm package `freethetools` 0.1.1 | — | 2026-10-11 |
| HEIC to JPG, with libheif as WebAssembly that the security policy allows | #85 | 2026-10-10 |
| Cloudflare Web Analytics injection and client-side script monitoring switched off; live check green from a US runner (no errors, no warnings) | — | 2026-09-29 |
| Accessibility and speed audit: Lighthouse 99–100 on mobile; axe (WCAG 2.2 AA) on every page, both themes, desktop and phone, now in CI; contrast, label-in-name and landmark fixes | #40 | 2026-09-28 |
| Share images: a 1200×630 PNG for the site, each group and each tool, drawn at build time from the product shots; `og:image` and `summary_large_image` on every page | #39 | 2026-09-28 |
| Compress PDF works in `npm run dev` (its worker no longer imports modules); a worker that fails to load no longer leaves later files spinning | #38 | 2026-09-28 |
| Live check in CI: every sitemap page on desktop and phone, daily and after each production deploy; fails on page errors, enforced CSP violations, outside requests, stats writes or sideways scroll (`npm run check:live`) | #36 | 2026-09-28 |
| Docs brought up to date: architecture, OpenAPI stats summary, llms.txt, commands, deploy (database migrations) | #35 | 2026-09-28 |
| Python dev dependencies bumped (pymupdf 1.28.2, pytest 9.1.1); Dependabot #1 and #2 closed as superseded | #34 | 2026-09-28 |
| Extended anonymous stats: visits with referring site, country and device; per-tool results and errors; /stats breakdowns (ADR 0007). Production D1 migrated. | #32 | 2026-09-28 |
| Themes, search, sorting, anonymous usage totals and likes; 24 new tools; shop redesign — all merged and live | #30 (with #27–#29) | 2026-09-28 |
| Cloudflare JavaScript Detections switched off (`enable_js` was left on after Bot Fight Mode was disabled; the dashboard has no switch for it) | — | 2026-09-28 |
| Deploys via Cloudflare Workers Builds; no Cloudflare secrets in GitHub | #26 | 2026-09-27 |
