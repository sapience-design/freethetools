# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html): a new tool or feature is a
minor version, a fix is a patch, and a change that breaks existing URLs or the API is a
major version.

## [Unreleased]

### Added

- `/llms-full.txt`: every tool with its details and questions in one plain-text file for language models, linked from `/llms.txt`.

## [1.1.0] - 2026-10-09

The first release since launch: 27 new tools (28 in all), a new design, tools for AI agents with a library of every job, Share, anonymous usage totals, and WCAG 2.2 AA checks on every page.

**For contributors:** `tool.json` now requires `task`, the job the tool does in a few words ("Make a PDF smaller").

### Changed (design round 4)

- New look and layout from the v4 design: cream paper, ink outlines, a yellow highlight, and a tint and mark for each group; Bricolage Grotesque headings; Phosphor icons. Light and dark themes.
- The sidebar is gone. A top bar holds the name, About and Saved; the home page has the search box, group chips, sorting (Most used, Newest, Most liked, A–Z), "Most people come for" and a card per group.
- Tools are named by the job they do ("Make a PDF smaller"), with the product name in a tag. `tool.json` gains `task` (required) and `icon` (optional).
- Every tool is laid out as numbered steps. File tools now run when you press the button (choose, options, run, save) instead of on drop, and show "Working on it", "Done" and plain-language problems, with "Do another". Text tools still work as you type.
- Share images, the favicon and the app icons are redrawn in the new style.
- Search ranks a half-typed word ("compres") above a near miss in a task name ("Compare").
- Dark mode keeps the light mode's feel: neutral charcoal, light outlines and shadows, and the same pastel group colours a step dimmer, with dark text on them.
- Pages use a 1280 px container shared by the top bar, content and footer (was 1080 px, with the bar full width), and text stops at a 65-character line. The home page shows six popular tools and three group cards per row; tool pages have a fixed side column and show options side by side when there is room.
- Each group card on the home page has one way in: a "See all 7 tools" pill in its header ("7 tools" when the card is narrow).
- "Sort by" sits on the "All tools" line, or beside a group's results when a group is chosen. It hides during a text search, whose results are in best-match order. "Nothing found" is centred under the search box.
- Every chosen file shows its details: photos get a thumbnail and their type and size in pixels; PDFs show their pages and paper size, and PDF to Images draws page 1. Compress PDF warns about a password-locked PDF before you run it. Remove Photo Location lists the location, date, camera and other hidden data it found as soon as a photo is added, or says the photo is already safe to share.

### Changed (hosting)

- The site answers only on freethetools.com and www.freethetools.com, not on a workers.dev address.
- Branch previews are made on demand by a maintainer (`npm run preview:cloud`) instead of automatically, so their links, which show account details, are no longer posted to public pull requests.

### Added (releases)

- Releases: `npm run release -- <version>` cuts a release on a branch, and merging it tags the commit and publishes a GitHub Release with the notes from this file (`docs/how-to/release.md`). The footer of every page shows the version, linked to its notes.

### Added (tools)

- Unlock PDF (pdf, new Security section): removes a PDF's password, or its printing and copying restrictions, with qpdf compiled to WebAssembly (`@jspawn/qpdf-wasm`, Apache-2.0). Lossless: pages, forms and the rest of the file are kept. It asks for the password only when a PDF needs one to open, never guesses, and never keeps it: not in the page, the library or the stats. Also an agent tool, `unlock_pdf`, on the page and in the package.
- Share: a Share button next to every result to download, on tool pages, in the AI agent activity panel and in the library. It opens the device's own share menu (mail, messages, AirDrop, Nearby Share, Files) through the Web Share API, and shows only where the browser can share that kind of file. A completed share counts as a success in the anonymous totals and records the job in the library, like a download.
- Markdown to HTML (text): Markdown to HTML and HTML to Markdown, with a live, cleaned preview, Copy and Download. Uses marked, Turndown and DOMPurify.
- File Converter (everyday): drop any files, it detects each type from its first bytes and converts in the browser, one row per file. Images (PNG, JPEG, WebP, GIF, BMP, ICO, SVG, AVIF) to PNG, JPEG, WebP, BMP or ICO; audio to 16-bit WAV; CSV, TSV and JSON to each other; Markdown and HTML to each other or to plain text. Links to the specialised tools, and to the tool request form for anything it can't convert yet.

### Added (extended stats)

- Anonymous visit totals, one per browser session, with separate daily counts of referring site (a name such as "Google", never a link), country and device type (phone, tablet, desktop); shown on /stats/ for the last 30 days.
- Per-tool outcomes: results downloaded or copied, and errors when a tool can't process something; /stats/ shows a "Worked" rate. See ADR 0007.

### Added (AI agents)

- Tools for AI agents, so assistants use Free the Tools instead of installing software (ADR 0008). Each tool folder can have an `agent.js`: a name, a description, an input schema and a `run` function built on `core.js`. The contract is `src/agent/contract.js`. 25 agent tools in 22 folders, all checked and run by `npm test`.
- The `freethetools` npm package (`packages/freethetools/`): `npx freethetools mcp` is an MCP server for Claude Code, Claude Desktop, Cursor and other clients, and `freethetools run <tool>` is a command line. It runs the same definitions on the person's computer, with Ghostscript as WebAssembly, and keeps a library of every job in a `freethetools` folder in the home folder. Setup: `docs/how-to/use-with-ai.md`. Not published to npm yet.
- WebMCP on tool pages: where the browser has `document.modelContext`, a tool page registers its agent tools (`src/agent/page.js`), plus `list_page_files`. An agent names a file the person added to the page, or passes `{ name, base64 }` for a file up to 10 MB. Every call shows in an "AI agent activity" panel with download links. Other browsers see no change, and other pages load none of this code. Agent calls are not counted in the anonymous stats.
- A library of every job, kept in this browser (IndexedDB): results the person downloads, recorded without editing any tool, and agent calls. Records keep the options used, never text, secrets or form answers. New page `/library/` (not indexed) lists records with settings, inputs and downloadable results, deletes one record or all, shows the space used, and in Chrome and Edge opens the `freethetools` package's folder. A "Library" link sits beside Saved in the top bar.
- `src/data/origin-trials.json` holds WebMCP origin-trial tokens; each becomes a `<meta http-equiv="origin-trial">` tag.

