# Free the Tools

**Every tool free. Nothing uploaded. Build the next one.**

[freethetools.com](https://freethetools.com) is a growing shelf of everyday tools, such as compressing a PDF, that run entirely in your browser. There are no accounts, no limits, no ads and no tracking. Every page carries a Content Security Policy that stops it from sending your data to any other server, and the automated tests fail if a tool tries.

Free the Tools is a [Sapience](https://sapience.design) initiative, built in the open with anyone who wants to help.

[![CI](https://github.com/sapience-design/freethetools/actions/workflows/ci.yml/badge.svg)](https://github.com/sapience-design/freethetools/actions/workflows/ci.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/sapience-design/freethetools/badge)](https://scorecard.dev/viewer/?uri=github.com/sapience-design/freethetools)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue)](LICENSE)

## Use it

Open [freethetools.com](https://freethetools.com). That's it.

Developers and AI agents can read the catalogue at [`/api/tools.json`](https://freethetools.com/api/tools.json) (described in [`openapi.yaml`](openapi.yaml)) or [`/llms.txt`](https://freethetools.com/llms.txt). Some tools also ship a command-line version in their `cli/` folder.

## Request a tool

[Open a tool request](https://github.com/sapience-design/freethetools/issues/new?template=tool_request.yml). Vote for existing requests with a 👍. Requests a maintainer accepts are labelled `wanted` and show on the site as open requests.

## Build a tool

Most tools take an afternoon. The [contributor guide](CONTRIBUTING.md) walks you through it:

```sh
git clone https://github.com/sapience-design/freethetools.git
cd freethetools
npm install
npm run new-tool -- text word-counter "Word Counter"
npm run dev          # http://localhost:4321/text/word-counter/
```

## How it works

| | |
|---|---|
| `tools/<group>/<tool>/` | One folder per tool: `tool.json` (name, search text, specs, questions), `Tool.astro` (the interface), `core.js` (the logic) and tests |
| `src/` | The site: sidebar, catalogue, product pages, API and search files, all built from the tool folders |
| `astro.config.mjs` | The Content Security Policy that keeps every page on its own origin |
| `e2e/`, `tests/` | Browser tests and checks on the built site |
| `docs/` | Tutorials, how-to guides, reference and design decisions |

The site is static [Astro](https://astro.build), hosted as static files on Cloudflare Workers, which builds and deploys every merge to `main`. Read [docs/explanation/architecture.md](docs/explanation/architecture.md) for the reasoning.

## Project

- [Contributing](CONTRIBUTING.md) · [Code of conduct](CODE_OF_CONDUCT.md) · [Governance](GOVERNANCE.md)
- [Security policy](SECURITY.md): report vulnerabilities privately, never in a public issue
- [Changelog](CHANGELOG.md)

## Licence

Code: [AGPL-3.0](LICENSE), copyright © Sapience Design and contributors. Third-party parts are listed in [NOTICE](NOTICE).

"Free the Tools" and the Sapience name and logo are trademarks of Sapience Design and are not covered by the code licence. You are welcome to fork the code under a different name. See [TRADEMARKS.md](TRADEMARKS.md).
