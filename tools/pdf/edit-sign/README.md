# Edit and Sign PDF

Notes for maintainers and reviewers.

## Files

| File | What it does |
|---|---|
| `core.js` | Marks, page geometry, text wrapping, undo history and `applyMarks`, which writes marks into a PDF with pdf-lib. No page code. |
| `agent.js` | `add_to_pdf` for AI agents: text, boxes, highlights and one picture at page coordinates. |
| `editor.ts` | The page: pdf.js canvases with an SVG layer on top, pointer and keyboard handling, saving. |
| `signature.ts` | The signature dialog: draw, type or pick a picture; result is a transparent PNG. |
| `tests/` | Unit tests for core and the agent. `e2e/pdf-edit-sign.spec.js` drives the page. |

## One coordinate system

Every mark is stored in points on the page **as a person sees it**: turned by the page's rotation, cut to the crop box, origin top-left, y down. That is also what pdf.js draws, and the SVG layer's `viewBox` is the page in points, so a number means the same on screen and in the file. `viewMatrix` in `core.js` maps it back to the PDF's own coordinates for each of the four rotations. The tests compare it with pdf.js's own `convertToPdfPoint`.

## Text and fonts

- Text that fits Windows-1252 (Latin, æ ø å, é, ß, €) uses pdf-lib's built-in Helvetica. Nothing extra is loaded.
- Any other text (Cyrillic, Greek, Vietnamese ...) embeds a subset of Roboto Regular (Apache-2.0, 86 KB WOFF, from `roboto-fontface`), through `@pdf-lib/fontkit` (MIT). Both load only when the person saves such text. The font is served from this site (`vendor` in `tool.json`), never from outside.
- `core.js` never imports fontkit. The page passes it in (`opts.fontkit`, `opts.unicodeFont`), so the npm package and agents stay small. Without them, non-Latin text is refused with a message that names the characters.
- The on-screen text uses the system's Helvetica or Arial. Widths match, so line breaks inside boxes match the saved file closely, not always exactly.

## Signature

A picture on the page, not a certificate-based digital signature. The page, the dialog and the FAQ say so.

## Safety

- Text a person types, and file names, only reach the page through `textContent` and SVG attributes. The one `innerHTML` write is a fixed icon.
- A picked picture is read with `createImageBitmap`; nothing is fetched.
- Locked PDFs go through `withUnlocked`, like the other PDF tools.
- Limits: 500 marks per agent call, 20 000 points per drawing.

## Left for later

Rotating marks, bold and italic, a colour for the text inside a box, copy and paste of marks, a floating Undo bar on phones, saved signatures between visits.
