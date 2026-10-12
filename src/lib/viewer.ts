// The full-screen viewer: one native <dialog> (ViewerDialog.astro) that any preview can open.
// It shows PDF pages drawn sharp for the screen, pictures, a before-and-after slider or a player.
// PDFs and sets of pictures can be read one page at a time, two side by side, four at a time (a
// grid) or as one continuous scroll, with a zoom menu. Loaded only when a preview's expand button
// is pressed (see expand.ts). Everything is local: blob: URLs made here are revoked when it closes.
import type { ViewItem } from "./expand";
import { V } from "./expand";
import { compareSlider } from "./preview";

type Pdf = Extract<ViewItem, { kind: "pdf" }>;
type Layout = "one" | "two" | "grid" | "scroll";
/** "page" fits a whole page, "width" fits the page width, a number is a percent of the page's own size. */
type Zoom = "page" | "width" | number;
interface Cell { i: number; el: HTMLElement; pic: HTMLElement | null; w: number; ctl: AbortController | null; css: number; need: number }
interface Job { c: Cell; need: number; ctl: AbortController; my: number }

const MIN_PCT = 25, MAX_PCT = 800, STEP = 1.25;
const GAP = 12;               // between pages, in CSS pixels
const NARROW = 700;           // below this width "Two pages" falls back to "One page"
const MAX_JOBS = 2;           // pages drawn at the same time
const PER: Record<Layout, number> = { one: 1, two: 2, grid: 4, scroll: 1 };
const LEVELS = [50, 75, 100, 125, 150, 200];
const KEY = "ftt-viewer-view";
const $ = <E extends HTMLElement>(id: string) => document.getElementById(id) as E;

let dlg: HTMLDialogElement, stage: HTMLElement, fig: HTMLElement;
let items: ViewItem[] = [], idx = 0, page = 1;
let pref: Layout = "one";       // the layout the person chose; remembered for the session
let forced: Layout | null = null; // a Grid tile opens its page in One page without changing the choice
let zoom: Zoom = "page";
let opener: HTMLElement | null = null;
let urls: string[] = [];
const urlOf = new Map<Blob, string>();
let token = 0;          // changes whenever what is on screen changes; late results from older ones are dropped
let ar = 0;             // width / height of the Compare picture on screen, once known
let redraw = 0;
let ready = false;

// Paged content: the cells (one per page on screen), what is known about each page's shape, and the drawing queue.
const cells = new Map<number, Cell>();
const aspect = new Map<number, number>(), natural = new Map<number, number>();
let defAr = 0.77, defNat = 816;
let queue: Job[] = [];
let running = 0;
let near = new Set<number>();
let drawObs: IntersectionObserver | null = null, freeObs: IntersectionObserver | null = null;
let lastEff: Layout = "one";
let lockUntil = 0, followRaf = 0;

const cur = () => items[idx];
const isPdf = (it: ViewItem): it is Pdf => it.kind === "pdf";
const isSet = () => cur().kind === "image" && items.every((i) => i.kind === "image");
/** PDFs and sets of pictures: pages that the layouts arrange. */
const multi = () => isPdf(cur()) || isSet();
/** What is drawn with the page machinery: PDFs and pictures. */
const paged = () => cur().kind === "pdf" || cur().kind === "image";
const pages = () => (isPdf(cur()) ? (cur() as Pdf).pages : isSet() ? items.length : 1);
const count = () => (multi() ? pages() : items.length);
const pos = () => (multi() ? page : idx + 1);
const dpr = () => Math.min(3, window.devicePixelRatio || 1);
const narrow = () => dlg.clientWidth < NARROW;
const hasLayouts = () => multi() && pages() > 1;
const eff = (): Layout => {
  if (!multi()) return "one";
  const l = forced ?? pref;
  return l === "two" && narrow() ? "one" : l;
};
/** First page of the group on screen (the pairs are 1-2, 3-4 and so on; the grid's fours likewise). */
const groupStart = () => (eff() === "two" || eff() === "grid" ? Math.floor((page - 1) / PER[eff()]) * PER[eff()] + 1 : page);
const groupEnd = () => (eff() === "scroll" ? page : Math.min(pages(), groupStart() + PER[eff()] - 1));

