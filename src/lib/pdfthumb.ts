// Small pictures of PDF pages, drawn in the browser by pdf.js, so a person sees the pages they are
// about to combine, split, turn or fill in. Nothing is uploaded. Each tool that uses this serves its
// own copy of the pdf.js worker (see "vendor" in its tool.json), so it also works offline.
import * as pdfjs from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";

const docs = new WeakMap<Blob, Promise<PDFDocumentProxy>>();

/** Point pdf.js at this tool's copy of its worker. Call once, with the tool's id, before drawing. */
export function usePdfWorker(toolId: string) {
  pdfjs.GlobalWorkerOptions.workerSrc = `/${toolId}/vendor/pdf.worker.min.mjs`;
}

/** Open a PDF once per file; later calls share the parsed document. */
function open(file: Blob): Promise<PDFDocumentProxy> {
  let p = docs.get(file);
  if (!p) {
    p = file.arrayBuffer().then((b) => pdfjs.getDocument({ data: new Uint8Array(b), isEvalSupported: false, useSystemFonts: true }).promise);
    docs.set(file, p);
  }
  return p;
}

/** How many pages, or null when pdf.js can't read the file (for example a locked PDF). */
export const pdfPages = (file: Blob) => open(file).then((d) => d.numPages, () => null);

/**
 * Draw one page as a canvas whose longest side is `size` pixels. `turn` is 0, 90, 180 or 270: the
 * page is drawn already turned, which is how Rotate Pages previews its result. Null when the page
 * can't be drawn.
 */
export async function pdfPageCanvas(file: Blob, page = 1, size = 112, turn = 0): Promise<HTMLCanvasElement | null> {
  try {
    const doc = await open(file);
    if (page < 1 || page > doc.numPages) return null;
    const pg = await doc.getPage(page);
    const base = pg.getViewport({ scale: 1, rotation: pg.rotate + turn });
    const scale = size / Math.max(base.width, base.height);
    const vp = pg.getViewport({ scale: scale * (window.devicePixelRatio > 1 ? 2 : 1), rotation: pg.rotate + turn });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(vp.width);
    canvas.height = Math.ceil(vp.height);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await pg.render({ canvas, canvasContext: ctx, viewport: vp }).promise;
    return canvas;
  } catch {
    return null;
  }
}

/**
 * Fill a `.fthumb` box with the first page once it is drawn. The box keeps its PDF icon until
 * then, and for good when the file can't be drawn. Returns the box, for chaining.
 */
export function drawInto(box: HTMLElement, file: Blob, page = 1, turn = 0, size = 112) {
  pdfPageCanvas(file, page, size, turn).then((c) => { if (c) { c.setAttribute("aria-hidden", "true"); box.replaceChildren(c); } });
  return box;
}

/** The finished PDF's first page beside its Download button: a row for a result box. */
export function outputRow(bytes: BlobPart, link: HTMLElement) {
  const row = document.createElement("div");
  row.className = "out-row";
  const box = document.createElement("span");
  box.className = "fthumb";
  drawInto(box, new Blob([bytes], { type: "application/pdf" }), 1, 0, 240);
  row.append(box, link);
  return row;
}

export type PageTile = { n: number; tile: HTMLElement; canvas: Promise<HTMLCanvasElement | null> };

/**
 * A strip of page pictures: the first `max` pages of a PDF as numbered tiles, with "+N more" when
 * there are more. Tools mark tiles (chosen, turned) by class; see pageStrip in global.css.
 */
export function pageStrip(file: Blob, total: number, opts: { max?: number; turn?: number; size?: number } = {}): { el: HTMLElement; tiles: PageTile[] } {
  const { max = 12, turn = 0, size = 96 } = opts;
  const el = document.createElement("div");
  el.className = "pages";
  const shown = Math.min(total, max);
  const tiles: PageTile[] = [];
  for (let n = 1; n <= shown; n++) {
    const tile = document.createElement("figure");
    tile.className = "page-tile";
    tile.dataset.page = String(n);
    const pic = document.createElement("span");
    pic.className = "page-pic";
    const cap = document.createElement("figcaption");
    cap.textContent = String(n);
    tile.append(pic, cap);
    el.append(tile);
    const canvas = pdfPageCanvas(file, n, size, turn).then((c) => { if (c) { c.setAttribute("aria-hidden", "true"); pic.replaceChildren(c); } return c; });
    tiles.push({ n, tile, canvas });
  }
  if (total > shown) {
    const more = document.createElement("p");
    more.className = "page-more";
    more.textContent = `+${total - shown} more ${total - shown === 1 ? "page" : "pages"}`;
    el.append(more);
  }
  return { el, tiles };
}
