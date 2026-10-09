# How to deploy

Contributors never deploy. **Merging to `main` is the deploy**, and only maintainers can merge (branch protection requires a code-owner review).

The site is plain files served by **Cloudflare Workers static assets** (`wrangler.jsonc`). The only server code is the small Worker in `worker/` that answers `/api/stats/*` (anonymous usage totals) and serves the 404 page; every other request is served straight from the static files. freethetools.com and www.freethetools.com are attached as custom domains.

## Automatic: Cloudflare Workers Builds

Cloudflare is connected to this repository and builds it on its own infrastructure. **No Cloudflare credentials are stored in GitHub**, so there is nothing a workflow, fork or contributor could leak.

| Setting (Workers & Pages → freethetools → Settings → Build) | Value |
|---|---|
| Production branch | `main` |
| Build command | `npm ci && npm run build && npm test && npm run test:site` |
| Deploy command | `npx wrangler deploy` |
| Enable Preview Builds (Branch control) | **Off** |

- A push to `main` builds, tests and publishes freethetools.com. If the tests fail, nothing is published.
- A push to any other branch builds nothing on Cloudflare. GitHub Actions still runs every check on it.
- The site answers only on freethetools.com and www.freethetools.com: `wrangler.jsonc` sets `workers_dev` to `false`.

## Previews of a branch

Automatic preview builds are off because Cloudflare posts each preview's link, with account details, as a comment on the pull request, and this repository is public. Cloudflare has no setting to keep the builds and drop the comments.

A maintainer makes a preview on demand instead:

1. Check out the branch.
2. Run `npm run preview:cloud`. It builds the site and uploads a Preview named after the branch, using your own `wrangler login`.
3. Open the link it prints. Share it privately; never paste it into a pull request, issue or commit.
4. After the merge, delete it: `npx wrangler preview delete --name <branch>`.

Previews have no database binding, so usage totals show as unavailable and never touch the real numbers. To try a branch without Cloudflare, run `npm run build` and then `npm run preview`.
- Build logs: Workers & Pages → freethetools → Deployments.

GitHub Actions still runs the full checks (CI with browser tests, CodeQL, DCO, Scorecard); none of them need secrets.

## Manual (maintainers, emergencies)

```sh
npm run deploy        # build, then wrangler deploy, using your own `wrangler login`
```

## Database changes (stats)

The stats database (D1 `freethetools-stats`) changes only through numbered files in `migrations/`. Workers Builds does not apply them. When a pull request adds one:

1. Make the migration additive: new columns with defaults, or new tables, so the live Worker keeps working.
2. Apply it before merging: `npx wrangler d1 migrations apply DB --remote`.
3. Merge. The new Worker then finds the columns it expects.

## Rolling back

Workers & Pages → freethetools → Deployments → pick an earlier version → Rollback. Or:

```sh
npx wrangler deployments list
npx wrangler rollback <version-id>
```

Then undo the cause on `main`: press **Revert** on the merged pull request, and merge the pull request GitHub opens. To go back to a named version, see [How to release](release.md#go-back-to-a-version).

## Email

freethetools.com uses Cloudflare Email Routing: `hello@`, `security@`, `conduct@` and a catch-all forward to the Sapience inbox. Change it under the zone's Email → Email Routing.

## Zone settings that must stay off

Cloudflare features that inject scripts into pages clash with the Content Security Policy (the browser blocks them) and with the privacy pledge. Keep these **off** for freethetools.com:

- Security → Settings → **Bot Fight Mode** (on the free plan it also switches on JavaScript Detections, which cannot be disabled separately)
- **AI Labyrinth**, and **AI bot policies** set to allow (we want AI assistants to find the site)
- Managed robots.txt / Bot Preference Sync
- Web Analytics automatic setup, Rocket Loader, Email Address Obfuscation, Zaraz

Continuous script monitoring can stay on: it only watches for changed scripts.

`BASE_URL=https://freethetools.com npm run test:e2e` fails with a CSP violation if one of them is switched on.
