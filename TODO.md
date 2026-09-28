# Free the Tools — what is left

*Single list. Update it as things move; delete what ships. Live state (2026-09-28): 25 tools, themes,
search, sorting, anonymous usage totals and likes, all on freethetools.com.*

## Build (Claude sessions or contributors)

| # | Task | Why | Status |
|---|---|---|---|
| B1 | Extended anonymous stats: countries, referring sites, device types, and per-tool success/error counts on /stats | See more without PostHog: no cookies, no IDs, no consent banner, CSP unchanged | Waiting on owner (O4) |
| B2 | Share image (`og:image`) for the site and every tool | Links in Slack, LinkedIn, X and iMessage show no preview | Ready |
| B3 | Bring docs up to date: `docs/explanation/architecture.md` (still says Inter and "no server"), stats API in `openapi.yaml` and `/llms.txt`, tool counts in README | Contributors and AI tools read these | Ready |
| B4 | Review and merge Dependabot PRs #1 (pytest) and #2 (PyMuPDF) | Routine upkeep | Ready |
| B5 | Compress PDF in `npm run dev`: its worker only runs in the built site | Contributors should be able to test it locally | Ready |
| B6 | Accessibility (WCAG 2.2 AA) and speed (Lighthouse) audit of home, a group page and three tools; fix what's found | Never formally done | Ready |
| B7 | Read-only live check in CI: every page on freethetools.com, no page errors, CSP violations or outside requests (stats writes stubbed) | Would have caught Cloudflare's injected script automatically | Ready |

## Owner (Sapience Design)

| # | Task | Where | Status |
|---|---|---|---|
| O1 | Remove the one-off Bot Management API token | Cloudflare → My Profile → API Tokens | Open |
| O2 | Add freethetools.com to Google Search Console and Bing Webmaster Tools; submit `https://freethetools.com/sitemap.xml` | search.google.com/search-console, bing.com/webmasters | Open |
| O3 | Rate-limiting rule on `/api/stats/*` (e.g. 30 requests / 10 s per visitor) | Cloudflare → Security → WAF → Rate limiting rules | Open |
| O4 | Decide on extended anonymous stats (B1) | — | Open |
| O5 | Test Email Routing: one mail each to security@ and hello@freethetools.com | Any mail client | Open |
| O6 | Launch posts when happy: Show HN, r/opensource, Product Hunt | — | Open |
| O7 | Optional: register freethehardware.com; sign up for the OpenSSF Best Practices badge | Cloudflare Registrar; bestpractices.dev | Open |

## Parked

| Task | Why |
|---|---|
| HEIC to JPG (#11) | heic2any and libheif's embind build use `new Function`, which the CSP blocks. Needs a libheif WebAssembly build without embind; see the issue. |

## Done recently

| What | PR | Date |
|---|---|---|
| Themes, search, sorting, anonymous usage totals and likes; 24 new tools; shop redesign — all merged and live | #30 (with #27–#29) | 2026-09-28 |
| Cloudflare JavaScript Detections switched off (`enable_js` was left on after Bot Fight Mode was disabled; the dashboard has no switch for it) | — | 2026-09-28 |
| Deploys via Cloudflare Workers Builds; no Cloudflare secrets in GitHub | #26 | 2026-09-27 |
