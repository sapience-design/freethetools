# Protect PDF

Locks a PDF with a password. It runs qpdf (`--encrypt`, 256-bit AES) as WebAssembly in a worker, so the pages, forms and bookmarks come out unchanged and nothing is uploaded.

## Files

| File | What it is |
|---|---|
| `tool.json` | Name, search text, specs and questions. The page is built from it. |
| `Tool.astro` | The working area of the page: choose a PDF, set a password, save |
| `core.js` | Builds qpdf's arguments and decides what to do. No page code. |
| `agent.js` | The `protect_pdf` tool for AI agents |
| `tests/` | Tests for `core.js`; they use the qpdf helpers from Unlock PDF |

There is no `worker.js` here. The page uses the qpdf build and worker that Unlock PDF ships.

## Notes for reviewers

- **Engine.** No new library and no new download. The page uses the qpdf build and worker that Unlock PDF vendors (`tools/pdf/unlock/`), lent through `src/agent/qpdf.js`.
- **Arguments.** `qpdf --encrypt <password> <owner> 256 --print=full|none --extract=y|n --modify=all|none -- /in.pdf /out.pdf`. Printing is on by default; copying and changing are off.
- **Owner password.** If the owner password were the same as the opening password, the print, copy and change limits would do nothing, because whoever opens the file is its owner. When a limit is on, the page makes a random owner password that is never shown or kept, so the limits hold. When every limit is off, one password does both jobs. The page says the limits are a request that most programs follow, not a lock.
- **Locked input.** A PDF that already has a password or limits is refused with a pointer to Unlock PDF. Locking it again would silently replace its limits.
- **Passwords.** Read from the fields, the fields are cleared at once, and the password travels only in qpdf's arguments. It is never put in the page, logged, stored or put in a URL.
- **Preview.** A locked file can't be drawn without its password, so the result shows a lock tile instead of a page picture.
