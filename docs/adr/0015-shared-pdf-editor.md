# 15. One PDF editor, in the full-screen viewer

Date: 2026-10-13 · Status: accepted (decided by Sapience Design) · Extends [ADR 0002](0002-static-site-work-in-the-browser.md)

## Context

Edit and Sign PDF began as its own page with a built-in editor. People expect a PDF viewer first and an editor second, and they meet PDFs in many tools (Merge, Split, Compress, Unlock). A second copy of the pages inside each tool would be heavy and would look different each time.

## Decision

**One editor, in the shared viewer.** The code is `src/lib/pdf-edit/`. `core.js` holds the marks, the undo history, the coordinate maths and `applyMarks` (pdf-lib). It has no browser code, so `tools/pdf/edit/agent.js` and the npm package import it. `editor.ts`, `bar.ts` and `signature.ts` are browser-only.

**Loaded only on demand.** The viewer imports `editor.ts` when Edit is pressed. Opening the viewer costs what it did before. `scripts/build-sw.mjs` keeps the editor chunk out of the files every page downloads for offline use; the service worker keeps it after first use, and the editor fetches the Roboto font and the font code when idle.

**The `ViewItem` contract.** A PDF item may carry two optional fields (`src/lib/expand.ts`):

- `file: Blob`: the PDF itself. With it the viewer shows Edit. Tools pass the unlocked copy when they unlocked the file. `pdfViewItem()` in `src/lib/pdfthumb.ts` always sets it, so every PDF preview in the tools gets Edit.
- `onSave(blob, name)`: where a saved copy goes. Without it the viewer downloads `<name>-edited.pdf`. With it the host decides. View and Edit PDF uses it to show the copy and its download.

`openViewer(items, index, opener, { edit: true })` opens a PDF straight in edit mode.

**Edit mode.** The layout is Scroll. Rotate and the layout choice are hidden; wheel and swipe scroll normally; zoom works and the marks scale with it. An svg in page points lies over each page. On a phone the toolbar is a bar at the bottom of the dialog. Save writes the marks, hands the copy on, and the copy becomes the file shown: saved marks are part of the pages, so a new edit starts on the saved copy. Unsaved marks are protected by an inline choice (Save, Discard, Keep editing) on Done, Close and Escape, and by `beforeunload`.

**Words.** The editor's strings are English in the code and are embedded as `js.pdfedit.*` only on pages in other languages.

## Consequences

- Any new tool that shows a PDF with `pdfPreview`, `pageStrip` or `outputRow` gets Edit with no extra code.
- A tool that builds a PDF view item by hand must set `file`, or the viewer cannot edit it.
- The editor is not offered offline until it has been used once online.
