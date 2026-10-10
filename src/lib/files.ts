// Small helpers shared by tool pages: file sizes, downloads, the drop area and result boxes.
// Everything stays in the browser: files are read with the File API and handed back as blob: URLs.
import { zipAll } from "./zip.js";
import type { ZipEntry } from "./zip.js";
import { shareButton, canShareFile } from "./share";

export { zipAll };

export const fmtBytes = (n: number) =>
  n >= 1048576 ? `${(n / 1048576).toFixed(2)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`;

/** A download link for bytes made in the browser. */
export function downloadLink(data: BlobPart, filename: string, type: string, label = "Download") {
  const a = document.createElement("a");
  a.className = "btn";
  a.textContent = label;
  a.download = filename;
  a.href = URL.createObjectURL(new Blob([data], { type }));
  return a;
}

/** Today as "2026-10-10", for names of files made here. */
export const dateStamp = () => new Date().toISOString().slice(0, 10);

/**
 * "Download all (N files, ZIP)" for a tool that made several files. Returns null for fewer than two.
 * The ZIP is built when the person asks, not before. `getFiles` is read at that moment. The link
 * is a normal a[download] with a blob: href once built, so the library records it like any result.
 * A Share button follows where the browser can share a ZIP.
 */
export function downloadAllButton(getFiles: () => ZipEntry[], zipName: string): HTMLElement | null {
  const count = getFiles().length;
  if (count < 2) return null;
  const label = `Download all (${count} files, ZIP)`;
  const wrap = document.createElement("span");
  wrap.className = "dl-all";
  const a = document.createElement("a");
  a.className = "btn";
  a.textContent = label;
  a.download = zipName;
  a.href = "#";
  a.dataset.ownShare = "";
  wrap.append(a);

  let building: Promise<Blob> | null = null;
  const build = () => building ??= zipAll(getFiles()).then((blob) => {
    a.href = URL.createObjectURL(blob);
    return blob;
  }, (e) => { building = null; throw e; });

  a.addEventListener("click", async (e) => {
    if (a.href.startsWith("blob:")) return; // already built: the browser downloads it
    e.preventDefault();
    if (a.getAttribute("aria-busy")) return;
    a.setAttribute("aria-busy", "true");
    a.textContent = "Making the ZIP…";
    try {
      await build();
      a.textContent = label;
      a.removeAttribute("aria-busy");
      await Promise.resolve(); // let the library see the new link before it is clicked
      a.click();
    } catch {
      reportFailure();
      a.textContent = "The ZIP could not be made. Download the files one by one.";
      a.removeAttribute("aria-busy");
    }
  });

  if (canShareFile(zipName, "application/zip")) {
    const share = shareButton(zipName, "application/zip", build, {
      onShared: () => a.dispatchEvent(new CustomEvent("ftt:shared", { bubbles: true, detail: { link: a } })),
    });
    if (share) wrap.append(share);
  }
  return wrap;
}

/** Base name without extension: "report.final.pdf" -> "report.final". */
export const baseName = (name: string) => name.replace(/\.[^.]+$/, "");

/**
 * Wire a DropZone (see src/components/DropZone.astro) to a handler. Clicking or pressing
 * Enter/Space opens the file picker; dropping files works too.
 */
export function wireDrop(prefix: string, onFiles: (files: File[]) => void | Promise<void>) {
  const drop = document.getElementById(`${prefix}-drop`)!;
  const input = document.getElementById(`${prefix}-file`) as HTMLInputElement;
  // Reading a large file takes a moment. Say so on the drop area straight away, let the page draw
  // it, then hand the files to the tool; the note goes once the tool has read them.
  const take = async (files: File[]) => {
    if (!files.length) return;
    const note = document.createElement("div");
    note.className = "drop-reading";
    note.setAttribute("role", "status");
    const spin = document.createElement("span");
    spin.className = "spinner";
    spin.setAttribute("aria-hidden", "true");
    note.append(spin, files.length === 1 ? `Reading ${files[0].name}…` : `Reading ${files.length} files…`);
    drop.append(note);
    drop.setAttribute("aria-busy", "true");
    await paint();
    try { await onFiles(files); } finally { note.remove(); drop.removeAttribute("aria-busy"); }
  };
  drop.addEventListener("click", (e) => { if (!drop.hasAttribute("aria-busy")) input.click(); else e.preventDefault(); });
  drop.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); }
  });
  input.addEventListener("change", () => { const picked = [...(input.files ?? [])]; input.value = ""; take(picked); });
  for (const t of ["dragenter", "dragover"]) drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("over"); });
  for (const t of ["dragleave", "drop"]) drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove("over"); });
  drop.addEventListener("drop", (e) => take([...((e as DragEvent).dataTransfer?.files ?? [])]));
}

