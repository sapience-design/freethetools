# Free the Tools — what is left

*Single list. Update it as things move; delete what ships. Live state (2026-09-28): 25 tools, themes,
search, sorting, anonymous usage totals, visit breakdowns and likes, all on freethetools.com.*

## Build (Claude sessions or contributors)

| # | Task | Why | Status |
|---|---|---|---|
| B6 | Accessibility (WCAG 2.2 AA) and speed (Lighthouse) audit of home, a group page and three tools; fix what's found | Never formally done | Ready |
| B8 | UI lab: shared UI components, a colour and symbol for each group and tool, and three friendlier layout variants at `/lab/` (noindex) | Product shots are hard to tell apart; tools repeat their own CSS | Prompt written 2026-09-28 |

## Owner (Sapience Design)

| # | Task | Where | Status |
|---|---|---|---|
| O2 | Add freethetools.com to Google Search Console and Bing Webmaster Tools; submit `https://freethetools.com/sitemap.xml` | search.google.com/search-console, bing.com/webmasters | Open |
| O3 | Rate-limiting rule on `/api/stats/*` (e.g. 30 requests / 10 s per visitor) | Cloudflare → Security → WAF → Rate limiting rules | Open |
| O5 | Test Email Routing: one mail each to security@ and hello@freethetools.com | Any mail client | Open |
| O6 | Launch posts when happy: Show HN, r/opensource, Product Hunt | — | Open |
| O7 | Optional: sign up for the OpenSSF Best Practices badge | bestpractices.dev | Open |
| O8 | Decide whether Dependabot PRs skip the sign-off check. If yes, add `if: github.event.pull_request.user.login != 'dependabot[bot]'` to the `signoff` job in `.github/workflows/dco.yml`. Until then, a maintainer re-applies each bump in a signed-off PR, as #34 did. | GitHub (CI changes need the owner) | Open |
| O10 | **Urgent:** turn off Cloudflare Web Analytics automatic setup for freethetools.com. Outside the EU, Cloudflare injects `static.cloudflareinsights.com/beacon.min.js` into every page. The CSP blocks it, so nothing is collected, but every page shows a CSP error and makes an outside request. The live check fails on all 68 page checks from a US runner and is clean from Norway, which matches the setting "Enable, excluding visitor data in the EU". | Cloudflare → Analytics & Logs → Web Analytics → freethetools.com → Manage site → Disable | Open |
| O9 | Turn off Cloudflare's client-side script monitoring. On about 1 in 14 page views it adds a report-only CSP that makes the visitor's browser send reports (page and script URLs) to csp-reporting.cloudflare.com. It blocks nothing, but the pledge says pages contact no other server. The live check warns while it is on. | Cloudflare → freethetools.com → Security → Client-side security (Page Shield) → settings | Open |

## Parked

| Task | Why |
|---|---|
| HEIC to JPG (#11) | heic2any and libheif's embind build use `new Function`, which the CSP blocks. Needs a libheif WebAssembly build without embind; see the issue. |

## Done recently

| What | PR | Date |
|---|---|---|
| Share images: a 1200×630 PNG for the site, each group and each tool, drawn at build time from the product shots; `og:image` and `summary_large_image` on every page | #39 | 2026-09-28 |
| Compress PDF works in `npm run dev` (its worker no longer imports modules); a worker that fails to load no longer leaves later files spinning | #38 | 2026-09-28 |
| Live check in CI: every sitemap page on desktop and phone, daily and after each production deploy; fails on page errors, enforced CSP violations, outside requests, stats writes or sideways scroll (`npm run check:live`) | #36 | 2026-09-28 |
| Docs brought up to date: architecture, OpenAPI stats summary, llms.txt, commands, deploy (database migrations) | #35 | 2026-09-28 |
| Python dev dependencies bumped (pymupdf 1.28.2, pytest 9.1.1); Dependabot #1 and #2 closed as superseded | #34 | 2026-09-28 |
| Extended anonymous stats: visits with referring site, country and device; per-tool results and errors; /stats breakdowns (ADR 0007). Production D1 migrated. | #32 | 2026-09-28 |
| Bot Management API token deleted; freethehardware.com registered | — | 2026-09-28 |
| Themes, search, sorting, anonymous usage totals and likes; 24 new tools; shop redesign — all merged and live | #30 (with #27–#29) | 2026-09-28 |
| Cloudflare JavaScript Detections switched off (`enable_js` was left on after Bot Fight Mode was disabled; the dashboard has no switch for it) | — | 2026-09-28 |
| Deploys via Cloudflare Workers Builds; no Cloudflare secrets in GitHub | #26 | 2026-09-27 |
