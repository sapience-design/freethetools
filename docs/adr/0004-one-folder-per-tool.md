# 4. One folder per tool, with generated pages

Date: 2026-09-27 · Status: accepted

## Context

If adding a tool meant editing the home page, sidebar, sitemap and API, pull requests would conflict and pages would drift apart.

## Decision

Each tool lives in `tools/<group>/<slug>/` with a validated `tool.json`, a `Tool.astro` interface, a `core.js` module and tests. The site generates everything else from those folders through an Astro content collection. The folder path is the URL.

## Consequences

- Contributors touch only their own folder; reviews are small.
- Every tool page gets the same metadata, structured data and layout.
- Moving a tool changes its URL, which is a breaking change (major version) and needs a redirect.
- `core.js` can later back a command-line version, API or MCP server without touching the page.
