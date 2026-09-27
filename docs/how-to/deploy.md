# How to deploy

Maintainers only. Contributors never need to deploy: merging to `main` does it.

The site is plain files served by **Cloudflare Workers static assets** (`wrangler.jsonc`). There is no Worker code, so nothing runs on a server. freethetools.com and www.freethetools.com are attached as custom domains.

## Automatic (normal)

The [deploy workflow](../../.github/workflows/deploy.yml) builds and tests every push to `main` and runs `wrangler deploy`. Pull requests from branches in this repository get a preview URL (`pr-<number>-freethetools.<account>.workers.dev`) in the run summary and the deployment environment. Pull requests from forks don't, because forks can't read repository secrets; reviewers check those locally with `npm run build && npm run preview`.

It needs two repository secrets:

| Secret | Value |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | The Cloudflare account ID |
| `CLOUDFLARE_API_TOKEN` | A custom API token with **Account → Workers Scripts → Edit** and **Zone → Workers Routes → Edit** (freethetools.com only) |

Create the token at dash.cloudflare.com → My Profile → API Tokens → Create Token → Create Custom Token.

## Manual

```sh
npm run deploy        # build, then wrangler deploy
```

## Rolling back

```sh
npx wrangler deployments list
npx wrangler rollback <version-id>
```

Then revert the commit on `main`.

## Email

freethetools.com uses Cloudflare Email Routing: `hello@`, `security@`, `conduct@` and a catch-all forward to the Sapience inbox. Change it under the zone's Email → Email Routing.

## Zone settings that must stay off

Cloudflare features that inject scripts into pages clash with the Content Security Policy (the browser blocks them) and with the no-tracking pledge. Keep these **off** for freethetools.com:

- Security → Bots → **Bot Fight Mode** and **JavaScript detections**
- Web Analytics automatic setup, Rocket Loader, Email Address Obfuscation, Zaraz

`BASE_URL=https://freethetools.com npm run test:e2e` fails with a CSP violation if one of them is switched on.
