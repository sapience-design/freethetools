// The PDF pages screen (docs/adr/0016-shared-screens.md), markup in src/components/PdfPages.astro.
// One PDF, every page as a tile, and a job: turn pages (Rotate Pages) or delete and reorder them
// (Delete or Reorder Pages). Switching the job keeps the file and every change made so far.
// The new PDF is built by ./core.js, on this device.
import { arrangePdf } from "./core.js";
import { parseRanges } from "../../../tools/pdf/split/core.js";
import { pagesFromRanges } from "../../../tools/pdf/rotate/core.js";
import { wireDrop, fmtBytes, downloadLink, showError, showBusy, showDone, showWait, compactDrop, baseName, iconButton, paint, working } from "../files";
import { pdfFacts, pdfMeta } from "../pdfinfo";
import { usePdfWorker, pdfPreview, pdfPageCanvas, pdfViewItem, outputRow } from "../pdfthumb";
import { viewButton, viewLabel, V } from "../expand";
import { stepTo } from "../steps";
import { withUnlocked } from "../pdfpassword";

type Job = "rotate" | "arrange";
type Turn = 0 | 90 | 180 | 270;
type Page = {
  n: number; // the page's number in the original PDF: its name on the tile and in the buttons
  turn: Turn; // turned on this screen, on top of the turn the page already had
  gone: boolean;
  tile: HTMLElement; pic: HTMLElement; acts: HTMLElement; cap: HTMLElement;
  earlier: HTMLButtonElement; later: HTMLButtonElement; turner: HTMLButtonElement; del: HTMLButtonElement; back: HTMLButtonElement;
  drawn: boolean; want: boolean;
};

const MAX = 12; // tiles shown before "Show all N pages", as in pageStrip (src/lib/pdfthumb.ts)
const WAIT: Record<Job, string> = { rotate: "Your fixed PDF will appear here.", arrange: "Your new PDF will appear here." };
const STEP2: Record<Job, string> = { rotate: "Which way?", arrange: "Arrange the pages" };
const PREVIEW: Record<Job, string> = { rotate: "How the pages will look", arrange: "Your pages, in their new order" };
const isPdf = (f: File) => /\.pdf$/i.test(f.name) || f.type === "application/pdf";
const isImage = (f: File) => f.type.startsWith("image/") || /\.(jpe?g|png|webp|gif|heic|heif|avif|bmp|tiff?)$/i.test(f.name);
const plural = (n: number, one: string, other: string) => `${n} ${n === 1 ? one : other}`;

