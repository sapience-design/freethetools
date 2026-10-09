# How to add a tool group

Groups (PDF, Images, Text…) are the top level of the site: a chip on the home page, a card under "All tools" and a group page. Adding one is a site-wide change, so open an issue first.

1. Add an entry to `CATEGORIES` in [`src/data/categories.ts`](../../src/data/categories.ts):
   - `slug`: the URL.
   - `name`: the chip and card name, e.g. "Audio".
   - `label`: how a sentence names the group, e.g. "Audio tools".
   - `title`: for search results, e.g. "Free audio tools".
   - `mark`: a [Phosphor](https://phosphoricons.com/) icon name.
   - `shot`: the tool whose product shot heads the group page.
   - `blurb`: the group page heading. `sub`: the line under it.
   - `sections`: the headings tools are grouped under.
2. Give it a tint in [`src/styles/global.css`](../../src/styles/global.css): a `--tint-<slug>` token in the light set and both dark sets, and a `[data-g="<slug>"]` rule.
3. Add a product-shot backdrop for it to `BACKDROPS` in [`src/data/art.ts`](../../src/data/art.ts) (`[wall, floor]`, the floor being the tint), and a fallback drawing to `GROUP`, keyed by the slug.
4. Add the tint to `TINT` in [`src/lib/og.js`](../../src/lib/og.js) for share images.
5. Optionally list wanted tools for it in [`src/data/wanted.json`](../../src/data/wanted.json).
6. Run `npm run build`. The group page, home card, chip, sitemap entry and API entry appear automatically.
