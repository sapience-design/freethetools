# Pull request checklist

One list for everyone who opens a pull request, people and AI assistants alike, so every change
updates the same things in the same way.

1. Run `npm run docs:check`. It reads the files your branch changes and prints the parts of this
   list that apply, ticking what the branch already updates. The output is a Markdown checklist
   you can paste into the pull request.
2. Update what applies. For each item you leave unchanged, say why in the pull request, for
   example "npm tool table: no `agent.js` changed".
3. Before review, everything under [Every pull request](#every-pull-request) is done.

`npm run docs:check` never fails a build: it is a reminder, not a gate. The headings below match
its sections; `tests/docs-check.test.js` keeps the two in step.

## Every pull request

- One tool or one fix, on a branch from an up-to-date `main`.
- `npm run check` passes: build, unit, site and browser tests.
- The build rewrites two generated lists, the tool list in `README.md` and the tool table in
  `packages/freethetools/README.md`. If it changed them, commit them. CI rebuilds before testing,
  so a stale copy in git is not caught.
- Commit messages are [Conventional Commits](https://www.conventionalcommits.org/), and every
  commit is signed off with `git commit -s` by its author. The DCO check enforces the sign-off;
  nothing checks the message format.
- A changelog entry in `changelog.d/` (see its README) for anything people notice on the site, in
  the npm package or in the assistant plugins. Nothing checks that one exists.
- A screenshot for anything visible: desktop and phone, light and dark.
- Tool code or shared code: checked against the security review list in `CONTRIBUTING.md`.
- The pull request says what was checked and left unchanged, and why.

## A new tool

- `tool.json`: every TODO replaced. The schema passes TODO text, so check by eye. The search
  fields follow the [search policy](../explanation/seo-policy.md): `seoTitle` 10 to 65 characters,
  `description` 50 to 160, `task`, `tagline`, `keywords` and `faq`.
- `i18n/es.json`, `i18n/nb.json` and `i18n/ru.json` in the tool folder, with the same FAQ and spec
  count as `tool.json`. A missing file is only a build warning.
- `tests/` and an `agent.js`, so assistants and the npm package can use the tool. If the tool
  cannot have one (it needs the browser's canvas, DOM or video), say so in `TODO.md` and in the
  Limits section of `packages/freethetools/README.md`.
- Commit the regenerated `README.md` and `packages/freethetools/README.md`.
- `TODO.md`: the tool counts in its first line.
- Generated at build, nothing to commit: the `/ai/` and `/ai.md` tables, `llms.txt`,
  `llms-full.txt`, `/api/tools.json`, the sitemap, the share image and the in-page agent tools.

## A tool's text

A changed `tool.json`: the same change in the tool's `i18n/es.json`, `i18n/nb.json` and
`i18n/ru.json`. The build fails when the FAQ or spec counts differ.

## A tool's agent

A new or changed `agent.js`:

- Run `npm run test:package`. `npm run check` does not run the package tests; CI does.
- Commit the regenerated `packages/freethetools/README.md`.
- A tool that gains its first `agent.js`: remove it from the Limits section of
  `packages/freethetools/README.md` and from `TODO.md`, and update the counts in `TODO.md`.
- A new kind of job: the job lists written by hand in `src/data/ai.ts` (`PROMPT`),
  `packages/freethetools/src/mcp.js` (`INSTRUCTIONS`), `GEMINI.md` and
  `plugins/freethetools/skills/free-the-tools/SKILL.md`. Keep `GEMINI.md` and `SKILL.md` the same
  text; no test compares them.

## Interface text

A new or changed key in `src/i18n/en.json`: the same key in `src/i18n/nb.json`, `src/i18n/es.json`
and `src/i18n/ru.json`. `tests/i18n.test.js` fails when one is missing. A tool's working area
stays in English.

## Shared parts

Changes to `src/lib/`, `src/components/`, `src/layouts/` or `src/styles/`:

- `docs/explanation/architecture.md`, where it describes how tools look and behave.
- `docs/tutorial/first-tool.md` and `tools/_template/`, if the way to build a tool changes.
- `CONTRIBUTING.md` and `AGENTS.md`, if the change brings a rule every tool must follow.
- Never change the theme's tokens to make one part look different.

## Browser storage

New `localStorage`, `sessionStorage` or IndexedDB use. Store settings only, never file contents,
file names or typed text.

- The `LOCAL` map in `src/pages/how-it-works.astro`, so "What this browser stores" names the key
  and can clear it.
- The list on `src/pages/privacy.astro`, and `src/pages/at-work.astro` for IT teams.
- An ADR in `docs/adr/` if it changes what the site keeps.

## Browser features

New use of the clipboard, workers, WebAssembly, the service worker or another browser feature an
IT team may restrict: the "Browser features it uses" list on `src/pages/at-work.astro`. Read the
clipboard only from a paste the person makes.

## Network and security policy

Changes to `astro.config.mjs`, `public/_headers`, `wrangler.jsonc`, `worker/` or `migrations/`:

- Never weaken the Content Security Policy.
- An ADR in `docs/adr/`.
- `src/pages/privacy.astro` and `src/pages/at-work.astro` if anything new is counted or allowed.
- `openapi.yaml` if the Worker's API changes; `docs/explanation/architecture.md` for the stats.
- `SECURITY.md` if the build or deploy pipeline changes.
- A new migration runs on the production database before the code that needs it merges
  (`docs/reference/commands.md`).

## A new page

- Add it to the static list in `src/pages/sitemap.xml.ts`, or mark it `noindex`.
  `tests/site.test.js` fails otherwise.
- Add its path to `RESERVED` in `src/data/catalogue.ts`, so no language code can take the same
  address. Nothing checks this.
- A new kind of page follows `docs/explanation/seo-policy.md` and needs its own build tests.
- Link to it from somewhere, such as the footer in `src/layouts/Base.astro`. Nothing checks for
  pages without links.

## Dependencies

A new or updated dependency in `package.json`:

- An exact version and a licence compatible with AGPL-3.0
  ([how to vendor a library](../how-to/vendor-a-library.md)).
- `NOTICE` and the list in `src/pages/licenses.astro`, with the version. Nothing checks either.

## Commands

A new or changed npm script: `docs/reference/commands.md`.

## The npm package

Changes in `packages/freethetools/`:

- Run `npm run test:package`.
- `packages/freethetools/README.md`, written by hand outside the generated table.
- Releasing: the version in every place `docs/how-to/release.md` lists. Tests compare only the
  plugin and Gemini versions with the package.

## Assistant plugins

Changes to `GEMINI.md`, `gemini-extension.json`, `server.json`, `.claude-plugin/` or `plugins/`:

- `GEMINI.md` and `plugins/freethetools/skills/free-the-tools/SKILL.md` stay the same text.
- Versions in `gemini-extension.json`, `server.json` and the plugin manifests match
  `packages/freethetools/package.json`.

## Visible changes

Pages, components, styles or a tool's page: screenshots in the pull request, desktop and phone,
light and dark. The theme stays as it is.

## A decision

Something others must follow from now on: an ADR in `docs/adr/`, numbered after the last one.

## Before merge

- CI passes: build, unit, site and browser tests, and the package tests on three systems
  (`ci.yml`); signed-off commits (`dco.yml`); CodeQL; dependency review.
- A code owner approves (`.github/CODEOWNERS`).
- The reviewer checks what no workflow checks: commit messages, the changelog entry, screenshots,
  regenerated READMEs, `NOTICE` and the licences page, storage on the privacy pages, and new pages
  in `RESERVED`.
- After merge, the daily checks test every page in every language (`all-pages.yml`) and the live
  site (`live.yml`).
