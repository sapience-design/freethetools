---
paths:
  - "tools/**"
---
# Rules for tool folders

- `core.js` and `agent.js` run in the npm package too: no network, no Node built-ins, no `process`, no DOM.
- `Tool.astro`: prefix every `id` with the slug. No inline `style`; use classes and the shared step components.
- Untrusted text goes into the page through `textContent`. An `innerHTML` write needs a `safe-html:` comment.
- Set limits on size, pages, frames and decompression. A crafted file must fail with a clear message, never hang.
- English text goes in `tool.json` and `src/i18n/en.json`. Other languages can follow in the weekly translation batch (`scripts/translation-*.mjs`).
