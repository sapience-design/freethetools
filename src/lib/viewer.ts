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
interface Cell { i: number; el: HTMLElement; pic: HTMLElement | null; w: number; ctl: AbortController | null; css: number; pw: number; need: number }
interface Job { c: Cell; need: number; ctl: AbortController; my: number }

const MIN_PCT = 25, MAX_PCT = 800, STEP = 1.25;
const GAP = 12;               // between pages, in CSS pixels
const NARROW = 700;           // below this width "Two pages" falls back to "One page"
const MAX_JOBS = 2;           // pages drawn at the same time
const PER: Record<Layout, number> = { one: 1, two: 2, grid: 4, scroll: 1 };
const LEVELS = [50, 75, 100, 125, 150, 200];
const KEY = "ftt-viewer-view";       // zoom: this tab only
const LAYOUT_KEY = "ftt:viewer-layout"; // layout: kept in this browser, listed on the How it works page
const TURN_AT = 60;           // wheel distance that counts as "turn the page"
const GESTURE_GAP = 120;      // ms of quiet that ends one wheel gesture
const TURN_LOCK = 200;        // ms after a turn when the wheel is ignored
const SWIPE = 50;             // px a finger must travel sideways to turn the page
const $ = <E extends HTMLElement>(id: string) => document.getElementById(id) as E;

let dlg: HTMLDialogElement, stage: HTMLElement, fig: HTMLElement;
let items: ViewItem[] = [], idx = 0, page = 1;
let pref: Layout = "one";       // the layout the person chose; remembered in this browser
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
let rot = 0;            // the view is turned by this many degrees (0, 90, 180, 270); not saved, not in the file
// Wheel and touch: one gesture turns one page.
let wAcc = 0, wLast = 0, wAbs = 0, wLock = 0, wSettle = false, wPanned = 0, zBase = 0, zLast = 0;
let touch: { x: number; y: number; t: number } | null = null;
let tapAt = { t: 0, x: 0, y: 0 }, lastTouch = 0;

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

/** The number shown in "Go to page": the first page on screen. */
const here = () => (multi() ? (eff() === "scroll" ? page : groupStart()) : pos());

function readView() {
  try {
    const l = localStorage.getItem(LAYOUT_KEY);
    if (l === "one" || l === "two" || l === "grid" || l === "scroll") pref = l;
  } catch { /* storage may be blocked */ }
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) || "null");
    if (v && ["one", "two", "grid", "scroll"].includes(v.l) && pref === "one") pref = v.l;
    if (v && (v.z === "page" || v.z === "width" || (typeof v.z === "number" && v.z >= MIN_PCT && v.z <= MAX_PCT))) zoom = v.z;
  } catch { /* storage may be blocked */ }
}
function saveView() {
  try { sessionStorage.setItem(KEY, JSON.stringify({ l: pref, z: zoom })); } catch { /* ignore */ }
  try { localStorage.setItem(LAYOUT_KEY, pref); } catch { /* ignore */ }
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
  $("fv-rot").addEventListener("click", () => rotate(90));
  const jump = $<HTMLInputElement>("fv-jump");
  jump.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const n = parseInt(jump.value, 10);
    if (n > 0) goTo(n);
    jump.value = String(here());
    jump.select();
  });
  jump.addEventListener("blur", () => { if (items.length) jump.value = String(here()); });
  fig.addEventListener("animationend", () => fig.classList.remove("t-next", "t-prev"));
  // Not passive: a wheel turn or a zoom must stop the page from also scrolling or the browser from zooming.
  stage.addEventListener("wheel", onWheel, { passive: false });
  stage.addEventListener("touchstart", (e) => { touch = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY, t: performance.now() } : null; }, { passive: true });
  stage.addEventListener("touchmove", (e) => { if (e.touches.length > 1) touch = null; }, { passive: true });
  stage.addEventListener("touchend", onTouchEnd, { passive: true });
  stage.addEventListener("touchcancel", () => { touch = null; }, { passive: true });
  stage.addEventListener("dblclick", (e) => {
    if (performance.now() - lastTouch < 600 || !paged() || eff() === "grid") return; // a double tap is handled on its own
    toggleZoom(e.clientX, e.clientY);
  });
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
  rot = 0;
  wAcc = 0; wSettle = false; wLock = 0;
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
  $("fv-rot").hidden = !zoomable;
  // "Go to page [ 3 ]": for three or more pages, so Previous and Next are not the only way.
  $("fv-jumpbox").hidden = n < 3;
  $("fv-jl").textContent = isPdf(it) ? V("goToPage", "Go to page") : V("goToImage", "Go to image");
  const jump = $<HTMLInputElement>("fv-jump");
  if (document.activeElement !== jump) jump.value = String(here());
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
  const a = shape(i), nat = ownWidth(i);
  const mode = eff(), r = room();
  const cols = mode === "two" || mode === "grid" ? 2 : 1, rows = mode === "grid" ? 2 : 1;
  const cw = mode === "scroll" ? r.w : (r.w - GAP * (cols - 1)) / cols;
  const ch = (r.h - GAP * (rows - 1)) / rows;
  if (zoom === "width") return cw;
  if (zoom === "page") return Math.min(cw, ch * a);
  return nat * (zoom / 100);
}