function readView() {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) || "null");
    if (v && ["one", "two", "grid", "scroll"].includes(v.l)) pref = v.l;
    if (v && (v.z === "page" || v.z === "width" || (typeof v.z === "number" && v.z >= MIN_PCT && v.z <= MAX_PCT))) zoom = v.z;
  } catch { /* storage may be blocked */ }
}
function saveView() {
  try { sessionStorage.setItem(KEY, JSON.stringify({ l: pref, z: zoom })); } catch { /* ignore */ }
}

function init() {
  dlg = $<HTMLDialogElement>("fv");
  if (!dlg || typeof dlg.showModal !== "function") return false;
  if (ready) return true;
  ready = true;
  readView();
  stage = $("fv-stage");
  fig = document.createElement("div");
  fig.className = "fv-fig";
  stage.append(fig);

  $("fv-close").addEventListener("click", () => dlg.close());
  $("fv-prev").addEventListener("click", () => go(-1));
  $("fv-next").addEventListener("click", () => go(1));
  $("fv-in").addEventListener("click", () => zoomBy(STEP));
  $("fv-out").addEventListener("click", () => zoomBy(1 / STEP));
  $("fv-fit").addEventListener("click", () => setZoom("page"));
  $("fv-level").addEventListener("change", (e) => {
    const v = (e.target as HTMLSelectElement).value;
    setZoom(v === "page" || v === "width" ? v : Number(v));
  });
  for (const r of document.querySelectorAll<HTMLInputElement>('input[name="fv-layout"]')) r.addEventListener("change", () => { if (r.checked) setLayout(r.value as Layout); });
  $("fv-full").addEventListener("click", () => {
    const v = fig.querySelector("video") as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (!v) return;
    if (v.requestFullscreen) v.requestFullscreen().catch(() => {});
    else v.webkitEnterFullscreen?.();
  });
  stage.addEventListener("scroll", () => {
    if (eff() !== "scroll" || followRaf) return;
    followRaf = requestAnimationFrame(() => { followRaf = 0; follow(); });
  }, { passive: true });
  dlg.addEventListener("close", cleanup);
  dlg.addEventListener("keydown", onKey);
  new ResizeObserver(() => {
    if (!dlg.open || !items.length) return;
    if (!paged()) { layout(); return; }
    if (eff() !== lastEff) { build(); return; }
    sizeAll();
    chrome(false);
    scheduleRedraw();
  }).observe(stage);
  return true;
}

/** Open the viewer on `list`, starting at `start`. */
export function show(list: ViewItem[], start: number, from: HTMLElement | null) {
  if (!list.length || !init()) return;
  items = list;
  idx = Math.min(Math.max(0, start), list.length - 1);
  opener = from;
  forced = null;
  const it = cur();
  page = isPdf(it) ? Math.min(Math.max(1, it.page ?? 1), it.pages) : isSet() ? idx + 1 : 1;
  if (!dlg.open) dlg.showModal();
  $("fv-live").textContent = "";
  load(false);
  $("fv-close").focus();
}

function cleanup() {
  token++;
  stopAll();
  clearTimeout(redraw);
  for (const m of fig.querySelectorAll("video, audio") as NodeListOf<HTMLMediaElement>) { m.pause(); m.removeAttribute("src"); m.load(); }
  for (const c of cells.values()) dropPic(c);
  cells.clear();
  fig.replaceChildren();
  for (const u of urls) URL.revokeObjectURL(u);
  urls = [];
  urlOf.clear();
  aspect.clear(); natural.clear();
  items = [];
  ar = 0;
  const back = opener;
  opener = null;
  if (back?.isConnected) back.focus();
}

const blobUrl = (b: Blob) => {
  let u = urlOf.get(b);
  if (!u) { u = URL.createObjectURL(b); urls.push(u); urlOf.set(b, u); }
  return u;
};

