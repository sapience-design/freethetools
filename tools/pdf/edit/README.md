# View and Edit PDF

Notes for maintainers and reviewers. The decision is in [ADR 15](../../../docs/adr/0015-shared-pdf-editor.md).

## What this tool is

A read-only preview of a chosen PDF, with two buttons: **Edit** and **View full screen**. Both open the site's shared full-screen viewer; Edit opens it in edit mode. The page passes `onSave`, so a saved copy comes back to the page, which shows it and offers its download. The editor itself is shared by every PDF the viewer opens (see below).

## Files

| File | What it does |
|---|---|
| `Tool.astro` | The page: drop zone, read-only page pictures, the two buttons, the saved copy's download. |
| `agent.js` | `add_to_pdf` for AI agents: text, boxes, highlights and one picture at page coordinates. |
| `tests/` | Unit tests for the core (`src/lib/pdf-edit/core.js`) and the agent. `e2e/pdf-edit.spec.js` drives the page and the viewer. |
| `../../../src/lib/pdf-edit/core.js` | Marks, page geometry, text wrapping, undo history and `applyMarks` (pdf-lib). No browser code. |
| `../../../src/lib/pdf-edit/editor.ts` | The editing session inside the viewer: svg layer per page, pointer and keyboard, save, the unsaved choice. |
| `../../../src/lib/pdf-edit/bar.ts` | The toolbar, built by script. |
| `../../../src/lib/pdf-edit/signature.ts` | The signature dialog: draw, type or pick a picture; result is a transparent PNG. |

## One coordinate system

Every mark is stored in points on the page **as a person sees it**: turned by the page's rotation, cut to the crop box, origin top-left, y down. That is also what pdf.js draws, and each svg layer's `viewBox` is the page in points, so a number means the same on screen, at any zoom, and in the file. `viewMatrix` in `core.js` maps it back to the PDF's own coordinates. The tests compare it with pdf.js's own `convertToPdfPoint`.

## Text and fonts

- Text that fits Windows-1252 (Latin, æ ø å, é, ß, €) uses pdf-lib's built-in Helvetica.
- Any other text embeds a subset of Roboto Regular (Apache-2.0, from `roboto-fontface`), through `@pdf-lib/fontkit` (MIT). Both load only when the person saves such text. The font is served from this site (`vendor` in `tool.json`, at `/pdf/edit/vendor/`), whichever page the viewer is on.
- `core.js` never imports fontkit. The editor passes it in (`opts.fontkit`, `opts.unicodeFont`).

## Signature

A picture on the page, not a certificate-based digital signature. The page, the dialog and the FAQ say so.

## Safety

- Typed text and file names reach the page only through `textContent` and svg attributes. The `innerHTML` writes are fixed icons (`safe-html:`).
- `tests/tool-safety.test.js` checks `src/lib/pdf-edit/` with the same rules as the tools.
- Locked PDFs go through `withUnlocked` on this page; in other tools the viewer gets the unlocked copy those tools already hold.
- Limits: 500 marks per agent call, 20 000 points per drawing.

## Left for later

Rotating marks, bold and italic, a colour for the text inside a box, copy and paste of marks, a list of every mark, saved signatures between visits.