/** Make a drop zone small once files are in, so the next step is in view. */
export function compactDrop(prefix: string, on = true) {
  document.getElementById(`${prefix}-drop`)?.classList.toggle("compact", on);
}

/** Tell the page a tool could not process something (counted anonymously on /stats; no details are sent). */
export function reportFailure() {
  document.dispatchEvent(new CustomEvent("ftt:outcome", { detail: { ok: false } }));
}

// Phosphor icons (MIT) for result boxes built in the browser.
const svg = (d: string) => `<svg class="ic" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true" focusable="false"><path d="${d}"/></svg>`;
const DONE = svg("M176.49,95.51a12,12,0,0,1,0,17l-56,56a12,12,0,0,1-17,0l-24-24a12,12,0,1,1,17-17L112,143l47.51-47.52A12,12,0,0,1,176.49,95.51ZM236,128A108,108,0,1,1,128,20,108.12,108.12,0,0,1,236,128Zm-24,0a84,84,0,1,0-84,84A84.09,84.09,0,0,0,212,128Z");
const PROBLEM = svg("M128,20A108,108,0,1,0,236,128,108.12,108.12,0,0,0,128,20Zm0,192a84,84,0,1,1,84-84A84.09,84.09,0,0,1,128,212Zm-12-80V80a12,12,0,0,1,24,0v52a12,12,0,0,1-24,0Zm28,40a16,16,0,1,1-16-16A16,16,0,0,1,144,172Z");

function box(cls: string, icon: string, title: string, role: string) {
  const div = document.createElement("div");
  div.className = cls;
  div.setAttribute("role", role);
  div.tabIndex = -1;
  const t = document.createElement("span");
  t.className = "res-title";
  t.innerHTML = icon;
  t.append(title);
  div.append(t);
  return div;
}

/**
 * Put a result box in place. If keyboard focus was lost (the run button disables itself while
 * it works), move focus to the result, so keyboard and screen-reader users land on it.
 */
function place(el: HTMLElement, div: HTMLElement) {
  const lost = !document.activeElement || document.activeElement === document.body;
  el.replaceChildren(div);
  if (lost) div.focus();
}

/** "Your result will appear here." */
export function showWait(el: HTMLElement, text: string) {
  const p = document.createElement("p");
  p.className = "res-wait";
  p.textContent = text;
  el.replaceChildren(p);
}

/** "Working on it…", with a moving bar. */
/**
 * Wait until the browser has drawn the page. Call it after showing a spinner or a message and
 * before heavy work, or the work starts first and the page looks frozen.
 */
export const paint = () => new Promise<void>((done) => requestAnimationFrame(() => setTimeout(done, 0)));

/** A small spinner and a message in a details line, while a file is read. */
export function working(el: HTMLElement, text: string) {
  const s = document.createElement("span");
  s.className = "spin";
  s.setAttribute("aria-hidden", "true");
  el.replaceChildren(s, text);
}

/**
 * Progress shown under "Working on it…", such as "Making part 3 of 12". It is visual only: the
 * box already says it is working, and a screen reader should not read every step aloud.
 */
export function progress(el: HTMLElement) {
  const p = document.createElement("span");
  p.className = "res-progress";
  p.setAttribute("aria-hidden", "true");
  el.querySelector(".res-busy")?.append(p);
  let last = 0;
  // Update at most every 150 ms, and let the page draw each update.
  return async (text: string, force = false) => {
    const now = performance.now();
    if (!force && now - last < 150) return;
    last = now;
    p.textContent = text;
    await paint();
  };
}

/** Show "Working on it…". Await it before heavy work: it resolves once the page has drawn the box. */
export function showBusy(el: HTMLElement, sub = "This takes a few seconds. Please keep this page open.", title = "Working on it…"): Promise<void> {
  const div = box("res-busy", '<span class="spinner" aria-hidden="true"></span>', title, "status");
  const meter = document.createElement("div");
  meter.className = "meter";
  meter.append(document.createElement("i"));
  const s = document.createElement("span");
  s.textContent = sub;
  div.append(meter, s);
  place(el, div);
  return paint();
}

