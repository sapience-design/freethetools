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

## 2026-10-11: searches that find nothing, and AI sources without a referrer

**Search misses.** When a search on the home page shows no result, the browser may send one `POST /api/stats/search` with `{"term": "..."}`. It sends after the query stays the same for 1.5 seconds, or when the person presses Enter or "Suggest it" on the empty state. It sends once per distinct term per page load, only for a search across all tools, and never when Global Privacy Control or Do Not Track is on. It goes through the same sampling helper as events.

- **Filter** (`normalizeSearch` in `worker/logic.js`; the Worker decides, the browser runs the same function): trim, lowercase, collapse spaces; 2 to 40 characters; at most 6 words; only letters of any script (`\p{L}`, plus combining marks), spaces, hyphens, apostrophes, "+" and "&". A digit, "@", "/", "\", ":", "." or any other character drops the whole term, which keeps out emails, phone numbers, links, file names and IDs. Nothing is stored for a dropped term.
- **Storage:** the existing `dims` table, `dim = 'search'`, `key` = the term, per UTC day. No migration. Like the other dimensions, a term is never linked to a country, device or source.
- **Cap:** each term counts at most 200 per day (`MIN(n + excluded.n, 200)`), so one person cannot inflate it.
- **Publish thresholds:** `GET /api/stats/summary` returns `site.searches`: up to 20 terms from the last 30 days, each with at least 5 searches in total on at least 3 different days, most searched first. One-off and planted words stay private. `/stats/` lists them as text.

**Sources without a referrer.** Some AI assistants (ChatGPT adds `utm_source=chatgpt.com`) hide the referrer. When `document.referrer` is empty, `trackVisit` uses `utm_source`, or `ref`, if it looks like a host name. The Worker's `normalizeRef` validates it again and keeps only the source name. The source list now names ChatGPT (including chat.openai.com), Perplexity, Claude, Gemini and Copilot.

Consequence: the stats page shows what people look for and do not find. The privacy page and the "what we count" list on `/stats/` say so.