export function startPdfPages(root: HTMLElement) {
  usePdfWorker();
  const p = root.dataset.prefix!;
  const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(`${p}-${id}`) as T;
  const result = $("result"), go = $<HTMLButtonElement>("go"), goLabel = $("go-label"), reset = $<HTMLButtonElement>("reset");
  const again = $<HTMLButtonElement>("again"), reject = $("reject"), say = $("say"), box = $("pages");
  const del = $<HTMLInputElement>("del"), delErr = $("del-err"), range = $<HTMLInputElement>("range");
  const step2 = root.querySelector<HTMLElement>('.step[data-step="2"]')!;

  let job = root.dataset.job as Job;
  let file: File | null = null, bytes: ArrayBuffer | null = null, total = 0;
  let pages: Page[] = [];
  let showAll = false;
  let io: IntersectionObserver | null = null;
  let dragged: Page | null = null;

  const grid = document.createElement("div");
  grid.className = "pages";
  const more = document.createElement("p");
  more.className = "page-more";
  const moreBtn = document.createElement("button");
  moreBtn.type = "button";
  moreBtn.className = "btn quiet small";
  more.append(moreBtn);
  const frame = document.createElement("div");
  frame.className = "pages-box";
  frame.append(grid, more);
  box.replaceChildren(frame);

  const turnChosen = () => +(root.querySelector<HTMLInputElement>(`input[name="${p}-turn"]:checked`)!.value) as Turn;
  const some = () => $<HTMLInputElement>("some").checked;
  /** The pages the Turn job turns, by original number: all of them, or the ones typed (none while the text is wrong). */
  const chosen = (): Set<number> | null => {
    if (!some()) return null;
    try { return new Set(pagesFromRanges(parseRanges(range.value, total))); } catch { return new Set(); }
  };
  const kept = () => pages.filter((pg) => !pg.gone);
  const changed = () => pages.some((pg, i) => pg.n !== i + 1 || pg.turn || pg.gone);

  function announce(text: string) {
    say.textContent = "";
    setTimeout(() => (say.textContent = text), 50);
  }

  // ---- Page tiles: drawn when they scroll into view, three at a time, let go of when far away ----
  let running = 0;
  const queue: Page[] = [];
  const pump = () => {
    while (running < 3 && queue.length) {
      const pg = queue.shift()!, f = file;
      if (!pg.want || pg.drawn || !f) continue;
      pg.drawn = true;
      running++;
      pdfPageCanvas(f, pg.n, 260).then((c) => {
        if (c && pg.want && f === file) { c.setAttribute("aria-hidden", "true"); pg.pic.replaceChildren(c); } else pg.drawn = false;
      }).finally(() => { running--; pump(); });
    }
  };
  const draw = (pg: Page) => { queue.push(pg); pump(); };

  function makePage(n: number): Page {
    const tile = document.createElement("figure");
    tile.className = "page-tile";
    tile.dataset.page = String(n);
    const fr = document.createElement("span");
    fr.className = "page-frame pv";
    const pic = document.createElement("span");
    pic.className = "page-pic";
    fr.append(pic, viewButton(viewLabel("page", n), () => pdfViewItem(file!, file!.name, total, n)));
    const cap = document.createElement("figcaption");
    const acts = document.createElement("div");
    acts.className = "page-acts";
    const pg = { n, turn: 0, gone: false, tile, pic, acts, cap, drawn: false, want: false } as Page;
    pg.earlier = iconButton("left", `Move page ${n} earlier`, () => move(pg, -1));
    pg.later = iconButton("right", `Move page ${n} later`, () => move(pg, 1));
    pg.turner = iconButton("turn", `Turn page ${n} right`, () => {
      pg.turn = ((pg.turn + 90) % 360) as Turn;
      update(pg.turn ? `Page ${n} is turned ${pg.turn}° to the right.` : `Page ${n} is back the way it was.`);
    });
    pg.del = iconButton("trash", `Delete page ${n}`, () => setGone(pg, true));
    // A deleted page has one thing to do: come back. A word says it more plainly than another arrow.
    pg.back = document.createElement("button");
    pg.back.type = "button";
    pg.back.className = "btn quiet small page-back";
    pg.back.textContent = "Put back";
    pg.back.setAttribute("aria-label", `Put back page ${n}`);
    pg.back.addEventListener("click", () => setGone(pg, false));
    acts.append(pg.earlier, pg.later, pg.turner, pg.del, pg.back);
    tile.append(fr, cap, acts);
    // Dragging is a shortcut for the arrow buttons (WCAG 2.2, 2.5.7: never the only way).
    tile.addEventListener("dragstart", (e) => {
      if (job !== "arrange") { e.preventDefault(); return; }
      dragged = pg;
      tile.classList.add("dragging");
      e.dataTransfer?.setData("text/plain", String(n));
      if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
    });
    tile.addEventListener("dragend", () => { dragged = null; tile.classList.remove("dragging"); grid.querySelectorAll(".drag-over").forEach((t) => t.classList.remove("drag-over")); });
    tile.addEventListener("dragover", (e) => { if (!dragged || dragged === pg) return; e.preventDefault(); tile.classList.add("drag-over"); });
    tile.addEventListener("dragleave", () => tile.classList.remove("drag-over"));
    tile.addEventListener("drop", (e) => {
      if (!dragged || dragged === pg) return;
      e.preventDefault();
      tile.classList.remove("drag-over");
      const from = pages.indexOf(dragged), to = pages.indexOf(pg);
      const [moving] = pages.splice(from, 1);
      pages.splice(to, 0, moving);
      update(`Page ${moving.n} moved to place ${to + 1} of ${pages.length}.`);
    });
    return pg;
  }

  function move(pg: Page, by: -1 | 1) {
    const i = pages.indexOf(pg), j = i + by;
    if (j < 0 || j >= pages.length) return;
    [pages[i], pages[j]] = [pages[j], pages[i]];
    update(`Page ${pg.n} moved to place ${j + 1} of ${pages.length}.`);
    // Moving the tile in the page takes focus off its button: put it back, or on the other arrow at an end.
    const btn = by < 0 ? pg.earlier : pg.later;
    (btn.disabled ? (by < 0 ? pg.later : pg.earlier) : btn).focus();
  }

  function setGone(pg: Page, gone: boolean) {
    pg.gone = gone;
    const left = kept().length;
    update(gone ? `Page ${pg.n} deleted. ${plural(left, "page", "pages")} left.` : `Page ${pg.n} put back.`);
    (gone ? pg.back : pg.del).focus();
  }

  // ---- Showing the state ----
  function render() {
    const arrange = job === "arrange";
    root.dataset.job = job;
    step2.querySelector("h2")!.textContent = STEP2[job];
    root.querySelectorAll<HTMLElement>(".pp-job, .pp-ic").forEach((el) => (el.hidden = el.dataset.job !== job));
    $("preview-label").textContent = PREVIEW[job];
    $("range-field").hidden = arrange || !some();

    const pick = chosen(), turn = turnChosen();
    const order = arrange ? pages : kept();
    grid.replaceChildren(...order.map((pg) => pg.tile));
    order.forEach((pg, i) => {
      const shown = arrange ? pg.turn : ((pg.turn + (!pick || pick.has(pg.n) ? turn : 0)) % 360);
      for (const k of [90, 180, 270]) pg.tile.classList.toggle(`t${k}`, shown === k);
      pg.tile.classList.toggle("dim", !arrange && !!pick && !pick.has(pg.n));
      pg.tile.classList.toggle("gone", arrange && pg.gone);
      pg.tile.draggable = arrange && !pg.gone;
      pg.tile.hidden = !showAll && i >= MAX;
      pg.acts.hidden = !arrange;
      pg.cap.textContent = pg.gone ? `${pg.n} · deleted` : String(pg.n);
      pg.earlier.disabled = i === 0;
      pg.later.disabled = i === order.length - 1;
      for (const b of [pg.earlier, pg.later, pg.turner, pg.del]) b.hidden = pg.gone;
      pg.back.hidden = !pg.gone;
    });
    more.hidden = order.length <= MAX;
    moreBtn.setAttribute("aria-expanded", String(showAll));
    moreBtn.textContent = showAll ? V("showFewer", "Show fewer pages") : V("showAll", "Show all {n} pages", { n: order.length });

    reset.hidden = !file || !changed();
    if (!file) { go.disabled = true; return; }
    if (job === "rotate") {
      go.disabled = !kept().length;
      goLabel.textContent = kept().length ? "Turn pages" : "Keep at least one page";
    } else {
      const left = kept().length;
      go.disabled = !changed() || !left;
      goLabel.textContent = !changed() ? "Delete, move or turn a page first" : !left ? "Keep at least one page" : `Save the new PDF (${plural(left, "page", "pages")})`;
    }
  }

  /** Something changed: an old result no longer matches, so it goes, and the page is shown again. */
  function stale() {
    if (!result.querySelector(".res-done, .res-bad")) return;
    showWait(result, WAIT[job]);
    again.hidden = true;
    stepTo(root, file ? 2 : 1);
  }
  const update = (text?: string) => { stale(); render(); if (text) announce(text); };

  moreBtn.addEventListener("click", () => { showAll = !showAll; render(); });

  // ---- The job, and the Turn job's own choices ----
  root.querySelectorAll<HTMLInputElement>(`input[name="${p}-job"]`).forEach((r) => r.addEventListener("change", () => {
    if (!r.checked) return;
    job = r.value as Job;
    if (!result.querySelector(".res-done, .res-bad")) showWait(result, WAIT[job]);
    update();
  }));
  step2.querySelector('.pp-job[data-job="rotate"]')!.addEventListener("input", () => update());

  // ---- Delete pages by number ----
  function deleteTyped() {
    delErr.hidden = true;
    del.removeAttribute("aria-invalid");
    del.setAttribute("aria-describedby", `${p}-del-help`);
    if (!file || !del.value.trim()) return;
    try {
      const drop = new Set(pagesFromRanges(parseRanges(del.value, total)));
      let n = 0;
      for (const pg of pages) if (drop.has(pg.n) && !pg.gone) { pg.gone = true; n++; }
      del.value = "";
      update(n ? `${plural(n, "page", "pages")} deleted. ${plural(kept().length, "page", "pages")} left.` : "Those pages were already deleted.");
    } catch (e) {
      delErr.textContent = (e as Error).message;
      delErr.hidden = false;
      del.setAttribute("aria-invalid", "true");
      del.setAttribute("aria-describedby", `${p}-del-help ${p}-del-err`);
    }
  }
  $("del-go").addEventListener("click", deleteTyped);
  del.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); deleteTyped(); } });

  reset.addEventListener("click", () => {
    pages.sort((a, b) => a.n - b.n);
    for (const pg of pages) { pg.turn = 0; pg.gone = false; }
    update("Every page is back as it was.");
    // The button is gone now, and in the arrange job Save waits for a change: go to the next thing to do.
    (job === "arrange" ? del : go).focus();
  });

  // ---- Choosing the file ----
  $("change").addEventListener("click", () => $("file").click());

  /** Say why a file was not taken, and where it can go instead. */
  function refuse(text: string, link?: { href: string; label: string }) {
    reject.replaceChildren(text);
    if (link) {
      const a = document.createElement("a");
      a.href = link.href;
      a.textContent = link.label;
      reject.append(" ", a, ".");
    }
    reject.hidden = false;
  }

  wireDrop(p, async (picks) => {
    reject.hidden = true;
    const pdfs = picks.filter(isPdf);
    if (!pdfs.length) {
      const f = picks[0];
      if (picks.some(isImage)) refuse(`${f.name} isn't a PDF. To make a PDF from photos or scans, use`, { href: "/pdf/images-to-pdf/", label: "Images to PDF" });
      else refuse(`${f.name} isn't a PDF. Choose a file that ends in .pdf.`);
      return;
    }
    if (pdfs.length > 1) refuse(`This page works on one PDF at a time, so it opened ${pdfs[0].name}. To put PDFs together, use`, { href: "/pdf/merge/", label: "Merge PDFs" });
    await withUnlocked(pdfs[0], $("drop"), use);
  });

  async function use(f: File) {
    showWait(result, WAIT[job]);
    again.hidden = true;
    file = null;
    bytes = null;
    pages = [];
    queue.length = 0;
    showAll = false;
    io?.disconnect();
    render();
    // Show the file at once, with a spinner, and let the page draw it before reading.
    $("name").textContent = f.name;
    working($("meta"), `Reading ${fmtBytes(f.size)}…`);
    $("picked").hidden = false;
    compactDrop(p, true);
    await paint();
    try {
      const facts = await pdfFacts(f);
      if (!facts) throw new Error("This file isn't a readable PDF.");
      if (facts.locked) throw new Error("This PDF is password-protected. Open Unlock PDF to take the lock off first.");
      bytes = await f.arrayBuffer();
      total = facts.pages;
      file = f;
      $("meta").textContent = pdfMeta(facts, f.size);
      pdfPreview($("thumb"), f, f.name, total);
      pages = Array.from({ length: total }, (_, i) => makePage(i + 1));
      const byTile = new Map(pages.map((pg) => [pg.tile, pg]));
      io = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver((entries) => {
        for (const e of entries) {
          const pg = byTile.get(e.target as HTMLElement)!;
          pg.want = e.isIntersecting;
          if (pg.want) draw(pg);
          else if (pg.drawn) { pg.pic.replaceChildren(); pg.drawn = false; }
        }
      }, { rootMargin: "600px 0px" });
      for (const pg of pages) { if (io) io.observe(pg.tile); else { pg.want = true; draw(pg); } }
      $("preview").hidden = false;
      render();
      stepTo(root, 2);
    } catch (e) {
      $("meta").textContent = fmtBytes(f.size);
      showError(result, (e as Error).message);
    }
  }

  again.addEventListener("click", () => {
    file = null;
    bytes = null;
    pages = [];
    io?.disconnect();
    $("picked").hidden = true;
    $("preview").hidden = true;
    reject.hidden = true;
    compactDrop(p, false);
    showWait(result, WAIT[job]);
    again.hidden = true;
    render();
    stepTo(root, 1);
    $("drop").focus();
  });

  // ---- Making the new PDF ----
  go.addEventListener("click", async () => {
    if (!bytes || !file) return;
    const rotate = job === "rotate";
    go.disabled = true;
    again.hidden = true;
    stepTo(root, 3);
    await showBusy(result);
    try {
      const pick = rotate && some() ? new Set(pagesFromRanges(parseRanges(range.value, total))) : null;
      const turn = turnChosen();
      const plan = kept().map((pg) => ({ page: pg.n, turn: ((pg.turn + (rotate && (!pick || pick.has(pg.n)) ? turn : 0)) % 360) as Turn }));
      const out = await arrangePdf(bytes.slice(0), plan);
      const fname = `${baseName(file.name)}-${rotate ? "rotated" : "edited"}.pdf`;
      const dl = downloadLink(out, fname, "application/pdf", "Download PDF");
      dl.classList.add("run");
      const gone = total - plan.length;
      if (rotate) {
        const n = pick ? plan.filter((x) => pick.has(x.page)).length : plan.length;
        showDone(result, `Done. ${plural(n, "page", "pages")} turned.`, `${fname} · ${fmtBytes(out.byteLength)}`);
      } else {
        showDone(result, `Done. Your new PDF has ${plural(plan.length, "page", "pages")}.`, [fname, gone ? `${plural(gone, "page", "pages")} deleted` : "", fmtBytes(out.byteLength)].filter(Boolean).join(" · "));
      }
      result.append(outputRow(out, dl));
      again.hidden = false;
      stepTo(root, 4);
    } catch (e) {
      showError(result, (e as Error).message);
    }
    render();
  });

  render();
}