/** A green "Done." box. Extra nodes or text go under the title. Returns the box. */
export function showDone(el: HTMLElement, title: string, ...extra: (Node | string)[]) {
  const div = box("res-done", DONE, title, "status");
  for (const x of extra) {
    if (typeof x === "string") { const s = document.createElement("span"); s.textContent = x; div.append(s); } else div.append(x);
  }
  place(el, div);
  const note = donateLine();
  // Below the whole result, after its Download button, so it never sits between the person and their file.
  if (note) (el.closest(".step") ?? el).append(note);
  return div;
}

// One donation card after a result: at most once per visit, never after an error. "Next time"
// hides it for this visit only. The once-per-visit mark is listed on How it works.
const DONATE_SEEN = "ftt:donate-seen";
const HAND_HEART = svg("M230.33,141.06a24.34,24.34,0,0,0-18.61-4.77C230.5,117.33,240,98.48,240,80c0-26.47-21.29-48-47.46-48A47.58,47.58,0,0,0,156,48.75,47.58,47.58,0,0,0,119.46,32C93.29,32,72,53.53,72,80c0,11,3.24,21.69,10.06,33a31.87,31.87,0,0,0-14.75,8.4L44.69,144H16A16,16,0,0,0,0,160v40a16,16,0,0,0,16,16H120a7.93,7.93,0,0,0,1.94-.24l64-16a6.94,6.94,0,0,0,1.19-.4L226,182.82l.44-.2a24.6,24.6,0,0,0,3.93-41.56ZM119.46,48A31.15,31.15,0,0,1,148.6,67a8,8,0,0,0,14.8,0,31.15,31.15,0,0,1,29.14-19C209.59,48,224,62.65,224,80c0,19.51-15.79,41.58-45.66,63.9l-11.09,2.55A28,28,0,0,0,140,112H100.68C92.05,100.36,88,90.12,88,80,88,62.65,102.41,48,119.46,48ZM16,160H40v40H16Zm203.43,8.21-38,16.18L119,200H56V155.31l22.63-22.62A15.86,15.86,0,0,1,89.94,128H140a12,12,0,0,1,0,24H112a8,8,0,0,0,0,16h32a8.32,8.32,0,0,0,1.79-.2l67-15.41.31-.08a8.6,8.6,0,0,1,6.3,15.9Z");
function donateLine(): HTMLElement | null {
  try {
    if (sessionStorage.getItem(DONATE_SEEN)) return null;
    sessionStorage.setItem(DONATE_SEEN, "1");
  } catch { return null; }
  const card = document.createElement("aside");
  card.className = "donate-card";
  card.setAttribute("aria-label", "Donate");
  const ic = document.createElement("span");
  ic.className = "donate-ic";
  ic.innerHTML = HAND_HEART;
  const text = document.createElement("div");
  text.className = "donate-text";
  const head = document.createElement("b");
  head.textContent = "Saved you some time?";
  const body = document.createElement("span");
  body.textContent = "This tool is free and ran in your browser. A small donation helps keep it that way.";
  text.append(head, body);
  const actions = document.createElement("div");
  actions.className = "donate-actions";
  const a = document.createElement("a");
  a.className = "donate-btn";
  a.href = "https://ko-fi.com/freethetools";
  a.innerHTML = HAND_HEART;
  a.append("Donate");
  const later = document.createElement("button");
  later.type = "button";
  later.className = "btn quiet small";
  later.textContent = "Next time";
  later.addEventListener("click", () => card.remove());
  actions.append(a, later);
  card.append(ic, text, actions);
  return card;
}

/** Show a plain-language problem, what went wrong and what to do next, and count it as a failure. */
export function showError(el: HTMLElement, message: string, title = "That didn't work") {
  reportFailure();
  showProblem(el, message, title);
}

/** Show a problem without counting it again: for a summary of failures already reported one by one. */
export function showProblem(el: HTMLElement, message: string, title = "That didn't work") {
  const div = box("res-bad tool-error", PROBLEM, title, "alert");
  const p = document.createElement("span");
  p.textContent = message;
  div.append(p);
  place(el, div);
}

