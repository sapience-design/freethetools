# 7. Visit breakdowns and tool outcomes

Date: 2026-09-28 · Status: accepted (decided by Sapience Design) · Extends [ADR 0006](0006-anonymous-usage-totals.md)

## Context

The owner wanted to see a little more (where visitors come from, which countries and devices, and whether each tool actually works for people) without adding an analytics product. PostHog and similar tools need a third-party script or a proxy, a cookie or local ID, and a consent banner, and would loosen the Content Security Policy.

## Decision

Extend the same Worker and D1 database with:

- **Visits**: one per browser session, sent from any page to `POST /api/stats/visit`. A visit is not counted when you arrive from another page on this site.
- **Per visit, three separate daily totals**:
  - **Referring site**: only the host name of `document.referrer`. Well-known hosts are mapped to a name ("Google", "Hacker News", "X"); anything that isn't a plain host name is dropped; no referrer is "Direct".
  - **Country**: the two-letter code from Cloudflare's network (`request.cf.country`); Tor and unknown become "XX".
  - **Device type**: phone, tablet or desktop, from `userAgentData.mobile`, pointer type and screen size. No user-agent string is sent.
- **Per tool, two more columns**:
  - **Successes**: a result was downloaded (`a[download]`) or copied (a Copy button).
  - **Errors**: the tool reported that it could not process something (`reportFailure()` in `src/lib/files.ts`, also called by `showError`).
  - Only the kind is sent, never the file, the value or the error text. At most 20 outcomes are sent per page load.

The breakdowns are stored in a `dims(day, dim, key, n)` table. Each dimension is its own counter, so a visit from Norway cannot be linked to the Google referral or to a phone. Nothing is linked to a tool.

Global Privacy Control and Do Not Track still stop everything except likes pressed by hand. `/stats/` shows the last 30 days of breakdowns and a "Worked" rate per tool.

## Consequences

- Still no cookies, IDs, IP addresses or user agents stored; the CSP is unchanged (`connect-src 'self'`). No consent banner is needed.
- Visit counts are lower bounds. They miss GPC/DNT browsers and anyone whose session storage is blocked.
- "Worked" only means something for tools that produce a file or a copyable result. Tools like the word counter show "–".
- Every visit writes up to four rows. The free Workers and D1 limits still cover roughly 25,000 visits a day.
- Migration `0002_outcomes_and_dims.sql` must be applied to the production database before the Worker ships (`npx wrangler d1 migrations apply DB --remote`).