function nameOf(i: number) {
  return multi() && isSet() ? items[i - 1].name : cur().name;
}

/** "Page 3 of 12", "Pages 3–4 of 12", "Image 2 of 3": where the person is. */
function where(): string {
  const n = count(), pdf = isPdf(cur());
  if (multi() && eff() !== "scroll" && eff() !== "one") {
    const a = groupStart(), b = groupEnd();
    if (b > a) return pdf ? V("pagesOf", "Pages {from}–{to} of {total}", { from: a, to: b, total: n }) : V("imagesOf", "Images {from}–{to} of {total}", { from: a, to: b, total: n });
  }
  const p = multi() ? (eff() === "one" || eff() === "scroll" ? page : groupStart()) : pos();
  return pdf ? V("pageOf", "Page {n} of {total}", { n: p, total: n }) : V("itemOf", "Image {n} of {total}", { n: p, total: n });
}

function labelFor(): string {
  return count() < 2 ? cur().name : `${where()}, ${cur().name}`;
}

/** Spread, grid and scroll have no single "current" page for the pictures; each page names itself. */
function pageLabel(i: number) {
  return isPdf(cur())
    ? V("pageOf", "Page {n} of {total}", { n: i, total: pages() })
    : `${V("itemOf", "Image {n} of {total}", { n: i, total: pages() })}, ${nameOf(i)}`;
}

function levelOptions(shown: Zoom) {
  const sel = $<HTMLSelectElement>("fv-level");
  const want: [string, string][] = [["page", V("fitPage", "Fit page")], ["width", V("fitWidth", "Fit width")], ...LEVELS.map((p): [string, string] => [String(p), `${p}%`])];
  if (typeof shown === "number" && !LEVELS.includes(shown)) { want.push([String(shown), `${shown}%`]); want.sort((a, b) => (a[0] === "page" ? -2 : a[0] === "width" ? -1 : Number(a[0])) - (b[0] === "page" ? -2 : b[0] === "width" ? -1 : Number(b[0]))); }
  if (sel.options.length !== want.length || [...sel.options].some((o, k) => o.value !== want[k][0] || o.textContent !== want[k][1])) {
    sel.replaceChildren(...want.map(([v, label]) => { const o = document.createElement("option"); o.value = v; o.textContent = label; return o; }));
  }
  sel.value = String(shown);
}

function chrome(announce: boolean) {
  const it = cur(), n = count();
  dlg.setAttribute("aria-label", labelFor());
  $("fv-name").textContent = it.name;
  $("fv-pos").textContent = n < 2 ? "" : where();
  $("fv-nav").hidden = n < 2;
  let first = true, last = true;
  if (multi()) {
    first = (eff() === "scroll" ? page : groupStart()) <= 1;
    last = (eff() === "scroll" ? page : groupEnd()) >= pages();
  } else { first = pos() <= 1; last = pos() >= n; }
  ($("fv-prev") as HTMLButtonElement).disabled = first;
  ($("fv-next") as HTMLButtonElement).disabled = last;
  const zoomable = paged();
  $("fv-zoom").hidden = !zoomable;
  $("fv-full").hidden = !(it.kind === "media" && it.blob.type.startsWith("video/"));
  const seg = $("fv-layout");
  seg.hidden = !hasLayouts();
  if (!seg.hidden) {
    const l = eff(), nar = narrow();
    for (const m of ["one", "two", "grid", "scroll"] as Layout[]) ($(`fv-l-${m}`) as HTMLInputElement).checked = m === l;
    const two = $("fv-l-two") as HTMLInputElement;
    two.disabled = nar;
    $("fv-ll-two").title = nar ? V("twoNeedsWide", "Needs a wider window") : "";
  }
  if (zoomable) {
    const pct = effPct();
    levelOptions(zoom);
    ($("fv-out") as HTMLButtonElement).disabled = pct <= MIN_PCT;
    ($("fv-in") as HTMLButtonElement).disabled = pct >= MAX_PCT;
  }
  if (announce && n > 1) $("fv-live").textContent = where();
  // Disabling the button that has focus drops focus to the page behind: hand it to another one.
  const a = document.activeElement as HTMLElement | null;
  if (a && dlg.contains(a) && ((a as HTMLButtonElement).disabled || a.closest("[hidden]"))) {
    const next = $("fv-next") as HTMLButtonElement, prev = $("fv-prev") as HTMLButtonElement;
    (!next.disabled && a === prev ? next : !prev.disabled && a === next ? prev : $("fv-close")).focus();
  }
}

