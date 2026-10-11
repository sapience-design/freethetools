// The full-screen viewer: one native <dialog> (ViewerDialog.astro) that any preview can open.
// It shows a PDF page drawn sharp for the screen, a picture, a before-and-after slider or a
// player, with zoom, Previous and Next. Loaded only when a preview's expand button is pressed
// (see expand.ts). Everything is local: blob: URLs made here are revoked when it closes.
import type { ViewItem } from "./expand";
import { V } from "./expand";
import { compareSlider } from "./preview";

type Pdf = Extract<ViewItem, { kind: "pdf" }>;

const MAX_ZOOM = 6, STEP = 1.25;
const $ = <E extends HTMLElement>(id: string) => document.getElementById(id) as E;

let dlg: HTMLDialogElement, stage: HTMLElement, fig: HTMLElement;
let items: ViewItem[] = [], idx = 0, page = 1, zoom = 1;
let opener: HTMLElement | null = null;
let urls: string[] = [];
let token = 0;          // changes whenever what is on screen changes; late results from older ones are dropped
let ar = 0;             // width / height of the picture on screen, once known
let rendered = 0;       // width in device pixels of the page picture now on screen
let redraw = 0;
let ready = false;

const cur = () => items[idx];
const isPdf = (it: ViewItem): it is Pdf => it.kind === "pdf";
const count = () => (isPdf(cur()) ? (cur() as Pdf).pages : items.length);
const pos = () => (isPdf(cur()) ? page : idx + 1);
const dpr = () => Math.min(3, window.devicePixelRatio || 1);

function init() {
  dlg = $<HTMLDialogElement>("fv");
  if (!dlg || typeof dlg.showModal !== "function") return false;
  if (ready) return true;
  ready = true;
  stage = $("fv-stage");
  fig = document.createElement("div");
  fig.className = "fv-fig";
  stage.append(fig);

  $("fv-close").addEventListener("click", () => dlg.close());
  $("fv-prev").addEventListener("click", () => go(-1));
  $("fv-next").addEventListener("click", () => go(1));
  $("fv-in").addEventListener("click", () => setZoom(zoom * STEP));
  $("fv-out").addEventListener("click", () => setZoom(zoom / STEP));
  $("fv-fit").addEventListener("click", () => setZoom(1));
  $("fv-full").addEventListener("click", () => {
    const v = fig.querySelector("video") as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (!v) return;
    if (v.requestFullscreen) v.requestFullscreen().catch(() => {});
    else v.webkitEnterFullscreen?.();
  });
  dlg.addEventListener("close", cleanup);
  dlg.addEventListener("keydown", onKey);
  new ResizeObserver(() => { if (dlg.open && items.length) { layout(); scheduleRedraw(); } }).observe(stage);
  return true;
}

/** Open the viewer on `list`, starting at `start`. */
export function show(list: ViewItem[], start: number, from: HTMLElement | null) {
  if (!list.length || !init()) return;
  items = list;
  idx = Math.min(Math.max(0, start), list.length - 1);
  opener = from;
  const it = cur();
  page = isPdf(it) ? Math.min(Math.max(1, it.page ?? 1), it.pages) : 1;
  if (!dlg.open) dlg.showModal();
  $("fv-live").textContent = "";
  load(false);
  $("fv-close").focus();
}

function cleanup() {
  token++;
  clearTimeout(redraw);
  for (const m of fig.querySelectorAll("video, audio") as NodeListOf<HTMLMediaElement>) { m.pause(); m.removeAttribute("src"); m.load(); }
  fig.replaceChildren();
  for (const u of urls) URL.revokeObjectURL(u);
  urls = [];
  items = [];
  ar = 0; rendered = 0;
  const back = opener;
  opener = null;
  if (back?.isConnected) back.focus();
}

const blobUrl = (b: Blob) => { const u = URL.createObjectURL(b); urls.push(u); return u; };

function where(): string {
  return isPdf(cur())
    ? V("pageOf", "Page {n} of {total}", { n: pos(), total: count() })
    : V("itemOf", "Image {n} of {total}", { n: pos(), total: count() });
}

function labelFor(): string {
  return count() < 2 ? cur().name : `${where()}, ${cur().name}`;
}

