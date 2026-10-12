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

## Update 2026-10-12: email to a verified destination

Every email failed. The binding sent to `hello@freethetools.com`, which is a routing address in Email Routing, not a verified destination address. A Worker may send only to verified destination addresses, which Cloudflare does free on every plan, "including when only Email Routing is configured" ([pricing](https://developers.cloudflare.com/email-service/platform/pricing/), checked 2026-10-12). Sending to any other address is Email Sending, which needs the Workers paid plan.

**Decision.** The `send_email` binding names no address, so it can send only to verified destinations in the account. The Worker sends to the Worker secret `FEEDBACK_TO`: the maintainers' inbox, which is the verified destination `hello@freethetools.com` forwards to. The address stays out of this public repository. `cleanMailbox` in `worker/logic.js` accepts only one plain address, so the secret cannot add mail headers. Without the secret, the email channel is skipped, as the GitHub channel is without its token.

The earlier line "with `hello@freethetools.com` verified as a destination" no longer applies.

## Update 2026-10-12: context, subject and HTML email

The maintainers asked where a message came from, and the subject "Suggestion: new tool" said nothing.

**Decision.** The form also sends the page it was opened on, the search words when it was opened from a search with no results, and the site language. The form at /suggest/ sends the page the visitor came from, when it is on this site. The dialog lists these on its last step and the form names the page, before anything is sent. `parseFeedback` keeps a page only when it is a path on this site, search words up to 100 characters, and a two- or three-letter language code. Anything else is dropped without refusing the message.

The subject starts with the message, for example "Suggestion for images/join: Please add a tool…". The email is `multipart/alternative`: plain text first, then an HTML part in the site's colours. Every visitor value in the HTML is escaped, and its links go only to freethetools.com or the visitor's own address. The GitHub copy carries the same context and still never the email address.
