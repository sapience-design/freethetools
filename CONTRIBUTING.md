# Contributing to Free the Tools

Thank you for helping. Free the Tools grows one tool at a time, and most tools are built by people like you.

By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Ways to help

- **Request a tool.** [Open a tool request](https://github.com/sapience-design/freethetools/issues/new?template=tool_request.yml), or 👍 an existing one so maintainers know what people want most.
- **Build a tool.** Pick an issue labelled [`wanted`](https://github.com/sapience-design/freethetools/issues?q=is%3Aissue+is%3Aopen+label%3Awanted), or one labelled [`good first issue`](https://github.com/sapience-design/freethetools/labels/good%20first%20issue) if it's your first time.
- **Fix or improve.** Report bugs, improve wording, accessibility or speed, or review other people's pull requests.

## Before you start a tool

1. Comment on the `wanted` issue to say you're taking it, so two people don't build the same thing. If there is no issue yet, open a tool request first and wait for a maintainer to accept it.
2. Check it can run **entirely in the browser**. Tools that need a server, an API key or an account don't fit here.
3. Check the licence of any library you want to use is compatible with AGPL-3.0 (MIT, BSD, Apache-2.0, ISC, MPL-2.0, LGPL, GPL-3.0 and AGPL-3.0 are fine).

## Build it

You need Node.js 22.12 or newer. Python 3.11+ is only needed for tools with a Python command-line version.

```sh
git clone https://github.com/<you>/freethetools.git   # your fork
cd freethetools
npm install
npm run new-tool -- <group> <slug> "<Tool Name>" [section]
npm run dev
```

`new-tool` copies [`tools/_template`](tools/_template) to `tools/<group>/<slug>/` and fills in the name. Then:

1. **`tool.json`**: fill in every TODO. The page, search, sitemap and API are built from it, and the build stops with a clear message if a field is missing. See the [tool.json reference](docs/reference/tool-json.md).
2. **`core.js`**: put the logic here, with no page code, so it can be tested and reused.
3. **`Tool.astro`**: the working area of the page. Show a working example when the page first loads, not an empty box. Prefix every `id` with your slug; the build fails on duplicate ids.
4. **`tests/`**: test `core.js` with real inputs.

The step-by-step [tutorial](docs/tutorial/first-tool.md) builds a word counter from start to finish.

### The rules every tool follows

These are checked automatically where possible, and by a reviewer otherwise.

- **Nothing leaves the device.** No `fetch` to other sites, no analytics, no third-party scripts, fonts or images. The Content Security Policy blocks them, and the browser tests fail if anything tries.
- **Libraries are vendored.** If you need a library at runtime, add it to `package.json` with an exact version and list its files under `vendor` in `tool.json`. See [how to vendor a library](docs/how-to/vendor-a-library.md).
- **Accessible.** Keyboard usable, visible focus, labels on every control, WCAG 2.2 AA contrast. Use native elements (`button`, `input`, `details`) before custom widgets.
- **Plain language.** Write for someone who has never heard of the tool. Errors say what went wrong and how to fix it.
- **Small.** Keep a tool's own code and assets modest. Explain anything over 1 MB in the pull request.

## Check it

```sh
npm run build        # also validates every tool.json
npm test             # tool unit tests
npm run test:site    # checks on the built site: titles, CSP, unique ids, sitemap
npm run test:e2e     # browser tests; run `npx playwright install chromium` once first
```

`npm run check` runs all four.

## Commit and open a pull request

- **Sign off every commit** with `git commit -s`. This adds a `Signed-off-by` line certifying the [Developer Certificate of Origin](https://developercertificate.org/): that you wrote the change or have the right to submit it under the project's licence. A check blocks pull requests with unsigned commits. Forgot? `git rebase --signoff main`, then force-push your branch.
- **Write commit messages as [Conventional Commits](https://www.conventionalcommits.org/)**: `feat(text): add word counter`, `fix(pdf/compress): keep bookmarks`, `docs: clarify vendoring`. The type drives the changelog and version numbers.
- **One tool or one fix per pull request.** Fill in the template, including a screenshot for anything visible.

## Review

A maintainer reviews every pull request, following [Google's code review guidelines](https://google.github.io/eng-practices/review/): does it work, is it safe, is it simple, is it tested, is it readable. Expect a first response within a week. Reviews are about the code, never the person. Once it's approved and CI passes, a maintainer merges it and it goes live on freethetools.com within minutes, with your name on the tool page.

## Questions

Ask in [Discussions](https://github.com/sapience-design/freethetools/discussions). For security issues, follow the [security policy](SECURITY.md) instead.