function message(text: string) {
  const p = document.createElement("p");
  p.className = "fv-msg";
  p.textContent = text;
  fig.replaceChildren(p);
}

function load(announce = true) {
  const my = ++token;
  clearTimeout(redraw);
  stopAll();
  ar = 0;
  stage.scrollTo(0, 0);
  const it = cur();
  fig.className = `fv-fig k-${it.kind}`;
  if (paged()) {
    build();
    chrome(announce);
    return;
  }
  chrome(announce);
  if (it.kind === "compare") {
    const slider = compareSlider(it.before, it.after, { beforeLabel: it.beforeLabel, afterLabel: it.afterLabel });
    slider.classList.add("fv-cmp");
    for (const im of slider.querySelectorAll("img")) urls.push(im.src);
    const first = slider.querySelector("img.cmp-before") as HTMLImageElement;
    const fit = () => { if (my !== token || !first.naturalWidth) return; ar = first.naturalWidth / first.naturalHeight; layout(); };
    first.addEventListener("load", fit, { once: true });
    fig.replaceChildren(slider);
  } else if (it.kind === "media") {
    const video = it.blob.type.startsWith("video/");
    const el = document.createElement(video ? "video" : "audio");
    el.controls = true;
    el.setAttribute("aria-label", it.name);
    el.className = "fv-media";
    el.src = blobUrl(it.blob);
    if (el instanceof HTMLVideoElement) el.playsInline = true;
    fig.replaceChildren(el);
  }
}

/** The room a picture may take at "Fit", in CSS pixels. */
function room() {
  const cs = getComputedStyle(stage);
  const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight), padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
  return { w: Math.max(40, stage.clientWidth - padX), h: Math.max(40, stage.clientHeight - padY) };
}

/** Size the Compare slider to the room. Set through CSSOM, which the policy allows. */
function layout() {
  const it = items[idx];
  if (!it || !ar || it.kind !== "compare") return;
  const r = room();
  const el = fig.firstElementChild as HTMLElement | null;
  if (el) el.style.width = `${Math.floor(Math.min(r.w, Math.max(120, (r.h - 56) * ar)))}px`;
}

// ---------------------------------------------------------------------------------------------
// Pages: building the cells, sizing them, drawing them when they are needed, letting them go.

/** Width in CSS pixels that page `i` takes now, from the layout and the zoom. */
function widthFor(i: number): number {
  const a = aspect.get(i) ?? defAr, nat = natural.get(i) ?? defNat;
  const mode = eff(), r = room();
  const cols = mode === "two" || mode === "grid" ? 2 : 1, rows = mode === "grid" ? 2 : 1;
  const cw = mode === "scroll" ? r.w : (r.w - GAP * (cols - 1)) / cols;
  const ch = (r.h - GAP * (rows - 1)) / rows;
  if (zoom === "width") return cw;
  if (zoom === "page") return Math.min(cw, ch * a);
  return nat * (zoom / 100);
}

function size(c: Cell) {
  const w = Math.max(24, Math.floor(widthFor(c.i)));
  const h = Math.max(24, Math.floor(w / (aspect.get(c.i) ?? defAr)));
  c.css = w;
  c.el.style.width = `${w}px`;
  c.el.style.height = `${h}px`;
}
function sizeAll() { for (const c of cells.values()) size(c); }

