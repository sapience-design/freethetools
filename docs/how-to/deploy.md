# How to deploy

Contributors never deploy. **Merging to `main` is the deploy**, and only maintainers can merge (branch protection requires a code-owner review).

The site is plain files served by **Cloudflare Workers static assets** (`wrangler.jsonc`). There is no Worker code, so nothing runs on a server. freethetools.com and www.freethetools.com are attached as custom domains.

## Automatic: Cloudflare Workers Builds

Cloudflare is connected to this repository and builds it on its own infrastructure. **No Cloudflare credentials are stored in GitHub**, so there is nothing a workflow, fork or contributor could leak.

| Setting (Workers & Pages → freethetools → Settings → Build) | Value |
|---|---|
| Production branch | `main` |
| Build command | `npm ci && npm run build && npm test && npm run test:site` |
| Deploy command | `npx wrangler deploy` |
| Non-production branch builds | On |
| Non-production deploy command | `npx wrangler preview` (the default; needs the `previews` block in `wrangler.jsonc`). **Never** `wrangler deploy`, which would publish the branch to production. |

- A push to `main` builds, tests and publishes freethetools.com. If the tests fail, nothing is published.
- A push to any other branch **in this repository** uploads a preview version with its own `*.workers.dev` link. Production is untouched. Forks are never built.
- Build logs: Workers & Pages → freethetools → Deployments.

GitHub Actions still runs the full checks (CI with browser tests, CodeQL, DCO, Scorecard); none of them need secrets.

## Manual (maintainers, emergencies)

```sh
npm run deploy        # build, then wrangler deploy, using your own `wrangler login`
```

## Rolling back

Workers & Pages → freethetools → Deployments → pick an earlier version → Rollback. Or:

```sh
npx wrangler deployments list
npx wrangler rollback <version-id>
```

Then revert the commit on `main`.

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
