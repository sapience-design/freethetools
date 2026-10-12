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

## Update 2026-10-11: two channels, and failures are reported

A visitor saw "We couldn't send this right now". The Worker had no logs, so the cause was unknown, and a failed send left no trace. One email was the only path.

**Two channels.** `POST /api/feedback` now delivers each message by email (as before) and as an issue in a private GitHub repository, `FEEDBACK_REPO` (default `sapience-design/freethetools-inbox`), using the Worker secret `GITHUB_TOKEN`. It counts as delivered when at least one works (204). It answers 502 only when every configured channel failed, and 503 when none is configured (local development, previews). A channel with no secret or variable is skipped.

- **The issue holds no identity.** The title is "Suggestion: " or "Problem: " plus the first 60 characters. The body has the kind, the tool, the message in a code fence and "What do you use today?". Backticks are replaced, so the text cannot mention a person, link or load an image. The email address stays in the email, as `Reply-To`. Labels: `suggestion` or `problem`, and `needs triage`. The builder is `buildIssue` in `worker/logic.js`.
- **The repository is private**, so the "nothing is stored" line above no longer holds. The privacy page now says the message is also kept as an issue, without the email address.

**Failures are counted and reported.** A failed channel adds one to a daily row in `dims` (dim `fail`, key `feedback-email` or `feedback-github`), never the text, address or reason. The reason (status code or error name only) goes to `console.error`. Workers Logs are on (`observability` in `wrangler.jsonc`), free on the Workers free plan. `GET /api/health` returns the counts for today and yesterday (UTC), for example `{"feedbackFailures":{"email":0,"github":0}}`. `scripts/live-check.mjs` fails when any count is above zero, so the daily Live check fails and GitHub emails the owner. The row stays visible for two UTC days, so one failure can fail two checks in a row. The public stats summary leaves dim `fail` out.

**The page retries once** after 2 seconds on a server or network error, then keeps the typed text, offers the `mailto:` link and shows the status ("Error 502").

**Costs.** The owner creates the private repository and a fine-grained token (Issues: read and write, this repository only, with an expiry) and renews it before it expires. When it expires, the GitHub channel fails and shows in `/api/health`; email keeps working. Setup: [How to set up feedback delivery](../how-to/feedback-delivery.md).