function chrome(announce: boolean) {
  const it = cur(), n = count();
  dlg.setAttribute("aria-label", labelFor());
  $("fv-name").textContent = it.name;
  $("fv-pos").textContent = n < 2 ? "" : where();
  $("fv-nav").hidden = n < 2;
  ($("fv-prev") as HTMLButtonElement).disabled = pos() <= 1;
  ($("fv-next") as HTMLButtonElement).disabled = pos() >= n;
  const zoomable = it.kind === "pdf" || it.kind === "image";
  $("fv-zoom").hidden = !zoomable;
  $("fv-full").hidden = !(it.kind === "media" && it.blob.type.startsWith("video/"));
  const fitBtn = $("fv-fit"), fitName = V("fitScreen", "Fit to screen");
  fitBtn.textContent = zoom === 1 ? V("fit", "Fit") : `${Math.round(zoom * 100)}%`;
  fitBtn.setAttribute("aria-label", zoom === 1 ? fitName : `${fitBtn.textContent}, ${fitName}`); // the visible text stays in the name
  ($("fv-out") as HTMLButtonElement).disabled = zoom <= 1;
  ($("fv-in") as HTMLButtonElement).disabled = zoom >= MAX_ZOOM;
  if (announce && n > 1) $("fv-live").textContent = where();
  // Disabling the button that has focus drops focus to the page behind: hand it to another one.
  const a = document.activeElement as HTMLButtonElement | null;
  if (a && dlg.contains(a) && (a.disabled || a.closest("[hidden]"))) {
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
  zoom = 1; ar = 0; rendered = 0;
  stage.scrollTo(0, 0);
  chrome(announce);
  const it = cur();
  fig.className = `fv-fig k-${it.kind}`;
  if (it.kind === "pdf") {
    message(V("loading", "Drawing the page…"));
    drawPage(my);
  } else if (it.kind === "image") {
    const img = new Image();
    img.alt = it.name;
    img.className = "fv-pic";
    img.decoding = "async";
    img.onload = () => { if (my !== token) return; ar = img.naturalWidth / (img.naturalHeight || 1); fig.replaceChildren(img); layout(); };
    img.onerror = () => { if (my === token) message(V("failedPicture", "This picture can't be shown here.")); };
    message(V("loading", "Drawing the page…"));
    img.src = blobUrl(it.blob);
  } else if (it.kind === "compare") {
    const slider = compareSlider(it.before, it.after, { beforeLabel: it.beforeLabel, afterLabel: it.afterLabel });
    slider.classList.add("fv-cmp");
    for (const im of slider.querySelectorAll("img")) urls.push(im.src);
    const first = slider.querySelector("img.cmp-before") as HTMLImageElement;
    const fit = () => { if (my !== token || !first.naturalWidth) return; ar = first.naturalWidth / first.naturalHeight; layout(); };
    first.addEventListener("load", fit, { once: true });
    fig.replaceChildren(slider);
  } else {
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

/** The room the picture may take at "Fit", in CSS pixels. */
function room() {
  const cs = getComputedStyle(stage);
  const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight), padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
  return { w: Math.max(40, stage.clientWidth - padX), h: Math.max(40, stage.clientHeight - padY) };
}

/** Size the picture on screen: Fit times the zoom. Set through CSSOM, which the policy allows. */
function layout() {
  const it = items[idx];
  if (!it || !ar) return;
  const r = room();
  const el = fig.firstElementChild as HTMLElement | null;
  if (!el || el.tagName === "P") return;
  if (it.kind === "compare") {
    el.style.width = `${Math.floor(Math.min(r.w, Math.max(120, (r.h - 56) * ar)))}px`;
    return;
  }
  if (it.kind !== "pdf" && it.kind !== "image") return;
  const w = Math.min(r.w, r.h * ar) * zoom;
  el.style.width = `${Math.floor(w)}px`;
  el.style.height = `${Math.floor(w / ar)}px`;
}

async function drawPage(my: number) {
  const it = cur() as Pdf, n = page;
  const r = room();
  const boxW = Math.round(r.w * zoom * dpr()), boxH = Math.round(r.h * zoom * dpr());
  const c = await it.render(n, boxW, boxH);
  if (my !== token || n !== page) return;
  if (!c) { message(V("failedPage", "This page can't be shown here.")); return; }
  c.className = "fv-pic";
  c.setAttribute("role", "img");
  c.setAttribute("aria-label", labelFor());
  ar = c.width / c.height;
  rendered = boxW;
  const keep = [stage.scrollLeft, stage.scrollTop];
  fig.replaceChildren(c);
  layout();
  stage.scrollTo(keep[0], keep[1]);
}

/** After zooming in, draw the page again at the sharpness the new size needs. */
function scheduleRedraw() {
  if (!items.length || !isPdf(cur()) || !ar) return;
  clearTimeout(redraw);
  const r = room();
  if (r.w * zoom * dpr() <= rendered * 1.05 && r.h * zoom * dpr() <= rendered * 1.05 / ar) return;
  const my = token;
  redraw = window.setTimeout(() => { if (my === token) drawPage(my); }, 220);
}

function setZoom(z: number) {
  if (!ar) return;
  const next = Math.min(MAX_ZOOM, Math.max(1, Math.round(z * 1000) / 1000));
  if (next === zoom) return;
  // Keep the middle of what the person is looking at in the middle.
  const fx = (stage.scrollLeft + stage.clientWidth / 2) / (stage.scrollWidth || 1), fy = (stage.scrollTop + stage.clientHeight / 2) / (stage.scrollHeight || 1);
  zoom = next;
  layout();
  stage.scrollLeft = fx * stage.scrollWidth - stage.clientWidth / 2;
  stage.scrollTop = fy * stage.scrollHeight - stage.clientHeight / 2;
  chrome(false);
  scheduleRedraw();
}

/** Previous (-1) or Next (+1): another page of the PDF, or another item of the list. */
function go(d: number) {
  const to = pos() + d;
  if (to < 1 || to > count()) return;
  if (isPdf(cur())) page = to; else idx = to - 1;
  load(true);
}

function onKey(e: KeyboardEvent) {
  if (e.ctrlKey || e.metaKey || e.altKey || !items.length) return;
  const t = e.target as HTMLElement;
  const typing = t.matches("input, textarea, select, video, audio");
  const zoomable = cur().kind === "pdf" || cur().kind === "image";
  if (zoomable && !typing) {
    if (e.key === "+" || e.key === "=") { e.preventDefault(); setZoom(zoom * STEP); return; }
    if (e.key === "-" || e.key === "_") { e.preventDefault(); setZoom(zoom / STEP); return; }
    if (e.key === "0") { e.preventDefault(); setZoom(1); return; }
  }
  if (count() < 2 || typing) return;
  if (e.key === "PageDown") { e.preventDefault(); go(1); }
  else if (e.key === "PageUp") { e.preventDefault(); go(-1); }
  // The arrows turn pages at "Fit"; when zoomed in they pan, as the browser does by itself.
  else if (zoom <= 1.001) {
    if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
  }
}