const turned = () => rot === 90 || rot === 270;
/** Width / height of page `i` as shown: a view turned a quarter has them swapped. */
function shape(i: number) {
  const a = aspect.get(i) ?? defAr;
  return turned() ? 1 / a : a;
}
/** The page's own width as shown, in CSS pixels at 100%. */
function ownWidth(i: number) {
  const nat = natural.get(i) ?? defNat;
  return turned() ? nat / (aspect.get(i) ?? defAr) : nat;
}

function size(c: Cell) {
  const w = Math.max(24, Math.floor(widthFor(c.i)));
  const h = Math.max(24, Math.floor(w / shape(c.i)));
  c.css = w;
  c.el.style.width = `${w}px`;
  c.el.style.height = `${h}px`;
  // The picture is drawn upright and turned here; a quarter turn also swaps its box.
  const p = c.pic;
  if (p) {
    p.style.position = rot ? "absolute" : "";
    p.style.left = p.style.top = rot ? "50%" : "";
    p.style.width = rot ? `${turned() ? h : w}px` : "";
    p.style.height = rot ? `${turned() ? w : h}px` : "";
    p.style.transform = rot ? `translate(-50%, -50%) rotate(${rot}deg)` : "";
  }
  c.pw = turned() ? h : w;
}
function sizeAll() { for (const c of cells.values()) size(c); }

