# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html): a new tool is a minor
version, a fix is a patch, and a change to URLs, `tool.json` or the API is a major version.

## [Unreleased]

### Added (extended stats)

- Anonymous visit totals, one per browser session, with separate daily counts of referring site (a name such as "Google", never a link), country and device type (phone, tablet, desktop); shown on /stats/ for the last 30 days.
- Per-tool outcomes: results downloaded or copied, and errors when a tool can't process something; /stats/ shows a "Worked" rate. See ADR 0007.

### Accessibility

- Every page, in light and dark, on desktop and phone, is checked against WCAG 2.2 AA with axe-core in CI (`e2e/a11y.spec.js`).
- Fixed: muted text contrast on grey surfaces, the faded Compress PDF example, drop zones whose spoken name didn't match their visible text, Regex Tester highlights in dark mode, and the phone header bar is now a landmark. Audit: `docs/research/2026-09-28-accessibility-speed-audit.md`.
- Browser tests now cover the manual accessibility pass (`e2e/a11y-manual.spec.js`): a keyboard-only walk, roles and live regions, reflow at 320 and 640 px, text spacing, and focus not hidden by sticky bars.
- Fixed: on phones the closed menu drawer is out of the tab order, the open drawer takes and keeps focus and returns it on close, search results and sorting are announced to screen readers, and the JWT, QR and Regex error boxes are announced.

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

[Unreleased]: https://github.com/sapience-design/freethetools/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/sapience-design/freethetools/releases/tag/v1.0.0
