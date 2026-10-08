# `tool.json` reference

Every tool folder, `tools/<group>/<slug>/`, has a `tool.json`. The build validates it against the schema in [`src/content.config.ts`](../../src/content.config.ts) and stops with a clear message if something is wrong.

The URL comes from the folder: `tools/pdf/compress/` is served at `/pdf/compress/`.

| Field | Required | Rules | Used for |
|---|---|---|---|
| `name` | yes | 2–40 characters | Product name: the tag above the heading, the sub line in lists, search, API |
| `task` | yes | 4–48 characters | The job in plain words, e.g. "Make a PDF smaller". Page heading, lists, share image |
| `icon` | no | A [Phosphor](https://phosphoricons.com/) icon name, e.g. `arrows-in`; default: the group's mark | Icon tile in lists |
| `short` | yes | 2–24 characters | Extra search words, e.g. "Compress" |
| `tagline` | yes | 10–110 characters | Line under the heading on the tool page and group page, share image |
| `seoTitle` | yes | 10–65 characters | Browser tab and search-result title. Use the words people search for. |
| `description` | yes | 50–160 characters | Search-result snippet, API, llms.txt |
| `section` | yes | One of the group's sections in `src/data/categories.ts` | Where it sits on the group page |
| `keywords` | yes | At least 3 | Site search |
| `authors` | yes | At least 1 `{ "name", "github"? }` | Credits on the page and in structured data |
| `status` | no | `live` or `beta`, default `live` | Beta tools are labelled |
| `added` | yes | `YYYY-MM-DD` | Spec table, sitemap `lastmod` |
| `offline` | no | Boolean, default `true` | "Nothing is uploaded" wording |
| `cli` | no | File name in the tool's `cli/` folder | Links to the command-line version |
| `specs` | no | `{ "Label": "Value" }` | Extra rows in the spec table |
| `faq` | no | `[{ "q", "a" }]` | Questions beside the tool and FAQ structured data for search engines. Start with whether anything is uploaded. |
| `vendor` | no | `[{ "from", "to" }]` | Runtime files copied from `node_modules`; see [vendoring](../how-to/vendor-a-library.md) |

## Other files in the folder

| File | Required | Purpose |
|---|---|---|
| `Tool.astro` | yes | The working area of the page |
| `core.js` | recommended | Logic without page code |
| `tests/*.test.js` | recommended | Run by `npm test` with Node's test runner |
| `README.md` | recommended | Notes for maintainers and reviewers |
| `cli/` | no | A command-line version |

Tools can also have a custom product-shot drawing: add it to `PIECES` in `src/data/art.ts`, keyed by the tool id (`"<group>/<slug>"`).