/** The zoom now in effect as a percent of the page's own size, taken from the first page on screen. */
function effPct(): number {
  const c = cells.get(eff() === "scroll" ? page : groupStart()) ?? cells.values().next().value;
  if (!c) return 100;
  return Math.round(((c.css || widthFor(c.i)) / ownWidth(c.i)) * 100);
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
    const c: Cell = { i, el, pic: null, w: 0, ctl: null, css: 0, pw: 0, need: 0 };
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
  const need = Math.min(4096, Math.ceil((c.pw || c.css) * dpr()));
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

/** `at` is a point on screen to keep still (the mouse, the tap); without it the middle stays in the middle. */
function setZoom(z: Zoom, at?: { x: number; y: number }) {
  if (!paged()) return;
  if (typeof z === "number") z = Math.min(MAX_PCT, Math.max(MIN_PCT, Math.round(z)));
  if (z === zoom) { chrome(false); return; }
  const r = stage.getBoundingClientRect();
  const ax = at ? at.x - r.left : stage.clientWidth / 2, ay = at ? at.y - r.top : stage.clientHeight / 2;
  const fx = (stage.scrollLeft + ax) / (stage.scrollWidth || 1), fy = (stage.scrollTop + ay) / (stage.scrollHeight || 1);
  zoom = z;
  saveView();
  sizeAll();
  stage.scrollLeft = fx * stage.scrollWidth - ax;
  stage.scrollTop = fy * stage.scrollHeight - ay;
  chrome(false);
  scheduleRedraw();
}

function zoomBy(f: number) {
  if (!paged()) return;
  const now = effPct();
  setZoom(f > 1 ? Math.max(now + 1, Math.round(now * f)) : Math.min(now - 1, Math.round(now * f)));
}


/** Turn the whole view by a quarter. It is only how the pages are shown; the file is not changed. */
function rotate(d: number) {
  if (!paged()) return;
  rot = (rot + d + 360) % 360;
  sizeAll();
  chrome(false);
  scheduleRedraw();
  $("fv-live").textContent = V("rotated", "Rotated to {n}°", { n: rot });
}

/** Double-click and double-tap: from a fitted page to twice its size at that spot, and back. */
function toggleZoom(x: number, y: number) {
  if (!paged()) return;
  if (zoom === "page" || zoom === "width") setZoom(Math.max(200, effPct() * 2), { x, y });
  else setZoom("page");
}

/** The slide-in on a page turn (the style only runs when the person has not asked for less motion). */
function turnAnim(d: number) {
  fig.classList.remove("t-next", "t-prev");
  if (!d) return;
  void fig.offsetWidth;
  fig.classList.add(d > 0 ? "t-next" : "t-prev");
}

/** Previous (-1) or Next (+1): by the layout's step in a PDF or picture set, or another item of the list. False when there is none. */
function go(d: number): boolean {
  if (multi()) {
    const mode = eff();
    const to = mode === "scroll" ? page + d : groupStart() + d * PER[mode];
    if (to < 1 || to > pages()) return false;
    return goTo(to, d);
  }
  const to = idx + 1 + d;
  if (to < 1 || to > items.length) return false;
  return goTo(to, d);
}

/** Straight to page (or item) `n`, counted from 1. */
function goTo(n: number, d = 0): boolean {
  n = Math.min(Math.max(1, Math.round(n)), count());
  if (multi()) {
    page = n;
    if (isSet()) idx = n - 1;
    if (eff() === "scroll") { scrollToPage(n); chrome(true); return true; }
    build();
  } else {
    idx = n - 1;
    load(true);
  }
  turnAnim(d);
  if (multi()) chrome(true);
  return true;
}

/** Can the picture area still scroll this way? Zoomed in, it can; fitted, it cannot. */
function canPan(horiz: boolean, dir: number) {
  return horiz
    ? dir > 0 ? stage.scrollLeft + stage.clientWidth < stage.scrollWidth - 1 : stage.scrollLeft > 0
    : dir > 0 ? stage.scrollTop + stage.clientHeight < stage.scrollHeight - 1 : stage.scrollTop > 0;
}
const zoomedIn = () => stage.scrollWidth > stage.clientWidth + 1 || stage.scrollHeight > stage.clientHeight + 1;

/**
 * The wheel. Ctrl or Cmd (and a trackpad pinch, which arrives as the same) zooms. In One page and Two pages
 * it scrolls a zoomed page first and, at the edge, turns the page: a trackpad sends dozens of small events
 * for one swipe, so a turn needs enough travel, then the wheel is ignored until the gesture has died away.
 * Grid and Scroll keep the browser's own scrolling.
 */
function onWheel(e: WheelEvent) {
  if (!items.length || !paged()) return;
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
    const now = performance.now();
    if (now - zLast > 300 || !zBase) zBase = effPct();
    zLast = now;
    zBase = Math.min(MAX_PCT, Math.max(MIN_PCT, zBase * Math.exp(-e.deltaY * (e.deltaMode === 1 ? 16 : 1) * 0.0025)));
    setZoom(zBase, { x: e.clientX, y: e.clientY });
    return;
  }
  const mode = eff();
  if (mode === "grid" || mode === "scroll" || count() < 2) return;
  const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? stage.clientHeight : 1;
  const dx = e.deltaX * unit, dy = e.deltaY * unit;
  const horiz = Math.abs(dx) > Math.abs(dy), d = horiz ? dx : dy;
  if (!d) return;
  const now = performance.now(), gap = now - wLast, dir = d > 0 ? 1 : -1;
  wLast = now;
  if (canPan(horiz, dir)) { wPanned = now; wAcc = 0; return; } // the page scrolls by itself
  e.preventDefault();
  if (now - wPanned < GESTURE_GAP) { wPanned = now; return; }  // the same swipe that just reached the edge
  if (now < wLock) { wAbs = Math.abs(d); return; }
  if (wSettle) {
    // After a turn, only a pause or a fresh, harder push starts a new gesture; the tail of a swipe does not.
    if (gap < GESTURE_GAP && Math.abs(d) <= wAbs * 1.5) { wAbs = Math.abs(d); return; }
    wSettle = false;
    wAcc = 0;
  }
  if (gap > GESTURE_GAP || Math.sign(wAcc) !== dir) wAcc = 0;
  wAcc += d;
  wAbs = Math.abs(d);
  if (Math.abs(wAcc) >= TURN_AT && go(dir)) { wAcc = 0; wSettle = true; wLock = now + TURN_LOCK; }
  else if (Math.abs(wAcc) >= TURN_AT) wAcc = 0; // at the first or last page
}

