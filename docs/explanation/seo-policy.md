# How pages earn their place: the search policy

Free the Tools wants to be found by people who search for a job, such as "compress pdf without uploading" or "comprimir pdf". This page says which pages we build for that, and which we refuse. The decision is recorded in [ADR 0011](../adr/0011-search-pages.md).

## The rule

**A page exists because a person needs it, not because a search engine might rank it.** Every page must do one of three things: run a tool, explain how to do a job with a tool, or explain the project. Nothing else is published.

## Pages we build

| Page | Example | Why it earns a place |
|---|---|---|
| Tool page | `/pdf/compress/` | Runs the tool. Its title is the job ("Compress PDF without uploading"), its description says what happens to the file, and its FAQ answers the questions people ask. |
| Group page | `/pdf/` | Lists the tools for one kind of file, and the tools people have asked for. |
| Guide | `/guides/compress-a-pdf-for-email/` | A short how-to for one job, in Diátaxis how-to style: the goal, the steps, the tool embedded, and what to do when it goes wrong. 300 to 600 words. One guide per job, never two guides for the same job. |
| Preset page | `/pdf/compress/under-1-mb/` | A tool page with a preset applied, for a task people search for by its own name. Allowed only when all four conditions below hold. |
| Language page | `/es/pdf/compress/` | The same tool, in the visitor's language, with `hreflang` links between versions. Machine drafts carry a visible "not yet reviewed" note until a person clears it. |
| Comparison | `/compare/uploading/` | Explains, with sources and dates, how a browser-only tool differs from an upload-based service. Names a competitor only to identify it, never with its logo, and lists where the competitor is better. |

## Conditions for a preset page

A preset page is a new page for a search engine, so it is the page most likely to become thin. All four must be true:

1. **People search for it by that name.** Search Console shows the query with impressions. A guess is not enough.
2. **It is a different configuration.** The preset is applied when the page opens (a size target, a paper size, a format), so the page does something the plain tool page does not do by default.
3. **It has its own explanation.** At least two paragraphs that are true only for this preset: why the limit exists, what the trade-off is, what to do if it cannot be met.
4. **The tool page links to it, and it links back.** No orphan pages.

At most three preset pages per tool until data shows more are used.

## Pages we refuse

- One page per keyword variation ("compress pdf online", "pdf compressor free", "reduce pdf size") that run the same tool with the same settings. They are thin, they compete with each other, and they make the site look like a content farm.
- Pages about jobs we cannot do in the browser.
- Pages that exist to carry links, such as a "resources" list.
- Comparison pages that make a claim we cannot test.

## What every page carries

- One `<title>` and one description, written for a person, under 65 and 160 characters.
- A canonical link and, for language pages, `hreflang` links including `x-default`.
- Structured data that matches what is on the page: `WebApplication` for a tool, `FAQPage` only when the questions are visible on the page, `BreadcrumbList` everywhere.
- Links to related tools and to the next likely step, so no page is a dead end.
- A share image drawn at build time.

## How we check

- `tests/site.test.js` fails the build if a page lacks a title, a description, the Content Security Policy or a canonical link, or if two pages share a title.
- A link crawl over `dist/` fails if any page has no inbound link.
- Search Console, read once a month, decides which preset and language pages are kept. A page with no impressions after 90 days is removed or merged.
