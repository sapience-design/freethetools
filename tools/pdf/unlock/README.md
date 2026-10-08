# Unlock PDF

Removes the lock from PDFs: the password that opens them, or the owner limits on printing, copying and editing. It runs qpdf (`--decrypt`) as WebAssembly in a worker, so the pages, forms and bookmarks come out unchanged and nothing is uploaded.

## Files

| File | What it is |
|---|---|
| `tool.json` | Name, search text, specs and questions. The page is built from it. |
| `Tool.astro` | The working area of the page: one row per file |
| `core.js` | Reads qpdf's results and decides what to do. No page code. |
| `worker.js` | Runs qpdf off the main thread, as a classic worker |
| `agent.js` | The `unlock_pdf` tool for AI agents |
| `tests/` | Tests for `core.js`; `helpers.js` makes encrypted fixtures with qpdf itself |

## Notes for reviewers

- **Engine.** `@jspawn/qpdf-wasm` 0.0.2 (Apache-2.0), vendored through `tool.json`. It is qpdf 11.0.0 built without threads, so it needs no cross-origin isolation, and its JavaScript has no `eval` or `new Function`.
- **Exit codes.** This build of qpdf exits with 2 for "not encrypted", "needs a password" and "damaged" alike, so `core.js` reads what qpdf prints (`--show-encryption`) instead of the code.
- **Passwords.** A password is read from the field, the field is cleared at once, and the password travels only in qpdf's arguments. It is never put in the page, logged or stored. The library's settings snapshot skips text and password fields.