/** The zoom now in effect as a percent of the page's own size, taken from the first page on screen. */
function effPct(): number {
  const c = cells.get(eff() === "scroll" ? page : groupStart()) ?? cells.values().next().value;
  if (!c) return 100;
  return Math.round(((c.css || widthFor(c.i)) / (natural.get(c.i) ?? defNat)) * 100);
}

function build() {
  const my = ++token;
  stopAll();
  for (const c of cells.values()) dropPic(c);
  cells.clear();
  const mode = eff();
  lastEff = mode;
  if (multi()) page = mode === "two" || mode === "grid" ? groupStart() : page;
  fig.className = `fv-fig k-${cur().kind} l-${mode}`;
  const from = mode === "scroll" ? 1 : multi() ? groupStart() : 1;
  const to = mode === "scroll" ? pages() : multi() ? groupEnd() : 1;
  const els: HTMLElement[] = [];
  for (let i = from; i <= to; i++) {
    let el: HTMLElement;
    if (mode === "grid") {
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("aria-label", isPdf(cur()) ? V("openPage", "Open page {n}", { n: i }) : V("openImage", "Open image {n}", { n: i }));
      b.addEventListener("click", () => { forced = "one"; page = i; if (isSet()) idx = i - 1; build(); chrome(true); stage.scrollTo(0, 0); });
      el = b;
    } else el = document.createElement("div");
    el.className = "fv-cell";
    el.dataset.i = String(i);
    const c: Cell = { i, el, pic: null, w: 0, ctl: null, css: 0, need: 0 };
    cells.set(i, c);
    size(c);
    els.push(el);
  }
  fig.replaceChildren(...els);
  stage.scrollTo(0, 0);
  if (mode === "scroll") {
    watch(my);
    scrollToPage(page);
  } else {
    for (const c of cells.values()) want(c);
  }
  chrome(false);
  if (!dlg.contains(document.activeElement)) stage.focus();
}

/** Scroll mode: draw the pages near the window, let go of the ones far away. */
function watch(my: number) {
  drawObs?.disconnect(); freeObs?.disconnect();
  near = new Set();
  const cellOf = (t: Element) => cells.get(Number((t as HTMLElement).dataset.i));
  drawObs = new IntersectionObserver((es) => {
    if (my !== token) return;
    for (const e of es) {
      const c = cellOf(e.target);
      if (!c) continue;
      if (e.isIntersecting) { near.add(c.i); want(c); } else near.delete(c.i);
    }
  }, { root: stage, rootMargin: "150% 0px" });
  freeObs = new IntersectionObserver((es) => {
    if (my !== token) return;
    for (const e of es) { const c = cellOf(e.target); if (c && !e.isIntersecting) release(c); }
  }, { root: stage, rootMargin: "400% 0px" });
  for (const c of cells.values()) { drawObs.observe(c.el); freeObs.observe(c.el); }
}

function dropPic(c: Cell) {
  c.ctl?.abort();
  c.ctl = null;
  if (c.pic instanceof HTMLCanvasElement) { c.pic.width = 0; c.pic.height = 0; }
  c.pic = null;
  c.w = 0;
}

/** A page far from the window: its picture goes, its place stays. */
function release(c: Cell) {
  queue = queue.filter((j) => j.c !== c);
  dropPic(c);
  c.el.replaceChildren();
}

function stopAll() {
  drawObs?.disconnect(); freeObs?.disconnect();
  drawObs = freeObs = null;
  near = new Set();
  for (const j of queue) j.ctl.abort();
  queue = [];
  for (const c of cells.values()) c.ctl?.abort();
}

/** Draw `c` if it has no picture, or one too small or far too large for its size. */
function want(c: Cell) {
  const need = Math.min(4096, Math.ceil(c.css * dpr()));
  if (c.pic && c.w >= need * 0.95 && c.w <= need * 2.2) return;
  if (c.ctl && c.need >= need * 0.95 && c.need <= need * 2.2) return; // already being drawn big enough
  c.ctl?.abort();
  queue = queue.filter((j) => j.c !== c);
  const ctl = new AbortController();
  c.ctl = ctl;
  c.need = need;
  queue.push({ c, need, ctl, my: token });
  pump();
}

