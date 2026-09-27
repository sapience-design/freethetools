# How to add a tool group

Groups (PDF, Images, Text…) are the top level of the sidebar. Adding one is a site-wide change, so open an issue first.

1. Add an entry to `CATEGORIES` in [`src/data/categories.ts`](../../src/data/categories.ts): `slug` (the URL), `name`, `title` (for search results, e.g. "Free audio tools"), `blurb`, and its `sections`.
2. Add a product-shot drawing for it in [`src/data/art.ts`](../../src/data/art.ts), keyed by the slug. Keep the 400 × 500 frame and the floor shadow.
3. Optionally list wanted tools for it in [`src/data/wanted.json`](../../src/data/wanted.json).
4. Run `npm run build`. The group page, sidebar entry, sitemap entry and API entry appear automatically.