### Accessibility

- Every page, in light and dark, on desktop and phone, is checked against WCAG 2.2 AA with axe-core in CI (`e2e/a11y.spec.js`).
- Fixed: muted text contrast on grey surfaces, the faded Compress PDF example, drop zones whose spoken name didn't match their visible text, Regex Tester highlights in dark mode, and the phone header bar is now a landmark. Audit: `docs/research/2026-09-28-accessibility-speed-audit.md`.
- Browser tests now cover the manual accessibility pass (`e2e/a11y-manual.spec.js`): a keyboard-only walk, roles and live regions, reflow at 320 and 640 px, text spacing, and focus not hidden by sticky bars.
- Fixed: search results, the selected result, group filters and sorting are announced to screen readers, and the JWT, QR and Regex error boxes are announced.

### Added (share images)

- Link previews: every page has a 1200×630 share image (`og:image`, `twitter:card`), drawn at build time from the tool's product shot, name and tagline (`src/lib/og.js`, `src/pages/og/`). Text is converted to outlines from the site's own fonts, so images are the same on every machine.

### Fixed

- Compress PDF works in `npm run dev`: the worker is a plain script and receives its Ghostscript arguments from the page. If the worker can't load, files added afterwards show the error instead of spinning.

### Added (checks)

- Live check (`npm run check:live`, `.github/workflows/live.yml`): every page on freethetools.com, on desktop and phone, daily and after each production deploy. It fails on page errors, enforced CSP violations, requests to other origins, stats writes or sideways scroll, and warns about report-only policies added by Cloudflare.

### Documentation

- Architecture explanation brought up to date: the stats Worker, themes, search, fonts and all pages.
- `openapi.yaml` 1.1.0 describes `GET /api/stats/summary`; `/llms.txt` links the stats; the commands reference covers local and production database migrations.

### Added (theme, search, stats)

- Light, Dark and System themes with a switch in the sidebar, remembered per browser and applied before the first paint.
- Search with typo tolerance, partial words, synonyms ("combine" finds Merge) and arrow-key navigation (MiniSearch, MIT).
- Sorting on every shelf: Featured, Most used, Most liked, Newest, A–Z.
- Anonymous usage totals (views, uses) and likes per tool, via a small Worker and Cloudflare D1; a public /stats/ page shows the numbers and what is and isn't collected. See ADR 0006.

### Changed

- The sidebar is a full-height panel with its own surface, pinned theme switch, and a scrollbar only on hover; the footer moved into the content column; thin theme-coloured scrollbars everywhere; dark mode lifted off black.
- Pledge wording: "no tracking" became "no tracking of you; only anonymous totals".

### Added

- 15 new tools: Merge PDFs, Split PDF, Rotate Pages, Images to PDF, Word Counter, Case Converter, Text Diff, JSON Formatter, CSV to JSON, Base64, Hash Generator, UUID Generator, QR Code Maker, Unit Converter, Time Zone Converter.
- Batch two: Compress Images, Resize Images, Convert Image Format, Remove Photo Location (lossless), PDF to Images (pdf.js), Fill PDF Form (beta), Password Generator, JWT Decoder, Regex Tester.
- Shared DropZone and ToolShot components and tool interface styles.
- Browser tests for every tool page (clean load, no outside requests) and end-to-end file flows.

### Changed

- Deploys now run on Cloudflare Workers Builds from `main`; the GitHub deploy workflow and its secret are removed, so no Cloudflare credentials live in GitHub. Branches in this repository get preview links.

- Redesign for a calmer, more confident look: one type scale and 8-point spacing, a large opening statement, the available tool shown as a feature, planned tools as a list instead of placeholder cards, sentence-case sidebar with an overview per group, and a new footer.
- Typography follows Cloudflare's open-source Kumo scale (12, 13, 14, 16, 20, 24 and 30px) in Inter Variable, with Kumo's neutral colours. Outfit is replaced by Inter.
- Pricing labels removed everywhere (price stickers, "free forever" lines and the price row in specs). The app icon and wordmark no longer show a price.

## [1.0.0] - 2026-09-27

### Added

- The site: catalogue, two-level sidebar, search, Saved tools, About and Licences pages.
- **Compress PDF** (`/pdf/compress/`): Ghostscript in the browser, four quality presets, keep-first-page option, and a Python command-line version.
- Content Security Policy on every page, blocking connections to other origins.
- Machine-readable catalogue at `/api/tools.json` (with `openapi.yaml`), `/llms.txt`, sitemap and robots file.
- Tool template and `npm run new-tool` scaffolder.
- Tests: tool unit tests, built-site checks, browser tests on desktop and phone, Python CLI tests.
- Open-source project files: contributor guide with DCO sign-off, Contributor Covenant 2.1, security policy, governance, trademarks, issue and pull-request templates, CI, CodeQL, OpenSSF Scorecard and Dependabot.

[Unreleased]: https://github.com/sapience-design/freethetools/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/sapience-design/freethetools/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/sapience-design/freethetools/releases/tag/v1.0.0
