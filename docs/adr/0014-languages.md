# 14. Languages

Date: 2026-10-10 · Status: accepted (decided by Sapience Design) · Extends the language-page rule in the [search policy](../explanation/seo-policy.md)

## Context

Most people who need these tools do not read English well. We plan eight languages over time: Norwegian bokmål (`nb`), Ukrainian (`uk`), Russian (`ru`), Spanish (`es`), German (`de`), Portuguese (`pt`), French (`fr`) and Japanese (`ja`). The first phase builds the groundwork and `nb`. The other seven must arrive by adding translation files, with no code change.

We checked Astro's built-in i18n routing. It needs the locale list in `astro.config.mjs` and a page folder per locale, so each new language would mean a code change. We do not use it.

## Decision

**Addresses.** English stays at the root (`/pdf/compress/`). Every other language has a prefix: `/nb/`, `/nb/pdf/`, `/nb/pdf/compress/`. Slugs stay English. One route, `src/pages/[lang]/[...rest].astro`, builds the translated pages. Its `getStaticPaths` lists the languages that have a file in `src/i18n/`.

**A language exists when its file exists.** `src/i18n/<lang>.json` holds a `meta` block (`name`, `dir`, `locale`, `reviewed`) and the interface strings. English is `src/i18n/en.json` and is the source of truth.

| Text | Where it lives |
| --- | --- |
| Interface strings (`ui`) | `src/i18n/<lang>.json`. `src/i18n/en.json` is extracted from the templates. |
| Group names, section names, wanted tools, "Most people come for" lines, search synonyms | The same file, under `groups`, `sections`, `wanted`, `popular` and `search`. The English source stays in `categories.ts`, `wanted.json` and `popular.ts`. |
| One tool's name, task, tagline, description, SEO title, FAQ and spec table | `tools/<group>/<slug>/i18n/<lang>.json`, the same shape as `tool.json`. The build checks it with the same limits. |

`t(lang, key)` falls back to English, so a missing string never breaks a page. The build stops on a key that a translation has and `en.json` lacks, because that is a typo or a leftover. It lists missing keys as warnings, because a language may be partly done.

**Pages with a translation.** Home, group pages, tool pages (the shell: heading, task, tagline, FAQ, side column), wanted-tool pages and the 404 page. A tool page exists in a language only when the tool has a text file for it. The tool's own working area stays English for now, so a translated tool page shows one note: "The buttons in this tool are still in English."

**Pages that stay English.** About, Privacy, How it works, Support, AI, What's new, Verify, Stats, Suggest, Library and Favourites. Translated pages link to them normally.

**Every page.** It has `<html lang>` and `dir`, a self canonical, `hreflang` links for every language that has this page plus `x-default` (English), and `og:locale`. Breadcrumbs use the translated names and addresses. The share image is the English one.

**Language switcher.** A list of plain links in the footer. Each language is written in its own name. A link goes to the same page in that language when it exists, and otherwise to that language's home. The current language has `aria-current="true"`.

**Machine drafts say so.** `meta.reviewed` is `false` until a person approves the language. A page in such a language starts with a slim note: "This page was translated by machine and has not been checked yet." with a link to report a problem. The owner reviews `nb`. A client reviews `uk` and `ru`. `scripts/translation-sheet.mjs <lang> <file>` writes a two-column table (English, translation) for the reviewer.

**Search.** On a translated home page, the index holds the translated name and task, plus the English name, task, keywords and synonyms, so English words still work. A language file may add its own synonym groups and filler words under `search`.

**Script text.** The pages embed a small JSON block (`#ftt-ui`) with the strings that scripts need (donation card, "On this page", counts). `src/lib/ui.ts` reads it and falls back to English. The block is built from the page's language, which is the same value as `document.documentElement.lang`.

**Service worker.** No change. The shell lists only `/` and `/offline/`. A translated page is kept after it has been opened, like any page.

**Addresses of the 404 page.** `/nb/404.html` is built, and the Worker serves it for a missing address under `/nb/`.

## Consequences

**Better.** A new language costs a JSON file, the tool text files and a review. No template changes.

**Costs and limits.**

- Each language adds about one page per tool, group and home page. The sitemap grows by the same number.
- Duplicate-content risk is handled by self canonicals and `hreflang`. A machine draft that nobody reviews should not stay indexed for long. Search Console decides which language pages stay ([search policy](../explanation/seo-policy.md)).
- The tools' working areas, and the long reading pages, are not translated yet. That is phase 2.
- Right-to-left scripts and non-Latin fonts are not needed for the eight languages planned, except Japanese, Ukrainian and Russian, which need fonts checked when they are added.
- A language code must not equal a top-level page or group name (`about`, `pdf`, …). The build checks it.
