# 6. Anonymous usage totals and likes

Date: 2026-09-28 · Status: accepted (decided by Sapience Design)

## Context

Visitors want to see which tools are popular and useful, and to sort by it. The pledge said "no tracking", and the site had no server code.

## Decision

Count three things per tool, per UTC day, as plain totals in a Cloudflare D1 database: **views** (once per browser session), **uses** (once per visit, only when someone actually works with the tool) and **likes** (one per browser, reversible). A small Worker (`worker/`) answers `/api/stats/*` on the site's own domain; everything else stays static.

Never stored: IP addresses, cookies, identifiers, user agents, or anything entered into a tool. Browsers sending Global Privacy Control or Do Not Track don't send views or uses. Only same-origin writes for known tool ids are accepted. Branch previews have no database binding.

The pledge wording changes from "no tracking" to "no tracking of you: only anonymous totals", and a public `/stats/` page shows the numbers and exactly what is and isn't collected.

## Consequences

- Sorting by most used and most liked, and counts on cards and tool pages.
- The Content Security Policy is unchanged (`connect-src 'self'`).
- Likes can be inflated by a determined script; the numbers are a guide, not a vote. An edge rate-limit rule on `/api/stats/*` is recommended.
- The free Workers plan covers 100,000 counted events a day; beyond that the site would need the $5/month plan.
