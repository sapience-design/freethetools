# Commands

| Command | What it does |
|---|---|
| `npm run dev` | Copies vendored files, then starts the site at http://localhost:4321 with live reload |
| `npm run build` | Copies vendored files, validates every `tool.json`, builds the static site into `dist/` |
| `npm run preview` | Serves `dist/` with Cloudflare's local server at http://localhost:8788, including `_headers` |
| `npm test` | Unit tests in `tools/*/*/tests/` |
| `npm run test:site` | Checks the built site: titles, descriptions, canonical links, CSP, unique ids, sitemap |
| `npm run test:e2e` | Browser tests on desktop and phone. Run `npx playwright install chromium` once first. |
| `npm run test:py` | Python tests for command-line versions (needs `pip install -r requirements-dev.txt`) |
| `npm run check` | Build, then unit, site and browser tests |
| `npm run new-tool -- <group> <slug> "<Name>" [section]` | Scaffold a tool from `tools/_template` |
