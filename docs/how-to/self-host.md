# How to self-host

Free the Tools is plain files. You can serve your own copy on any static host, on your own server, or on a laptop with no connection. The tools work the same: every job runs in the visitor's browser, and nothing is uploaded.

## What you get

| Part | Needed? | What happens without it |
|---|---|---|
| The built site (`dist/`) | Yes | Nothing to serve |
| The stats Worker (`worker/`) and its D1 database | No | "Most used" and "Most liked" fall back to A–Z, Like buttons do nothing, and `/stats/` says totals are unavailable. Every tool still works. |
| The response headers in `public/_headers` | Recommended | Pages still carry their Content Security Policy in a `<meta>` tag. The extra headers (`X-Frame-Options`, `Referrer-Policy`, cache lifetimes) are missing. |

## Build it

You need Node.js 22.12 or newer.

```sh
git clone https://github.com/sapience-design/freethetools.git
cd freethetools
npm ci
npm run build
```

`dist/` now holds the whole site. Copy it to your host.

## Serve it

**Any static host** (Netlify, GitHub Pages, Vercel, an S3 bucket, a shared web host): upload `dist/`. Hosts that read a `_headers` file (Cloudflare, Netlify) apply the security headers for you.

**Cloudflare Workers, with the stats Worker:** follow [How to deploy](deploy.md). You need your own `wrangler.jsonc` values: remove the `routes` and `d1_databases` entries, or point them at your own domain and database, and run the files in `migrations/` against that database.

**nginx:** serve `dist/` as the root with `try_files $uri $uri/index.html =404;`, and add these headers:

```nginx
add_header X-Content-Type-Options nosniff;
add_header X-Frame-Options DENY;
add_header Referrer-Policy strict-origin-when-cross-origin;
location /_astro/ { add_header Cache-Control "public, max-age=31536000, immutable"; }
```

**Offline, on one machine:** `npm run preview` serves `dist/` at `http://localhost:8788`. Pages that have loaded once keep working without a connection.

## Check it

Open a tool, add a file, and watch the browser's network panel: no request leaves your origin. The same check runs automatically against any copy:

```sh
BASE_URL=https://tools.example.org npm run check:live
```

It fails on any request to another origin, any Content Security Policy violation, or any page error.

## Keep the promise

- Do not add analytics scripts, fonts or images from other origins. The Content Security Policy blocks them, and the site's own tests fail.
- Keep `connect-src 'self'` in `astro.config.mjs`. It is what stops a tool from sending files anywhere.

## Licence and name

The code is AGPL-3.0. If you change it and serve it to others, you must offer them your changed source (AGPL section 13). An unchanged copy needs nothing beyond the licence notice the site already carries.

"Free the Tools" and the Sapience name and logo are trademarks. A changed copy must use its own name and marks; see [TRADEMARKS.md](../../TRADEMARKS.md). Linking back to freethetools.com is welcome and not required.
