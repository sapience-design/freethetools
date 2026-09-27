# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html): a new tool is a minor
version, a fix is a patch, and a change to URLs, `tool.json` or the API is a major version.

## [Unreleased]

### Changed

- Redesign for a calmer, more confident look: one type scale and 8-point spacing, a large opening statement, the available tool shown as a feature, planned tools as a list instead of placeholder cards, sentence-case sidebar with an overview per group, and a new footer.
- Typography follows Cloudflare's open-source Kumo scale (12, 13, 14, 16, 20, 24 and 30px) in Inter Variable, with Kumo's neutral colours. Outfit is replaced by Inter.
- Pricing labels removed everywhere (price stickers, "free forever" lines and the price row in specs). The app icon and wordmark no longer show a price.

## [1.0.0] - 2026-09-27

### Added

- The site: catalogue, two-level sidebar, search, Saved tools, About and Licences pages.
- **Compress PDF** (`/pdf/compress/`): Ghostscript in the browser, four quality presets, keep-first-page option, and a Python command-line version.
- Content Security Policy on every page, blocking connections to other origins.
- Machine-readable catalogue at `/api/tools.json` (with `openapi.yaml`), `/llms.txt`, sitemap and robots file.
- Tool template and `npm run new-tool` scaffolder.
- Tests: tool unit tests, built-site checks, browser tests on desktop and phone, Python CLI tests.
- Open-source project files: contributor guide with DCO sign-off, Contributor Covenant 2.1, security policy, governance, trademarks, issue and pull-request templates, CI, CodeQL, OpenSSF Scorecard and Dependabot.

[Unreleased]: https://github.com/sapience-design/freethetools/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/sapience-design/freethetools/releases/tag/v1.0.0