function pump() {
  while (running < MAX_JOBS && queue.length) {
    // The page nearest the one being read goes first.
    let k = 0;
    for (let q = 1; q < queue.length; q++) if (Math.abs(queue[q].c.i - page) < Math.abs(queue[k].c.i - page)) k = q;
    const job = queue.splice(k, 1)[0];
    running++;
    run(job).finally(() => { running--; pump(); });
  }
}

async function run(job: Job) {
  const { c, need, ctl, my } = job;
  if (ctl.signal.aborted || my !== token) return;
  const el = await drawOne(c.i, need, ctl.signal);
  if (ctl.signal.aborted || my !== token || !cells.has(c.i)) {
    if (el instanceof HTMLCanvasElement) { el.width = 0; el.height = 0; }
    return;
  }
  c.ctl = null;
  if (!el) {
    const p = document.createElement("p");
    p.className = "fv-msg";
    p.textContent = isPdf(cur()) ? V("failedPage", "This page can't be shown here.") : V("failedPicture", "This picture can't be shown here.");
    c.el.replaceChildren(p);
    return;
  }
  const nat = el instanceof HTMLCanvasElement ? Number(el.dataset.nw) || defNat : (el as HTMLImageElement).naturalWidth;
  const a = el instanceof HTMLCanvasElement ? el.width / el.height : (el as HTMLImageElement).naturalWidth / ((el as HTMLImageElement).naturalHeight || 1);
  el.className = "fv-pic";
  if (eff() === "grid") el.setAttribute("aria-hidden", "true");
  else if (el instanceof HTMLCanvasElement) { el.setAttribute("role", "img"); el.setAttribute("aria-label", multi() && eff() !== "one" ? pageLabel(c.i) : labelFor()); }
  c.el.replaceChildren(el);
  c.pic = el;
  c.w = el instanceof HTMLCanvasElement ? el.width : need;
  const first = !aspect.size;
  aspect.set(c.i, a); natural.set(c.i, nat);
  if (first) { defAr = a; defNat = nat; sizeAll(); chrome(false); } else { size(c); }
}

async function drawOne(i: number, need: number, signal: AbortSignal): Promise<HTMLElement | null> {
  const it = cur();
  if (isPdf(it)) return it.render(i, need, 1e5, signal);
  const item = isSet() ? items[i - 1] : it;
  if (item.kind !== "image") return null;
  const img = new Image();
  img.alt = item.name;
  img.decoding = "async";
  img.src = blobUrl(item.blob);
  try { await img.decode(); } catch { return null; }
  return img;
}

/** After zooming or resizing, draw the pages again at the sharpness their new size needs. */
function scheduleRedraw() {
  if (!items.length || !paged()) return;
  clearTimeout(redraw);
  const my = token;
  redraw = window.setTimeout(() => {
    if (my !== token) return;
    if (eff() === "scroll") for (const i of near) { const c = cells.get(i); if (c) want(c); }
    else for (const c of cells.values()) want(c);
  }, 220);
}

function scrollToPage(p: number) {
  const c = cells.get(p);
  if (!c) return;
  lockUntil = performance.now() + 300;
  stage.scrollTop = Math.max(0, fig.offsetTop + c.el.offsetTop - parseFloat(getComputedStyle(stage).paddingTop));
}

/** Scroll mode: "Page 7 of 59" follows the page in view. */
function follow() {
  if (!cells.size) return;
  const wait = lockUntil - performance.now();
  if (wait > 0) { // a jump we made ourselves is still settling: look again when it has
    const my = token;
    setTimeout(() => { if (my === token && !followRaf) follow(); }, wait + 20);
    return;
  }
  const line = stage.scrollTop + stage.clientHeight * 0.4;
  let p = 1;
  for (const c of cells.values()) { if (fig.offsetTop + c.el.offsetTop <= line) p = c.i; else break; }
  if (stage.scrollTop + stage.clientHeight >= stage.scrollHeight - 2) p = pages();
  if (p === page) return;
  page = p;
  if (isSet()) idx = p - 1;
  chrome(false);
}

