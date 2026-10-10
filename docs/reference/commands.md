# Commands

| Command | What it does |
|---|---|
| `npm run dev` | Copies vendored files, then starts the site at http://localhost:4321 with live reload |
| `npm run build` | Copies vendored files, validates every `tool.json`, builds the static site into `dist/` |
| `npm run preview` | Serves `dist/` and the stats Worker with Cloudflare's local server at http://localhost:8788, including `_headers`. For working stats, run `npx wrangler d1 migrations apply DB --local` once first. |
| `npm run preview:cloud` | Maintainers only: builds, then makes a private Cloudflare preview of the current branch with your own `wrangler login`. The link prints only in your terminal; never paste it into a pull request. Delete it after merging with `npx wrangler preview delete --name <branch>`. |
| `npm run release -- <major\|minor\|patch\|x.y.z>` | Maintainers only: on an up-to-date `main`, moves the entries in `changelog.d/` and "Unreleased" in `CHANGELOG.md` under the new version, sets it in `package.json`, and commits that on a `release/vX.Y.Z` branch. Merging its pull request tags and publishes the release. See [How to release](../how-to/release.md). |
| `npm test` | Unit tests in `tools/*/*/tests/` and `src/agent/` |
| `npm run test:package` | Builds the `freethetools` npm package and runs its tests (installs its dependencies first if they are missing). Kept out of `npm test` so production deploys never depend on it. |
| `npm run build:package` | Builds the `freethetools` npm package into `packages/freethetools/dist/` |
| `npm run setup:package` | Installs the package's own dependencies (`npm ci` in `packages/freethetools/`) |
| `npm run test:site` | Checks the built site (titles, descriptions, canonical links, CSP, unique ids, sitemap), plus search and stats-rule unit tests |
| `npm run test:e2e` | Browser tests on desktop and phone, against the local Worker with a local database (started automatically). Run `npx playwright install chromium` once first. |
| `npx wrangler d1 migrations apply DB --remote` | Owner only: apply new files in `migrations/` to the production stats database, before merging the code that needs them |
| `npm run check:live [url]` | Read-only check of the live site (default https://freethetools.com): every page in the sitemap on desktop and phone. Also runs daily in CI and after each production deploy. |
| `npm run check` | Build, then unit, site and browser tests |
| `npm run new-tool -- <group> <slug> "<Name>" [section]` | Scaffold a tool from `tools/_template` |
