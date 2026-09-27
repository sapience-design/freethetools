# How to deploy

Maintainers only. Contributors never need to deploy: merging to `main` does it.

## Automatic (normal)

The [deploy workflow](../../.github/workflows/deploy.yml) builds and tests every push to `main` and publishes `dist/` to the Cloudflare Pages project `freethetools`, which serves freethetools.com. Pull requests from branches in this repository get a preview URL posted by the workflow. Pull requests from forks don't, because forks can't read repository secrets; reviewers check those locally with `npm run build && npm run preview`.

It needs two repository secrets:

| Secret | Value |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | The Cloudflare account ID |
| `CLOUDFLARE_API_TOKEN` | An API token with **Account → Cloudflare Pages → Edit** only |

Create the token at dash.cloudflare.com → My Profile → API Tokens → Create Token → Custom token.

## Manual

```sh
npm run build
npx wrangler pages deploy dist --project-name freethetools --branch main
```

## Rolling back

Cloudflare dashboard → Workers & Pages → freethetools → Deployments → pick an earlier deployment → Rollback. Then revert the commit on `main`.