function setLayout(l: Layout) {
  if (!multi() || l === eff() && !forced) return;
  if (l === "two" && narrow()) return;
  const keep = page;
  forced = null;
  pref = l;
  saveView();
  page = keep;
  build();
  $("fv-live").textContent = where();
}

function setZoom(z: Zoom) {
  if (!paged()) return;
  if (typeof z === "number") z = Math.min(MAX_PCT, Math.max(MIN_PCT, Math.round(z)));
  if (z === zoom) { chrome(false); return; }
  // Keep the middle of what the person is looking at in the middle.
  const fx = (stage.scrollLeft + stage.clientWidth / 2) / (stage.scrollWidth || 1), fy = (stage.scrollTop + stage.clientHeight / 2) / (stage.scrollHeight || 1);
  zoom = z;
  saveView();
  sizeAll();
  stage.scrollLeft = fx * stage.scrollWidth - stage.clientWidth / 2;
  stage.scrollTop = fy * stage.scrollHeight - stage.clientHeight / 2;
  chrome(false);
  scheduleRedraw();
}

function zoomBy(f: number) {
  if (!paged()) return;
  const now = effPct();
  setZoom(f > 1 ? Math.max(now + 1, Math.round(now * f)) : Math.min(now - 1, Math.round(now * f)));
}

/** Previous (-1) or Next (+1): by the layout's step in a PDF or picture set, or another item of the list. */
function go(d: number) {
  if (multi()) {
    const mode = eff();
    const to = mode === "scroll" ? page + d : groupStart() + d * PER[mode];
    if (to < 1 || to > pages()) return;
    page = to;
    if (isSet()) idx = to - 1;
    if (mode === "scroll") { scrollToPage(to); chrome(true); return; }
    build();
    chrome(true);
    return;
  }
  const to = idx + 1 + d;
  if (to < 1 || to > items.length) return;
  idx = to - 1;
  load(true);
}

function onKey(e: KeyboardEvent) {
  if (e.ctrlKey || e.metaKey || e.altKey || !items.length) return;
  const t = e.target as HTMLElement;
  const typing = t.matches("input:not([type=radio]), textarea, select, video, audio");
  const radio = t.matches("input[type=radio]");
  if (paged() && !typing) {
    if (e.key === "+" || e.key === "=") { e.preventDefault(); zoomBy(STEP); return; }
    if (e.key === "-" || e.key === "_") { e.preventDefault(); zoomBy(1 / STEP); return; }
    if (e.key === "0") { e.preventDefault(); setZoom("page"); return; }
    if (hasLayouts()) {
      const k = e.key.toLowerCase();
      const to: Layout | undefined = k === "1" ? "one" : k === "2" ? "two" : k === "4" ? "grid" : k === "s" ? "scroll" : undefined;
      if (to) { e.preventDefault(); setLayout(to); return; }
    }
  }
  if (count() < 2 || typing) return;
  if (multi() && eff() === "scroll") {
    const by = e.key === "PageDown" ? stage.clientHeight * 0.9 : e.key === "PageUp" ? -stage.clientHeight * 0.9 : !radio && e.key === "ArrowDown" ? 60 : !radio && e.key === "ArrowUp" ? -60 : 0;
    if (by) { e.preventDefault(); stage.scrollBy({ top: by }); }
    return;
  }
  if (e.key === "PageDown") { e.preventDefault(); go(1); }
  else if (e.key === "PageUp") { e.preventDefault(); go(-1); }
  // The arrows turn pages when there is nothing to pan; when zoomed in they pan, as the browser does by itself.
  else if (!radio && !(stage.scrollWidth > stage.clientWidth + 1 || stage.scrollHeight > stage.clientHeight + 1)) {
    if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
  }
}