/** Before and after bars for a size change, like "Before ████ 1.9 MB / After ██ 830 KB". */
export function compareBars(before: number, after: number) {
  const wrap = document.createElement("div");
  wrap.className = "cmp";
  const max = Math.max(before, after, 1);
  for (const [label, n, cls] of [["Before", before, "b"], ["After", after, "a"]] as const) {
    const row = document.createElement("div");
    const l = document.createElement("span");
    l.textContent = label;
    const track = document.createElement("span");
    track.className = "cmp-track";
    const bar = document.createElement("i");
    bar.className = `cmp-bar ${cls}`;
    // Set through CSSOM, which the content security policy allows (style attributes it doesn't).
    bar.style.width = `${Math.max(2, (100 * n) / max)}%`;
    track.append(bar);
    const v = document.createElement("em");
    v.textContent = fmtBytes(n);
    row.append(l, track, v);
    wrap.append(row);
  }
  return wrap;
}

const GLYPHS = {
  up: svg("M216.49,168.49a12,12,0,0,1-17,0L128,97,56.49,168.49a12,12,0,0,1-17-17l80-80a12,12,0,0,1,17,0l80,80A12,12,0,0,1,216.49,168.49Z"),
  down: svg("M216.49,104.49l-80,80a12,12,0,0,1-17,0l-80-80a12,12,0,0,1,17-17L128,159l71.51-71.52a12,12,0,0,1,17,17Z"),
  remove: svg("M208.49,191.51a12,12,0,0,1-17,17L128,145,64.49,208.49a12,12,0,0,1-17-17L111,128,47.51,64.49a12,12,0,0,1,17-17L128,111l63.51-63.52a12,12,0,0,1,17,17L145,128Z"),
};

/** A square icon button for file rows: move up, move down or remove. `label` is read by screen readers. */
export function iconButton(kind: keyof typeof GLYPHS, label: string, onClick: () => void, disabled = false) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "icon-btn";
  b.dataset.kind = kind;
  b.innerHTML = GLYPHS[kind];
  b.setAttribute("aria-label", label);
  b.disabled = disabled;
  b.onclick = onClick;
  return b;
}

/**
 * After a list re-renders, put focus back where the person was: the same kind of button on the
 * row at `index` (or the nearest row), or the other arrow when that one is now disabled.
 */
export function refocus(list: HTMLElement, index: number, kind: keyof typeof GLYPHS, fallback?: HTMLElement | null) {
  const rows = list.children;
  const row = rows[Math.min(index, rows.length - 1)];
  if (!row) { fallback?.focus(); return; }
  const pick = (k: string) => row.querySelector<HTMLButtonElement>(`button[data-kind="${k}"]:not(:disabled)`);
  (pick(kind) ?? pick(kind === "up" ? "down" : kind === "down" ? "up" : "remove") ?? pick("remove"))?.focus();
}

// ---- File rows: a thumbnail, the name, what matters about the file, and its buttons ----

const tile = (inner: string) => `<svg class="ic" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true" focusable="false">${inner}</svg>`;
// Phosphor duotone "file-pdf" and "image" (MIT).
const PDF_ICON = tile('<path d="M208,88H152V32Z" opacity="0.2"/><path d="M224,152a8,8,0,0,1-8,8H192v16h16a8,8,0,0,1,0,16H192v16a8,8,0,0,1-16,0V152a8,8,0,0,1,8-8h32A8,8,0,0,1,224,152ZM92,172a28,28,0,0,1-28,28H56v8a8,8,0,0,1-16,0V152a8,8,0,0,1,8-8H64A28,28,0,0,1,92,172Zm-16,0a12,12,0,0,0-12-12H56v24h8A12,12,0,0,0,76,172Zm88,8a36,36,0,0,1-36,36H112a8,8,0,0,1-8-8V152a8,8,0,0,1,8-8h16A36,36,0,0,1,164,180Zm-16,0a20,20,0,0,0-20-20h-8v40h8A20,20,0,0,0,148,180ZM40,112V40A16,16,0,0,1,56,24h96a8,8,0,0,1,5.66,2.34l56,56A8,8,0,0,1,216,88v24a8,8,0,0,1-16,0V96H152a8,8,0,0,1-8-8V40H56v72a8,8,0,0,1-16,0ZM160,80h28.69L160,51.31Z"/>');
const IMAGE_ICON = tile('<path d="M224,56V178.06l-39.72-39.72a8,8,0,0,0-11.31,0L147.31,164,97.66,114.34a8,8,0,0,0-11.32,0L32,168.69V56a8,8,0,0,1,8-8H216A8,8,0,0,1,224,56Z" opacity="0.2"/><path d="M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40Zm0,16V158.75l-26.07-26.06a16,16,0,0,0-22.63,0l-20,20-44-44a16,16,0,0,0-22.62,0L40,149.37V56ZM40,172l52-52,80,80H40Zm176,28H194.63l-36-36,20-20L216,181.38V200ZM144,100a12,12,0,1,1,12,12A12,12,0,0,1,144,100Z"/>');

