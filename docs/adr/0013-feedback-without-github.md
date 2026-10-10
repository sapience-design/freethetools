# 13. Feedback without GitHub

Date: 2026-10-10 · Status: accepted (decided by Sapience Design) · Extends [ADR 0006](0006-anonymous-usage-totals.md)

## Context

Until now a visitor who wanted a tool, or found a problem, had to open a GitHub issue. That needs a GitHub account. Most people who use these tools are not developers and have no account.

We also want to count how many people want each tool that is not built yet. A GitHub 👍 counts only GitHub users.

## Decision

**A page for every tool that is not built yet.** Each entry in `src/data/wanted.json` has a `slug`, a `task`, a `concept` (what goes in, what comes out, the options) and, where one exists, the GitHub `issue`. The site builds a page at `/<group>/<slug>/`, the address the tool will have. The page says "Not built yet" and has an "I want this" button, a link to the form, a link to sponsorship and, for developers, a link to the issue.

- The page is `noindex` and left out of the sitemap and the llms files. A page that cannot do the job must not rank ([search policy](../explanation/seo-policy.md)).
- When the tool is built, its entry leaves `wanted.json` and the address becomes the tool. The build fails if a wanted address is also a real tool, so an old entry cannot hide one.

**"I want this" is one more anonymous daily total.** `POST /api/stats/want` takes `{ "tool": "<group>/<slug>" }`. The Worker accepts only ids of planned tools, only from the site's own origin, and adds one to a row in a new D1 table, `wants(tool, day, n)`, with a daily ceiling. The browser remembers its votes in `localStorage` (`ftt:wanted`), so a browser votes once. Like a like, a vote the person pressed is sent even if the browser asks sites not to track.

**One form, sent by email.** `/suggest/` takes a suggestion or a problem report. `POST /api/feedback` checks the same origin and a body of about 6 KB, validates the fields, and sends one plain-text email to `hello@freethetools.com` with the Cloudflare `send_email` binding (`FEEDBACK`). The message is built by hand (`worker/logic.js`), so there is no new dependency. The binding can send only to that one address.

- **Nothing is stored.** The Worker keeps no copy. The message exists only as an email.
- **No account.** The email address is optional and is used only as `Reply-To`.
- **Without the binding** (local development, previews) the Worker answers 503, and the page offers a `mailto:` link with the message filled in, so nothing typed is lost.

## Consequences

**Better.** Anyone can ask for a tool or report a problem without an account. The wanted count covers all visitors, and a wanted page gives a sponsor something to point at.

**Spam.** The form has no CAPTCHA. Two things hold it back:

1. A hidden `website` field. People never see it and cannot reach it. A request that fills it gets a 204 and no email.
2. A Cloudflare rate-limiting rule on `POST /api/feedback`, set in the dashboard (not in this repository).

A determined script can still send mail within the rate limit. If that happens, the next step is Cloudflare Turnstile, which would add a third-party script and need a change to the content security policy.

**Costs.**

- Email Routing must be on for `freethetools.com`, with `hello@freethetools.com` verified as a destination. Without it, sending fails with a 502 and the page shows the `mailto:` link.
- Maintainers read and answer by email. There is no public thread and no vote list, so a request is not visible to other people until a maintainer adds the tool to `wanted.json`.
- The privacy page must describe the form, because a message can hold an email address and anything the person writes.
- A new table needs `npx wrangler d1 migrations apply` before deploy (`migrations/0003_wants.sql`).