/** Touch: a sideways swipe turns the page when it is not zoomed in sideways; two quick taps zoom. */
function onTouchEnd(e: TouchEvent) {
  const s = touch;
  touch = null;
  if (!s || e.touches.length || !items.length || !paged()) return;
  const t = e.changedTouches[0], dx = t.clientX - s.x, dy = t.clientY - s.y, now = performance.now(), dt = now - s.t;
  lastTouch = now;
  if (Math.abs(dx) < 10 && Math.abs(dy) < 10 && dt < 300) {
    if (now - tapAt.t < 350 && Math.hypot(t.clientX - tapAt.x, t.clientY - tapAt.y) < 30 && eff() !== "grid") { tapAt.t = 0; toggleZoom(t.clientX, t.clientY); }
    else tapAt = { t: now, x: t.clientX, y: t.clientY };
    return;
  }
  const mode = eff();
  if ((mode === "one" || mode === "two") && count() > 1 && dt < 800 && Math.abs(dx) >= SWIPE && Math.abs(dx) > Math.abs(dy) * 1.5 && !(stage.scrollWidth > stage.clientWidth + 1)) go(dx < 0 ? 1 : -1);
}

function onKey(e: KeyboardEvent) {
  if (e.ctrlKey || e.metaKey || e.altKey || !items.length) return;
  const t = e.target as HTMLElement;
  const typing = t.matches("input:not([type=radio]), textarea, select, video, audio");
  const radio = t.matches("input[type=radio]");
  const k = e.key.toLowerCase();
  if (paged() && !typing) {
    if (e.key === "+" || e.key === "=") { e.preventDefault(); zoomBy(STEP); return; }
    if (e.key === "-" || e.key === "_") { e.preventDefault(); zoomBy(1 / STEP); return; }
    if (e.key === "0") { e.preventDefault(); setZoom("page"); return; }
    if (k === "r") { e.preventDefault(); rotate(e.shiftKey ? -90 : 90); return; }
    if (k === "g" && !$("fv-jumpbox").hidden) { e.preventDefault(); const j = $<HTMLInputElement>("fv-jump"); j.focus(); j.select(); return; }
    if (hasLayouts()) {
      const to: Layout | undefined = k === "1" ? "one" : k === "2" ? "two" : k === "4" ? "grid" : k === "s" ? "scroll" : undefined;
      if (to) { e.preventDefault(); setLayout(to); return; }
    }
  }
  if (count() < 2 || typing) return;
  if (e.key === "Home" || e.key === "End") { e.preventDefault(); goTo(e.key === "Home" ? 1 : count()); return; }
  if (multi() && eff() === "scroll") {
    const by = e.key === "PageDown" ? stage.clientHeight * 0.9 : e.key === "PageUp" ? -stage.clientHeight * 0.9 : !radio && e.key === "ArrowDown" ? 60 : !radio && e.key === "ArrowUp" ? -60 : 0;
    if (by) { e.preventDefault(); stage.scrollBy({ top: by }); }
    return;
  }
  // Page Down and Space read on: they scroll a zoomed page first and turn the page at its end. Space on a button presses it.
  const space = e.key === " " && !t.closest("button, input, select, a, summary");
  const read = e.key === "PageDown" || (space && !e.shiftKey) ? 1 : e.key === "PageUp" || (space && e.shiftKey) ? -1 : 0;
  if (read) {
    e.preventDefault();
    if (canPan(false, read)) stage.scrollBy({ top: read * stage.clientHeight * 0.9 });
    else go(read);
    return;
  }
  // The arrows turn pages when there is nothing to pan; when zoomed in they pan, as the browser does by itself.
  if (!radio && !zoomedIn()) {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); go(1); }
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); go(-1); }
  }
}
