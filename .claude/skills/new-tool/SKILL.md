---
name: new-tool
description: Build a new Free the Tools tool from an accepted tool request, from scaffold through tests, agent.js, changelog and a green npm run check. Use whenever adding a tool under tools/<group>/<slug>.
argument-hint: "<issue number> or <group> <slug> \"<Tool Name>\" [section]"
---

# Build a new tool

Follow AGENTS.md. Don't explore beyond the files named here.

1. **Spec.** If the issue has no approved spec yet, run the `spec-first` skill and stop there.
2. **Scaffold:** `npm run new-tool -- <group> <slug> "<Tool Name>" [section]`. Groups and sections are in `src/data/categories.ts`.
3. **Read one example** close to the new tool, and nothing more:
   - text in, text out: `tools/text/word-counter/`
   - data conversion: `tools/data/csv-to-json/`
   - file in, file out: the nearest tool in `tools/pdf/` or `tools/images/`
4. **Fill the folder in this order:**
   - `tests/core.test.js` from the spec, failing.
   - `core.js` until the tests pass (`node --test tools/<group>/<slug>/tests/`). Pure logic: no DOM, network, Node built-ins or `process`.
   - `tool.json`: every TODO, following `docs/reference/tool-json.md`. The first FAQ answers whether anything is uploaded.
   - `Tool.astro`: ids prefixed with the slug, shared step components, no inline `style`, a working example on load.
   - `agent.js`: the same contract as the example's `agent.js`. Accept only what the schema allows and return files as bytes.
   - `README.md`: replace the TODOs.
5. **Library?** Follow `docs/how-to/vendor-a-library.md`: exact version, AGPL-compatible licence, `NOTICE`, the licences page.
6. **Changelog:** `changelog.d/<slug>.added.md`, one line for the people who use the site.
7. **Check:** `npm run check`. Show only the failing lines and fix them. Never loosen a test, the CSP or `tests/tool-safety.test.js`.
8. **Audits:** run the `audit-security` skill, then the `audit-design` skill on `/<group>/<slug>/`.
9. **Ship:** tell the person it's ready for `/ship-pr`, with the screenshots attached. One tool per PR.
