// Small pictures of PDF pages, drawn in the browser by pdf.js, so a person sees the pages they are
// about to combine, split, turn or fill in. Nothing is uploaded. Each tool that uses this serves its
// own copy of the pdf.js worker (see "vendor" in its tool.json), so it also works offline.
import * as pdfjs from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { fmtBytes } from "./files";
import { viewButton, viewLabel, V, type ViewItem } from "./expand";

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
 * Draw one page sharp enough for a screen: scaled to fit inside boxW x boxH device pixels, never
 * more than 4096 on a side. For the full-screen viewer; the page on screen only. Null when the
 * page can't be drawn.
 */
export async function pdfPageFit(file: Blob, page: number, boxW: number, boxH: number, signal?: AbortSignal): Promise<HTMLCanvasElement | null> {
  try {
    if (signal?.aborted) return null;
    const doc = await open(file);
    if (page < 1 || page > doc.numPages) return null;
    const pg = await doc.getPage(page);
    if (signal?.aborted) return null;
    const base = pg.getViewport({ scale: 1, rotation: pg.rotate });
    const scale = Math.max(0.05, Math.min(boxW / base.width, boxH / base.height, 4096 / base.width, 4096 / base.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.floor(base.width * scale));
    canvas.height = Math.max(1, Math.floor(base.height * scale));
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    canvas.dataset.nw = String((base.width * 96) / 72); // the page's own width in CSS pixels: the viewer's "100%"
    const task = pg.render({ canvas, canvasContext: ctx, viewport: pg.getViewport({ scale: canvas.width / base.width, rotation: pg.rotate }) });
    const stop = () => task.cancel();
    signal?.addEventListener("abort", stop, { once: true });
    try { await task.promise; } finally { signal?.removeEventListener("abort", stop); }
    return signal?.aborted ? null : canvas;
  } catch {
    return null;
  }
}

/** A PDF (or one page of it) for the full-screen viewer. The viewer draws only the pages on screen. */
export function pdfViewItem(file: Blob, name: string, pages: number, page = 1): ViewItem {
  return { kind: "pdf", name, pages, page, render: (n, w, h, signal) => pdfPageFit(file, n, w, h, signal) };
}

/** A name for a Blob: a File's own, or a fallback. */
const nameOf = (f: Blob, fallback = "PDF") => (f as File).name || fallback;

/**
 * Fill a `.fthumb` box with the first page once it is drawn. The box keeps its PDF icon until
 * then, and for good when the file can't be drawn. Returns the box, for chaining.
 */
export function drawInto(box: HTMLElement, file: Blob, page = 1, turn = 0, size = 176) {
  pdfPageCanvas(file, page, size, turn).then((c) => { if (c) { c.setAttribute("aria-hidden", "true"); box.replaceChildren(c); } });
  return box;
}

/**
 * A PDF's first page as a preview that opens full screen: the picture, with the expand button on
 * it. `box` is the `.fthumb` to fill (a PDF icon until the page is drawn).
 */
export function pdfPreview(box: HTMLElement, file: Blob, name = nameOf(file), pages = 0, size = 176) {
  // A box already in the page (a tool's static thumbnail) is wrapped where it stands; one that was
  // wrapped for an earlier file keeps its wrapper and gets a new button.
  const old = box.parentElement?.classList.contains("pv") ? box.parentElement : null;
  const wrap = old ?? document.createElement("span");
  if (old) old.querySelector(".fv-open")?.remove();
  else { wrap.className = "pv"; box.parentNode?.replaceChild(wrap, box); wrap.append(box); }
  const btn = viewButton(viewLabel("page", 1), async () => pdfViewItem(file, name, pages || (await pdfPages(file)) || 1, 1));
  btn.hidden = true; // shown once the page is drawn: a locked or damaged file has nothing to open
  wrap.append(btn);
  pdfPageCanvas(file, 1, size).then((c) => { if (c) { c.setAttribute("aria-hidden", "true"); box.replaceChildren(c); btn.hidden = false; } });
  return wrap;
}

/** The finished PDF's first page beside its Download button: a row for a result box. */
export function outputRow(bytes: BlobPart, link: HTMLElement, name = "") {
  const row = document.createElement("div");
  row.className = "out-row";
  const box = document.createElement("span");
  box.className = "fthumb";
  const file = new Blob([bytes], { type: "application/pdf" });
  row.append(pdfPreview(box, file, name || (link as HTMLAnchorElement).download || "PDF", 0, 300), link);
  return row;
}

export type PageTile = { n: number; tile: HTMLElement };

/**
 * A grid of page pictures: every page of a PDF as a numbered tile, the first `max` shown and the
 * rest behind "Show all N pages". A tile is drawn only when it scrolls into view, so a 300-page
 * file stays fast, and is let go again when far away. Tools mark tiles (chosen, turned) by class on
 * `tile`; each tile has an expand button that opens the full-screen viewer at that page.
 */
export function pageStrip(file: Blob, total: number, opts: { max?: number; turn?: number; size?: number; name?: string } = {}): { el: HTMLElement; tiles: PageTile[] } {
  const { max = 12, turn = 0, size = 260 } = opts;
  const name = opts.name ?? nameOf(file);
  const el = document.createElement("div");
  el.className = "pages-box";
  const grid = document.createElement("div");
  grid.className = "pages";
  el.append(grid);
  const tiles: PageTile[] = [];
  const state = new Map<Element, { n: number; pic: HTMLElement; drawn: boolean; want: boolean }>();
  let running = 0;
  const queue: Element[] = [];
  const pump = () => {
    while (running < 3 && queue.length) {
      const s = state.get(queue.shift()!)!;
      if (!s.want || s.drawn) continue;
      running++;
      pdfPageCanvas(file, s.n, size, turn).then((c) => {
        if (c && s.want) { c.setAttribute("aria-hidden", "true"); s.pic.replaceChildren(c); s.drawn = true; }
      }).finally(() => { running--; pump(); });
    }
  };
  const io = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver((entries) => {
    for (const e of entries) {
      const s = state.get(e.target)!;
      s.want = e.isIntersecting;
      if (e.isIntersecting) { if (!s.drawn) { queue.push(e.target); pump(); } }
      else if (s.drawn) { s.pic.replaceChildren(); s.drawn = false; } // let go of pictures far from the screen
    }
  }, { rootMargin: "600px 0px" });

  for (let n = 1; n <= total; n++) {
    const tile = document.createElement("figure");
    tile.className = "page-tile";
    tile.dataset.page = String(n);
    if (n > max) tile.hidden = true;
    const frame = document.createElement("span");
    frame.className = "page-frame pv";
    const pic = document.createElement("span");
    pic.className = "page-pic";
    frame.append(pic, viewButton(viewLabel("page", n), () => pdfViewItem(file, name, total, n)));
    const cap = document.createElement("figcaption");
    cap.textContent = String(n);
    tile.append(frame, cap);
    grid.append(tile);
    tiles.push({ n, tile });
    state.set(tile, { n, pic, drawn: false, want: false });
    if (io) io.observe(tile);
    else if (n <= max) { state.get(tile)!.want = true; queue.push(tile); }
  }
  if (!io) pump();

  if (total > max) {
    const more = document.createElement("p");
    more.className = "page-more";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn quiet small";
    btn.setAttribute("aria-expanded", "false");
    const label = (open: boolean) => open ? V("showFewer", "Show fewer pages") : V("showAll", "Show all {n} pages", { n: total });
    btn.textContent = label(false);
    btn.addEventListener("click", () => {
      const open = btn.getAttribute("aria-expanded") !== "true";
      btn.setAttribute("aria-expanded", String(open));
      for (const t of tiles) if (t.n > max) t.tile.hidden = !open;
      btn.textContent = label(open);
    });
    more.append(btn);
    el.append(more);
  }
  return { el, tiles };
}

/**
 * The first page of a PDF before and after, side by side with their sizes, each openable full
 * screen: for a tool that changes a PDF, so people can judge the result before they download it.
 */
export function pdfBeforeAfter(before: Blob, after: Blob, o: { beforeName?: string; afterName?: string; beforeLabel?: string; afterLabel?: string } = {}) {
  const wrap = document.createElement("div");
  wrap.className = "fwide pdf-compare";
  for (const [blob, name, label] of [[before, o.beforeName ?? nameOf(before), o.beforeLabel ?? "Original"], [after, o.afterName ?? "Smaller PDF", o.afterLabel ?? "Smaller"]] as const) {
    const fig = document.createElement("figure");
    fig.className = "pdf-side";
    const box = document.createElement("span");
    box.className = "fthumb";
    const cap = document.createElement("figcaption");
    cap.textContent = `${label} · ${fmtBytes(blob.size)}`;
    fig.append(pdfPreview(box, blob, name, 0, 320), cap);
    wrap.append(fig);
  }
  return wrap;
}
