# Delete or Reorder Pages

Notes for maintainers and reviewers. The decision is in [ADR 16](../../../docs/adr/0016-shared-screens.md).

## What this tool is

A grid of every page of one PDF. Each page has buttons to move it earlier or later, turn it and delete it (and to put it back). Dragging a page also moves it, but the buttons are the main way, so nobody has to drag (WCAG 2.2, 2.5.7). Pages can also be deleted by typing their numbers, such as `2, 5-7`. Save makes a new PDF; the original file is not changed.

It is the first tool on the **PDF pages screen**, which Rotate Pages shares (`"screen": "pdf-pages"` in both `tool.json` files). The job buttons at the top of the tool switch between deleting or reordering and turning pages without choosing the file again, and every change carries over.

## Files

| File | What it does |
|---|---|
| `Tool.astro` | Opens the shared screen on the "Delete or reorder" job, with this tool's id prefix `pdfd`. |
| `agent.js` | `arrange_pdf_pages` for AI agents: the pages to keep in their new order, or the pages to delete. |
| `tests/` | Unit tests for the engine and the agent. `e2e/tools.spec.js` drives the page. |
| `../../../src/components/PdfPages.astro` | The screen's markup, shared with Rotate Pages. |
| `../../../src/lib/pdf-pages/screen.ts` | The screen: page tiles, the buttons, dragging, typed pages, the job switch, saving. |
| `../../../src/lib/pdf-pages/core.js` | The engine (pdf-lib). No browser code, so the agent and the npm package use it too. |

## Notes for reviewers

- **Deleted pages are gone from the file.** When pages are left out or moved, the engine copies the kept pages into a new PDF, so a left-out page is never written. A unit test checks the file for a marker of every deleted page.
- **Turning only keeps the document.** When every page stays in its place and only turns change, the engine turns the pages in the file itself, so bookmarks, form fields and document details stay, as Rotate Pages always did. A new PDF keeps the title, author and subject, but not bookmarks; the spec table says so.
- **Page numbers are the original ones.** A tile, its buttons and the typed pages use the page's number in the original PDF, so "page 3" means the same page after it moves.
- **One PDF at a time.** Several PDFs at once is Merge PDFs, which joins this screen next (TODO.md, C2b). A second PDF dropped here is refused with a link to Merge PDFs, and a photo with a link to Images to PDF.