const TYPES: Record<string, string> = {
  "image/jpeg": "JPG", "image/png": "PNG", "image/webp": "WebP", "image/avif": "AVIF", "image/gif": "GIF", "image/bmp": "BMP",
  "image/heic": "HEIC", "image/heif": "HEIF", "image/svg+xml": "SVG", "image/tiff": "TIFF", "application/pdf": "PDF",
};
/** A file's type in plain words: "JPG", "PNG", "PDF". */
export const typeLabel = (f: File) => TYPES[f.type] ?? (f.name.includes(".") ? f.name.split(".").pop()!.toUpperCase() : "File");

type Thumb = { box: HTMLElement; w?: number; h?: number; waiting: ((w: number, h: number) => void)[] };
const thumbs = new WeakMap<Blob, Thumb>();

/**
 * A square thumbnail of a photo, made by the browser from the file itself (nothing leaves the
 * page). Made once per file: lists that re-render reuse it. `onSize` gets the size in pixels.
 */
export function imageThumb(file: Blob, onSize?: (width: number, height: number) => void) {
  let t = thumbs.get(file);
  if (!t) {
    const box = document.createElement("span");
    box.className = "fthumb";
    const img = new Image();
    img.alt = "";
    img.decoding = "async";
    const made: Thumb = { box, waiting: [] };
    img.onload = () => { made.w = img.naturalWidth; made.h = img.naturalHeight; made.waiting.splice(0).forEach((fn) => fn(made.w!, made.h!)); };
    img.onerror = () => { img.remove(); box.innerHTML = IMAGE_ICON; made.waiting.length = 0; };
    img.src = URL.createObjectURL(file);
    box.append(img);
    thumbs.set(file, (t = made));
  }
  if (onSize) { if (t.w && t.h) onSize(t.w, t.h); else t.waiting.push(onSize); }
  return t.box;
}

/** A PDF tile, or a canvas when the caller can draw the first page into it. */
export function pdfThumb() {
  const box = document.createElement("span");
  box.className = "fthumb";
  box.innerHTML = PDF_ICON;
  return box;
}

/**
 * A file as a row of a `.file-list`: thumbnail, name, a details line (`.fmeta`), optional extra
 * lines, and buttons. Returns the row; its details line is `row.querySelector(".fmeta")`.
 */
export function fileRow(o: { name: string; meta: string; thumb?: HTMLElement; extra?: Node[]; actions?: Node[] }) {
  const li = document.createElement("li");
  const info = document.createElement("span");
  info.className = "finfo";
  const n = document.createElement("span"); n.className = "fname"; n.textContent = o.name;
  const m = document.createElement("span"); m.className = "fmeta"; m.textContent = o.meta;
  info.append(n, m, ...(o.extra ?? []));
  const act = document.createElement("span"); act.className = "fact"; act.append(...(o.actions ?? []));
  if (o.thumb) { li.classList.add("has-thumb"); li.append(o.thumb); }
  li.append(info, act);
  return li;
}

/** "JPG · 4032 × 3024 · 4.1 MB" once the size is known, "JPG · 4.1 MB" until then. */
export const photoMeta = (f: File, w?: number, h?: number) => [typeLabel(f), w && h ? `${w} × ${h}` : "", fmtBytes(f.size)].filter(Boolean).join(" · ");

/** A photo as a row, with its thumbnail and its type, size in pixels and file size. */
export function photoRow(file: File, actions: Node[] = [], extra: Node[] = []) {
  const li = fileRow({ name: file.name, meta: photoMeta(file), actions, extra });
  const meta = li.querySelector(".fmeta")!;
  li.classList.add("has-thumb");
  li.prepend(imageThumb(file, (w, h) => (meta.textContent = photoMeta(file, w, h))));
  return li;
}
