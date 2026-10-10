# Free the Tools

**Every tool free. Nothing uploaded. Build the next one.**

[freethetools.com](https://freethetools.com) is a growing shelf of everyday tools, such as compressing a PDF, that run entirely in your browser. There are no accounts, no limits and no ads, and nothing tracks you: the site keeps only anonymous daily totals, such as how often each tool is used and liked ([what's counted](https://freethetools.com/stats/)). Every page carries a Content Security Policy that stops it from sending your data to any other server, and the automated tests fail if a tool tries.

Free the Tools is a [Sapience](https://sapience.design) initiative, built in the open with anyone who wants to help.

[![CI](https://github.com/sapience-design/freethetools/actions/workflows/ci.yml/badge.svg)](https://github.com/sapience-design/freethetools/actions/workflows/ci.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/sapience-design/freethetools/badge)](https://scorecard.dev/viewer/?uri=github.com/sapience-design/freethetools)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue)](LICENSE)

## Use it

Open [freethetools.com](https://freethetools.com). That's it.

Developers and AI agents can read the catalogue at [`/api/tools.json`](https://freethetools.com/api/tools.json) (described in [`openapi.yaml`](openapi.yaml)) or [`/llms.txt`](https://freethetools.com/llms.txt). Some tools also ship a command-line version in their `cli/` folder.

## For AI agents

Claude, Cursor and other AI assistants can use the tools instead of installing software such as Ghostscript, ImageMagick or a Python package, and without sending files to a server. Files stay on the device either way. There are two channels, and both use one definition per tool ([ADR 0008](docs/adr/0008-tools-for-ai-agents.md)).

| Channel | For | Setup |
|---|---|---|
| The `freethetools` npm package, an MCP server on your computer | Claude Code, Claude Desktop, Cursor and other MCP clients | `claude mcp add freethetools -- npx -y freethetools mcp` |
| WebMCP on each tool page | AI agents inside a browser | None. Chrome and Edge support it in origin trials; other browsers ignore it. |

The package reads files by path, saves results in a `freethetools` folder in your home folder, and records every job in `library.jsonl`. It also has a command line for agents without MCP: `npx -y freethetools run <tool> '<json>'`. Setup for each client is in [docs/how-to/use-with-ai.md](docs/how-to/use-with-ai.md). The package source is in [packages/freethetools](packages/freethetools). There is no hosted MCP server, because the files would have to be uploaded.

## Why in the browser, and how far it goes

Services such as iLovePDF or CloudConvert process files on their servers, so every file costs them money, and they cap sizes and sell the rest. Here the visitor's device does the work and the pages are static files, so a million visitors cost about what one does. That is why "free, no limits" is a promise we can keep.

A browser can do more than most people expect. Ghostscript and qpdf run inside the page as WebAssembly, alongside pdf-lib, pdf.js and the image codecs. Text recognition, translation and speech-to-text can run the same way. The gap between "needs a server" and "runs on your device" shrinks every year, and the tool list grows with it. What is next is in the [vision](docs/explanation/vision.md): working with no connection, files bigger than memory, on-device OCR and translation, and pages in more languages. Jobs a browser cannot do yet wait; we do not add a server to get there.

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
| `src/` | The site: layout, home and group pages, tool pages, API and search files, all built from the tool folders |
| `astro.config.mjs` | The Content Security Policy that keeps every page on its own origin |
| `worker/`, `migrations/` | The only server code: anonymous usage totals at `/api/stats/*`, stored in Cloudflare D1 |
| `packages/freethetools/` | The npm package: an MCP server and command line that run the tools on your computer. Build it with `npm run build:package` |
| `e2e/`, `tests/` | Browser tests and checks on the built site |
| `docs/` | Tutorials, how-to guides, reference and design decisions |

The site is static [Astro](https://astro.build) plus one small Worker for anonymous totals, hosted on Cloudflare Workers, which builds and deploys every merge to `main`. Read [docs/explanation/architecture.md](docs/explanation/architecture.md) for the reasoning.

## Project

- [Contributing](CONTRIBUTING.md) · [Code of conduct](CODE_OF_CONDUCT.md) · [Governance](GOVERNANCE.md)
- [Security policy](SECURITY.md): report vulnerabilities privately, never in a public issue
- [Changelog](CHANGELOG.md)

## Licence

Code: [AGPL-3.0](LICENSE), copyright © Sapience Design and contributors. Third-party parts are listed in [NOTICE](NOTICE).

"Free the Tools" and the Sapience name and logo are trademarks of Sapience Design and are not covered by the code licence. You are welcome to fork the code under a different name. See [TRADEMARKS.md](TRADEMARKS.md).
