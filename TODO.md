# Free the Tools — what is left

*Single list. Update it as things move; delete what ships. Live state (2026-09-28): 25 tools, themes,
search, sorting, anonymous usage totals, visit breakdowns and likes, all on freethetools.com.*

## Build (Claude sessions or contributors)

| # | Task | Why | Status |
|---|---|---|---|
| B8 | UI lab: shared UI components, a colour and symbol for each group and tool, and three friendlier layout variants at `/lab/` (noindex) | Product shots are hard to tell apart; tools repeat their own CSS | Superseded by the v4 design port: shared step components, a tint and mark per group, an icon per tool. No `/lab/` |
| B9 | Manual accessibility pass: keyboard only, NVDA and VoiceOver, 200%/400% zoom, text spacing, focus not hidden by sticky bars | Automated checks (now in CI) catch about a third of WCAG issues; see docs/research/2026-09-28-accessibility-speed-audit.md | Automated part done (`e2e/a11y-manual.spec.js`, rewritten for the v4 top bar); the screen-reader pass is O17 |
| B10 | Compress PDF and Compress Images: "Does it need to be under a size?" (No limit / 1 MB / 2 MB / 5 MB), trying lower qualities until the file fits | In the v4 design; not built, so the port leaves it out | Ready |
| B12 | Fill PDF Form: drawn signatures | The v4 help text mentions them as "coming later"; the port does not promise them | Idea |
| B13 | `agent.js` for Markdown to HTML and File Converter | Their logic needs the browser's DOM or canvas, so the contract needs a "browser only" mark first | Ready |
| B14 | A WebAssembly image engine (for example jSquash) for Compress, Convert and Resize Images and PDF to Images | Lets these tools join the agent tools and the npm package, which have no canvas | Ready |
| B15 | A way to turn off the "/" search shortcut (WCAG 2.1.4) | Found in the accessibility pass. The styled "Skip to content" link shipped with the v4 design | Ready |
| B16 | Rewrite the tutorial around a tool that doesn't exist yet | `docs/tutorial/first-tool.md` builds Word Counter, which now exists, so its scaffold step fails | Ready |

## Done recently

| What | PR | Date |
|---|---|---|
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
