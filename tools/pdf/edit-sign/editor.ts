// The page logic of Edit and Sign PDF: show the pages, take clicks, drags, keys and touches, keep
// the marks, and save. The marks and the saving live in core.js. Nothing is uploaded.
//
// How it is built: each PDF page is a <canvas> (drawn by pdf.js) with an <svg> on top. The svg's
// viewBox is the page in points, so a mark's numbers are the same on screen and in the saved file.
// Every mark is a focusable <g>; the selected one gets a dashed box and a resize handle.
import {
  applyMarks, boundsOf, BASELINE, createHistory, describeMark, HIGHLIGHT_OPACITY, isLatinText, LINE, moveMark, PAD, scaleMark,
  smoothPath, textLines, textOrigin,
} from "./core.js";
import { wireDrop, fmtBytes, downloadLink, showError, showBusy, showDone, showWait, compactDrop, baseName } from "../../../src/lib/files";
import { pdfFacts, pdfMeta } from "../../../src/lib/pdfinfo";
import { usePdfWorker, pdfPreview, outputRow, pdfPageSizes, pdfDrawPage } from "../../../src/lib/pdfthumb";
import { stepTo } from "../../../src/lib/steps";
import { withUnlocked } from "../../../src/lib/pdfpassword";
import { setupSignature } from "./signature";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Mark = any;
type Layer = { page: number; el: HTMLElement; canvas: HTMLCanvasElement; svg: SVGSVGElement; gm: SVGGElement; gu: SVGGElement; W: number; H: number; drawnAt: number; busy: boolean };

const NS = "http://www.w3.org/2000/svg";
const FONT = '"Helvetica Neue", Helvetica, Arial, "Liberation Sans", sans-serif';
const FONT_URL = "/pdf/edit-sign/vendor/Roboto-Regular.woff";
const WAIT = "Your signed PDF will appear here.";

const HINTS: Record<string, [string, string]> = {
  select: ["Click a mark to select it. Drag it, or use the arrow keys, to move it. Press Delete to remove it.", ""],
  text: ["Click or tap on the page where the text should go, then type.", "Add text in the middle of the screen"],
  box: ["Drag on the page to draw a box. To type inside it, select it and choose Edit text.", "Add a box in the middle of the screen"],
  highlight: ["Drag over the part you want to highlight.", "Add a highlight in the middle of the screen"],
  draw: ["Draw with your mouse, finger or pen. On a phone, choose Select again when you want to scroll.", ""],
};

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function startEditor() {
  usePdfWorker();
  const root = $("pes-tool"), editor = $("pes-editor"), pages = $("pes-pages"), result = $("pes-result");
  const go = $<HTMLButtonElement>("pes-go"), live = $("pes-live");
  const signature = setupSignature();

  // ---- State ------------------------------------------------------------------------------------
  let file: File | null = null, bytes: ArrayBuffer | null = null;
  const history = createHistory([] as Mark[]);
  let marks: Mark[] = [];
  let selId: string | null = null;
  let mode = "select";
  let seq = 0;
  let dirty = false;
  const layers = new Map<number, Layer>();
  const gOf = new Map<string, SVGGElement>();
  const shown = new Map<string, Mark>();
  const urls = new Map<Uint8Array, string>();
  let drag: any = null;
  let editing: { m: Mark; isNew: boolean; ta: HTMLTextAreaElement; L: Layer } | null = null;
  let io: IntersectionObserver | null = null;

  const newId = () => `m${++seq}`;
  const announce = (text: string) => { live.textContent = ""; setTimeout(() => (live.textContent = text), 40); };

  // Text is measured with the browser's own font, in the same unit as the page's points.
  const mctx = document.createElement("canvas").getContext("2d")!;
  const measureFor = (size: number) => (s: string) => { mctx.font = `${size}px ${FONT}`; return mctx.measureText(s).width; };
  const boundsFor = (m: Mark) => boundsOf(m, measureFor(m.size));
  const find = (id: string | null) => marks.find((m) => m.id === id) as Mark | undefined;

  // ---- Controls (the controls are the one place the current choices live) -----------------------
  const radio = (name: string) => document.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`);
  const own = $<HTMLInputElement>("pes-color-own");
  let ownOn = false;
  const ink = () => (ownOn || !radio("pes-color") ? own.value : radio("pes-color")!.value);
  const marker = () => radio("pes-marker")?.value ?? "#ffdf3d";
  const sizeVal = () => clamp(Math.round(Number(($("pes-size") as HTMLInputElement).value) || 16), 6, 96);
  const bwVal = () => Number(($("pes-bw") as HTMLSelectElement).value);
  const pwVal = () => Number(($("pes-pw") as HTMLSelectElement).value);
  const fillOn = () => ($("pes-fill-on") as HTMLInputElement).checked;
  const fillColor = () => ($("pes-fill-color") as HTMLInputElement).value;
  const fillOp = () => Number(($("pes-fill-op") as HTMLSelectElement).value);

  function setInk(c: string) {
    const hit = [...document.querySelectorAll<HTMLInputElement>('input[name="pes-color"]')].find((r) => r.value.toLowerCase() === c.toLowerCase());
    if (hit) { hit.checked = true; ownOn = false; }
    else {
      document.querySelectorAll<HTMLInputElement>('input[name="pes-color"]').forEach((r) => (r.checked = false));
      own.value = c; ownOn = true;
      document.querySelector<HTMLElement>(".sw-own")!.style.background = c;
    }
  }
  function setMarker(c: string) {
    const hit = [...document.querySelectorAll<HTMLInputElement>('input[name="pes-marker"]')].find((r) => r.value.toLowerCase() === c.toLowerCase());
    if (hit) hit.checked = true;
  }

  /** Which kind of mark the option controls are about: the selected mark's, else the mode's. */
  function kind(): "text" | "rect" | "hl" | "pen" | null {
    const m = find(selId);
    if (m) return ({ text: "text", rect: "rect", highlight: "hl", path: "pen" } as any)[m.type] ?? null;
    return ({ text: "text", box: "rect", highlight: "hl", draw: "pen" } as any)[mode] ?? null;
  }
  function showOptions() {
    const k = kind();
    const on: Record<string, boolean> = {
      "pes-o-color": k === "text" || k === "rect" || k === "pen",
      "pes-o-marker": k === "hl",
      "pes-o-size": k === "text" || k === "rect",
      "pes-o-bw": k === "rect",
      "pes-o-fill": k === "rect",
      "pes-o-pw": k === "pen",
    };
    for (const [id, v] of Object.entries(on)) $(id).hidden = !v;
    $("pes-opts").hidden = !k;
    $("pes-o-color-l").textContent = k === "rect" ? "Border colour" : k === "text" ? "Text colour" : "Pen colour";
  }
  function controlsFrom(m: Mark) {
    if (m.type === "text") { setInk(m.color); ($("pes-size") as HTMLInputElement).value = String(Math.round(m.size)); }
    else if (m.type === "rect") {
      setInk(m.color);
      ($("pes-size") as HTMLInputElement).value = String(Math.round(m.size));
      ($("pes-bw") as HTMLSelectElement).value = String(m.strokeWidth);
      ($("pes-fill-on") as HTMLInputElement).checked = !!m.fill;
      if (m.fill) ($("pes-fill-color") as HTMLInputElement).value = m.fill;
      ($("pes-fill-op") as HTMLSelectElement).value = String(m.fillOpacity);
    } else if (m.type === "highlight") setMarker(m.color);
    else if (m.type === "path") { setInk(m.color); ($("pes-pw") as HTMLSelectElement).value = String(m.width); }
  }
  /** A changed control also changes the selected mark, when it has that setting. */
  function change(patch: (m: Mark) => Mark | null, key: string) {
    const m = find(selId);
    if (!m) return;
    const next = patch(m);
    if (next) commit(marks.map((x) => (x.id === m.id ? next : x)), `${key}:${m.id}`);
  }
  document.querySelectorAll('input[name="pes-color"]').forEach((r) => r.addEventListener("change", () => {
    ownOn = false;
    change((m) => (m.type === "text" || m.type === "rect" || m.type === "path" ? { ...m, color: ink() } : null), "ink");
  }));
  own.addEventListener("input", () => {
    setInk(own.value);
    change((m) => (m.type === "text" || m.type === "rect" || m.type === "path" ? { ...m, color: own.value } : null), "ink");
  });
  document.querySelectorAll('input[name="pes-marker"]').forEach((r) => r.addEventListener("change", () =>
    change((m) => (m.type === "highlight" ? { ...m, color: marker() } : null), "marker")));
  $("pes-size").addEventListener("input", () => change((m) => (m.type === "text" || m.type === "rect" ? { ...m, size: sizeVal() } : null), "size"));
  $("pes-bw").addEventListener("change", () => change((m) => (m.type === "rect" ? { ...m, strokeWidth: bwVal() } : null), "bw"));
  $("pes-pw").addEventListener("change", () => change((m) => (m.type === "path" ? { ...m, width: pwVal() } : null), "pw"));
  const fillChange = () => change((m) => (m.type === "rect" ? { ...m, fill: fillOn() ? fillColor() : null, fillOpacity: fillOp() } : null), "fill");
  $("pes-fill-on").addEventListener("change", fillChange);
  $("pes-fill-color").addEventListener("input", () => { ($("pes-fill-on") as HTMLInputElement).checked = true; fillChange(); });
  $("pes-fill-op").addEventListener("change", fillChange);

  // ---- Mark pictures (SVG) ----------------------------------------------------------------------
  function urlFor(m: Mark) {
    let u = urls.get(m.bytes);
    if (!u) { u = URL.createObjectURL(new Blob([m.bytes as BlobPart], { type: m.mime })); urls.set(m.bytes, u); }
    return u;
  }
  function svgEl(parent: Element, tag: string, attrs: Record<string, string | number>, text?: string) {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
    if (text !== undefined) e.textContent = text;
    parent.append(e);
    return e;
  }
  function paintText(g: Element, m: Mark, color: string) {
    const lines = textLines(m, measureFor(m.size));
    const [ox, oy] = textOrigin(m);
    lines.forEach((line, i) => {
      if (line) svgEl(g, "text", { x: ox, y: oy + m.size * BASELINE + i * m.size * LINE, "font-size": m.size, fill: color }, line);
    });
  }
  function paint(g: SVGGElement, m: Mark) {
    g.replaceChildren();
    g.dataset.type = m.type;
    g.setAttribute("aria-label", describeMark(m));
    if (m.type === "rect") {
      svgEl(g, "rect", {
        x: m.x, y: m.y, width: m.w, height: m.h, fill: m.fill ?? "transparent", "fill-opacity": m.fill ? m.fillOpacity : 1,
        stroke: m.strokeWidth > 0 ? m.color : "none", "stroke-width": m.strokeWidth,
      });
      paintText(g, m, m.textColor);
    } else if (m.type === "text") {
      const b = boundsFor(m);
      svgEl(g, "rect", { x: b.x - 2, y: b.y - 2, width: b.w + 4, height: b.h + 4, fill: "transparent" });
      paintText(g, m, m.color);
    } else if (m.type === "highlight") {
      svgEl(g, "rect", { x: m.x, y: m.y, width: m.w, height: m.h, fill: m.color, opacity: HIGHLIGHT_OPACITY, class: "pes-hl" });
    } else if (m.type === "path") {
      const d = smoothPath(m.points);
      svgEl(g, "path", { d, fill: "none", stroke: "transparent", "stroke-width": Math.max(m.width, 14), "stroke-linecap": "round", "stroke-linejoin": "round" });
      svgEl(g, "path", { d, fill: "none", stroke: m.color, "stroke-width": m.width, "stroke-linecap": "round", "stroke-linejoin": "round" });
    } else if (m.type === "image") {
      svgEl(g, "image", { href: urlFor(m), x: m.x, y: m.y, width: m.w, height: m.h, preserveAspectRatio: "none" });
    }
    g.setAttribute("aria-pressed", String(m.id === selId));
    shown.set(m.id, m);
  }
  function ensureG(m: Mark): SVGGElement | null {
    let g = gOf.get(m.id);
    const L = layers.get(m.page);
    if (!L) return null;
    if (!g) {
      g = document.createElementNS(NS, "g") as SVGGElement;
      g.setAttribute("class", "pes-mark");
      g.setAttribute("role", "button");
      g.setAttribute("tabindex", "0");
      g.dataset.id = m.id;
      L.gm.append(g);
      gOf.set(m.id, g);
    }
    return g;
  }
  /** Bring every picture in line with the marks, keeping elements (and their focus) where they are. */
  function syncLayers() {
    const ids = new Set(marks.map((m) => m.id));
    for (const [id, g] of gOf) if (!ids.has(id)) { g.remove(); gOf.delete(id); shown.delete(id); }
    const index = new Map<number, number>();
    for (const m of marks) {
      const g = ensureG(m);
      if (!g) continue;
      if (shown.get(m.id) !== m) paint(g, m);
      const L = layers.get(m.page)!;
      const i = index.get(m.page) ?? 0;
      index.set(m.page, i + 1);
      if (L.gm.children[i] !== g) L.gm.insertBefore(g, L.gm.children[i] ?? null);
    }
  }

  // ---- Selection --------------------------------------------------------------------------------
  function scaleOf(L: Layer) { return L.el.clientWidth / L.W || 1; }
  function drawSelection() {
    for (const L of layers.values()) L.gu.replaceChildren();
    for (const [id, g] of gOf) g.setAttribute("aria-pressed", String(id === selId));
    const m = find(selId);
    if (!m) return;
    const L = layers.get(m.page);
    if (!L) return;
    const b = boundsFor(m);
    const p = 3;
    svgEl(L.gu, "rect", { x: b.x - p, y: b.y - p, width: b.w + 2 * p, height: b.h + 2 * p, class: "pes-selbox" });
    const s = scaleOf(L);
    const cx = b.x + b.w + p, cy = b.y + b.h + p;
    svgEl(L.gu, "circle", { cx, cy, r: 22 / s, class: "pes-grab" });
    svgEl(L.gu, "circle", { cx, cy, r: 6 / s, class: "pes-handle" });
  }
  function select(id: string | null, focus = false) {
    finishEdit(true);
    selId = id;
    const m = find(id);
    if (m) controlsFrom(m);
    drawSelection();
    showOptions();
    updateUi();
    if (focus && id) {
      const g = gOf.get(id);
      g?.focus({ preventScroll: true });
      g?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    }
  }

  // ---- Changes, undo, redo ----------------------------------------------------------------------
  function afterChange() {
    syncLayers();
    if (selId && !find(selId)) selId = null;
    drawSelection();
    showOptions();
    updateUi();
    dirty = marks.length > 0;
    if (result.querySelector(".res-done, .res-bad")) { showWait(result, WAIT); stepTo(root, 2); }
  }
  function commit(next: Mark[], key: string | null = null) {
    history.push(next, key);
    marks = history.state;
    afterChange();
  }
  function undo() {
    finishEdit(true);
    if (!history.canUndo) return;
    marks = history.undo();
    afterChange();
    announce("Undone.");
  }
  function redo() {
    finishEdit(true);
    if (!history.canRedo) return;
    marks = history.redo();
    afterChange();
    announce("Redone.");
  }
  function remove(id: string, focus: "pages" | "none" = "pages") {
    const m = find(id);
    if (!m) return;
    commit(marks.filter((x) => x.id !== id));
    announce(`Deleted: ${describeMark(m)}.`);
    if (focus === "pages") pages.focus({ preventScroll: true });
  }
  function nudge(dx: number, dy: number, key: string) {
    const m = find(selId);
    if (!m) return;
    const L = layers.get(m.page)!;
    commit(marks.map((x) => (x.id === m.id ? clampMove(m, dx, dy, L) : x)), key);
  }
  function clampMove(m: Mark, dx: number, dy: number, L: Layer): Mark {
    const b = boundsFor(m);
    const nx = clamp(b.x + dx, 0, Math.max(0, L.W - b.w)), ny = clamp(b.y + dy, 0, Math.max(0, L.H - b.h));
    return moveMark(m, nx - b.x, ny - b.y);
  }
  function resize(factor: number, key: string) {
    const m = find(selId);
    if (m) commit(marks.map((x) => (x.id === m.id ? scaleMark(m, factor) : x)), key);
  }

  // ---- Buttons, list, hints ---------------------------------------------------------------------
  function updateUi() {
    ($("pes-undo") as HTMLButtonElement).disabled = !history.canUndo;
    ($("pes-redo") as HTMLButtonElement).disabled = !history.canRedo;
    ($("pes-delete") as HTMLButtonElement).disabled = !selId;
    go.disabled = !file;
    const m = find(selId);
    $("pes-selbar").hidden = !m;
    if (m) {
      $("pes-seltext").textContent = `Selected: ${describeMark(m)}. Move it with the arrow keys (Shift for bigger steps).`;
      $("pes-edit").hidden = m.type !== "text" && m.type !== "rect";
    }
    $("pes-list-sum").textContent = `Everything you added (${marks.length})`;
    $("pes-none").hidden = marks.length > 0;
    const ul = $("pes-marks");
    ul.replaceChildren(...marks.map((x) => {
      const li = document.createElement("li");
      if (x.id === selId) li.setAttribute("aria-current", "true");
      const pick = document.createElement("button");
      pick.type = "button"; pick.className = "btn quiet small pes-pick"; pick.dataset.id = x.id; pick.textContent = describeMark(x);
      const del = document.createElement("button");
      del.type = "button"; del.className = "btn quiet small pes-del"; del.dataset.id = x.id;
      del.setAttribute("aria-label", `Delete: ${describeMark(x)}`);
      del.innerHTML = '<svg class="ic" viewBox="0 0 256 256" fill="currentColor" focusable="false" aria-hidden="true"><path d="M216 48h-40v-8a24 24 0 0 0-24-24h-48a24 24 0 0 0-24 24v8H40a8 8 0 0 0 0 16h8v144a16 16 0 0 0 16 16h128a16 16 0 0 0 16-16V64h8a8 8 0 0 0 0-16ZM96 40a8 8 0 0 1 8-8h48a8 8 0 0 1 8 8v8H96Zm96 168H64V64h128Zm-80-104v64a8 8 0 0 1-16 0v-64a8 8 0 0 1 16 0Zm48 0v64a8 8 0 0 1-16 0v-64a8 8 0 0 1 16 0Z"/></svg>'; // safe-html: a fixed icon, no outside text
      li.append(pick, del);
      return li;
    }));
    const add = $<HTMLButtonElement>("pes-add");
    const label = HINTS[mode][1];
    add.hidden = !label;
    add.textContent = label;
  }
  $("pes-marks").addEventListener("click", (e) => {
    const t = e.target as Element;
    const del = t.closest<HTMLElement>(".pes-del"), pick = t.closest<HTMLElement>(".pes-pick");
    if (pick) {
      const m = find(pick.dataset.id!);
      if (m) { if (mode !== "select") setMode("select"); select(m.id, true); layers.get(m.page)?.el.scrollIntoView({ block: "center" }); }
    } else if (del) {
      const items = [...$("pes-marks").children];
      const at = items.indexOf(del.closest("li")!);
      remove(del.dataset.id!, "none");
      const rest = [...$("pes-marks").querySelectorAll<HTMLElement>(".pes-pick")];
      (rest[Math.min(at, rest.length - 1)] ?? $("pes-list-sum")).focus();
    }
  });

  function setMode(next: string) {
    finishEdit(true);
    mode = next;
    (document.getElementById(`pes-m-${next}`) as HTMLInputElement).checked = true;
    editor.dataset.mode = next;
    editor.classList.toggle("pes-draggy", next === "box" || next === "highlight" || next === "draw");
    if (next !== "select") { selId = null; drawSelection(); }
    $("pes-hint").textContent = HINTS[next][0];
    showOptions();
    updateUi();
  }
  document.querySelectorAll('input[name="pes-mode"]').forEach((r) => r.addEventListener("change", () => setMode((r as HTMLInputElement).value)));
  $("pes-undo").addEventListener("click", undo);
  $("pes-redo").addEventListener("click", redo);
  $("pes-delete").addEventListener("click", () => selId && remove(selId, "pages"));
  $("pes-edit").addEventListener("click", () => { const m = find(selId); if (m) startEdit(m, false); });
  $("pes-smaller").addEventListener("click", () => resize(0.9, "size-step"));
  $("pes-bigger").addEventListener("click", () => resize(1.1, "size-step"));
  $("pes-finish").addEventListener("click", () => { go.scrollIntoView({ block: "center" }); go.focus({ preventScroll: true }); });
  $("pes-change").addEventListener("click", () => $("pes-file").click());

  // ---- Text editing -----------------------------------------------------------------------------
  function placeEditor(ta: HTMLTextAreaElement, m: Mark, L: Layer) {
    const s = scaleOf(L);
    ta.style.left = `${m.x * s}px`;
    ta.style.top = `${m.y * s}px`;
    ta.style.fontSize = `${m.size * s}px`;
    ta.style.color = m.type === "rect" ? m.textColor : m.color;
    if (m.type === "rect") {
      ta.style.width = `${m.w * s}px`;
      ta.style.height = `${m.h * s}px`;
      ta.style.padding = `${PAD * s}px`;
    } else fit(ta, m, s);
  }
  function fit(ta: HTMLTextAreaElement, m: Mark, s: number) {
    const lines = ta.value.split("\n");
    const widest = Math.max(m.size * 0.5, ...lines.map(measureFor(m.size)));
    ta.style.width = `${Math.min(widest * s + 18, ta.parentElement!.clientWidth - m.x * s - 4)}px`;
    ta.style.height = `${lines.length * m.size * LINE * s + 4}px`;
  }
  function startEdit(m: Mark, isNew: boolean) {
    finishEdit(true);
    const L = layers.get(m.page);
    if (!L) return;
    const ta = document.createElement("textarea");
    ta.className = m.type === "rect" ? "pes-edit pes-wrap" : "pes-edit";
    ta.value = m.text ?? "";
    ta.setAttribute("aria-label", m.type === "rect" ? "Text inside the box" : "Text to add");
    ta.setAttribute("wrap", m.type === "rect" ? "soft" : "off");
    ta.rows = 1;
    L.el.append(ta);
    placeEditor(ta, m, L);
    editing = { m, isNew, ta, L };
    if (!isNew) gOf.get(m.id)?.classList.add("pes-editing");
    ta.addEventListener("input", () => { if (m.type === "text") fit(ta, m, scaleOf(L)); });
    ta.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Escape" || ((e.ctrlKey || e.metaKey) && e.key === "Enter")) { e.preventDefault(); finishEdit(true, true); }
    });
    ta.addEventListener("blur", () => finishEdit(true));
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
  }
  function finishEdit(commitIt: boolean, refocus = false) {
    if (!editing) return;
    const { m, isNew, ta } = editing;
    editing = null;
    const text = ta.value;
    gOf.get(m.id)?.classList.remove("pes-editing");
    ta.remove();
    if (!commitIt) return;
    if (isNew) {
      if (!text.trim()) return;
      const mark = { ...m, text };
      commit([...marks, mark]);
      announce("Text added. Use the arrow keys to move it.");
      setMode("select");
      select(mark.id, refocus);
    } else if (text !== (m.text ?? "")) {
      if (m.type === "text" && !text.trim()) { remove(m.id, "none"); return; }
      commit(marks.map((x) => (x.id === m.id ? { ...x, text } : x)), `text:${m.id}`);
      if (refocus) gOf.get(m.id)?.focus({ preventScroll: true });
    } else if (refocus) gOf.get(m.id)?.focus({ preventScroll: true });
  }

  // ---- Pointer: place, draw, move, resize -------------------------------------------------------
  function toPt(e: PointerEvent | MouseEvent, L: Layer): [number, number] {
    const r = L.svg.getBoundingClientRect();
    return [clamp(((e.clientX - r.left) * L.W) / r.width, 0, L.W), clamp(((e.clientY - r.top) * L.H) / r.height, 0, L.H)];
  }
  const ghostOf = (L: Layer) => (L.gu.querySelector(".pes-ghost") as SVGElement | null) ?? svgEl(L.gu, "rect", { class: "pes-ghost", x: 0, y: 0, width: 0, height: 0 });

  function onDown(L: Layer, e: PointerEvent) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    finishEdit(true);
    const t = e.target as Element;
    const pt = toPt(e, L);
    if (mode === "select") {
      const m = find(selId);
      if (t.closest(".pes-grab") && m) {
        drag = { kind: "resize", L, orig: m, cur: m, start: pt, b: boundsFor(m) };
      } else {
        const g = t.closest<SVGGElement>(".pes-mark");
        if (!g) { select(null); return; }
        select(g.dataset.id!);
        drag = { kind: "move", L, orig: find(g.dataset.id!), cur: find(g.dataset.id!), start: pt, moved: false };
      }
    } else if (mode === "box" || mode === "highlight") {
      e.preventDefault();
      drag = { kind: "rect", L, start: pt, cur: pt };
    } else if (mode === "draw") {
      e.preventDefault();
      drag = { kind: "pen", L, points: [pt] };
      const id = newId();
      drag.mark = { id, type: "path", page: L.page, points: [pt], color: ink(), width: pwVal() };
      const g = ensureG(drag.mark);
      if (g) { paint(g, drag.mark); g.classList.add("pes-live"); }
    } else return;
    try { L.svg.setPointerCapture(e.pointerId); } catch { /* a pointer that has already gone: the drag still works inside the page */ }
  }
  function onMove(L: Layer, e: PointerEvent) {
    if (!drag || drag.L !== L) return;
    const pt = toPt(e, L);
    const s = scaleOf(L);
    if (drag.kind === "move") {
      const dx = pt[0] - drag.start[0], dy = pt[1] - drag.start[1];
      if (!drag.moved && Math.hypot(dx, dy) * s < 4) return;
      drag.moved = true;
      drag.cur = clampMove(drag.orig, dx, dy, L);
    } else if (drag.kind === "resize") {
      const o = drag.orig, b = drag.b;
      if (o.type === "rect" || o.type === "highlight" || o.type === "image") {
        const w = Math.max(6, pt[0] - o.x);
        drag.cur = o.type === "image" ? { ...o, w, h: (w * o.h) / o.w } : { ...o, w, h: Math.max(6, pt[1] - o.y) };
      } else drag.cur = scaleMark(o, Math.max(0.1, (pt[0] - b.x) / Math.max(1, b.w)));
    } else if (drag.kind === "rect") {
      drag.cur = pt;
      const x = Math.min(drag.start[0], pt[0]), y = Math.min(drag.start[1], pt[1]);
      const ghost = ghostOf(L);
      ghost.setAttribute("x", String(x)); ghost.setAttribute("y", String(y));
      ghost.setAttribute("width", String(Math.abs(pt[0] - drag.start[0]))); ghost.setAttribute("height", String(Math.abs(pt[1] - drag.start[1])));
    } else if (drag.kind === "pen") {
      for (const p of e.getCoalescedEvents?.() ?? [e]) {
        const q = toPt(p, L);
        const last = drag.points[drag.points.length - 1];
        if (Math.hypot(q[0] - last[0], q[1] - last[1]) * s >= 1.5) drag.points.push(q);
      }
      drag.mark = { ...drag.mark, points: drag.points.slice() };
      const g = gOf.get(drag.mark.id);
      if (g) paint(g, drag.mark);
    }
    if (drag.kind === "move" || drag.kind === "resize") {
      const g = gOf.get(drag.cur.id);
      if (g) paint(g, drag.cur);
      drawSelectionFor(drag.cur);
    }
  }
  function drawSelectionFor(m: Mark) {
    const keep = marks;
    marks = marks.map((x) => (x.id === m.id ? m : x));
    drawSelection();
    marks = keep;
  }
  function onUp(L: Layer, e: PointerEvent) {
    const d = drag;
    if (!d || d.L !== L) return;
    drag = null;
    if (L.svg.hasPointerCapture(e.pointerId)) L.svg.releasePointerCapture(e.pointerId);
    if (d.kind === "move" || d.kind === "resize") {
      if (d.moved === false) return;
      if (d.cur !== d.orig) commit(marks.map((x) => (x.id === d.cur.id ? d.cur : x)));
    } else if (d.kind === "rect") {
      L.gu.querySelector(".pes-ghost")?.remove();
      let [x0, y0] = d.start;
      let w = Math.abs(d.cur[0] - x0), h = Math.abs(d.cur[1] - y0);
      x0 = Math.min(x0, d.cur[0]); y0 = Math.min(y0, d.cur[1]);
      if (w * scaleOf(L) < 6 || h * scaleOf(L) < 6) { // a click, not a drag: a box of a usual size
        if (mode === "box") { w = 150; h = 56; } else { w = 140; h = 15; y0 -= 7; }
        x0 = clamp(x0, 0, Math.max(0, L.W - w)); y0 = clamp(y0, 0, Math.max(0, L.H - h));
      }
      addRect(L, x0, y0, w, h);
    } else if (d.kind === "pen") {
      const g = gOf.get(d.mark.id);
      g?.classList.remove("pes-live");
      gOf.delete(d.mark.id); shown.delete(d.mark.id);
      g?.remove();
      commit([...marks, { ...d.mark, points: d.points }]);
      announce("Drawing added.");
    }
  }
  function onCancel(L: Layer) {
    const d = drag;
    if (!d) return;
    drag = null;
    L.gu.querySelector(".pes-ghost")?.remove();
    if (d.kind === "pen") { gOf.get(d.mark.id)?.remove(); gOf.delete(d.mark.id); shown.delete(d.mark.id); }
    syncLayers();
    drawSelection();
  }

  function addRect(L: Layer, x: number, y: number, w: number, h: number) {
    const id = newId();
    const mark = mode === "box" || mode === "select"
      ? {
          id, type: "rect", page: L.page, x, y, w, h, color: ink(), strokeWidth: bwVal(), fill: fillOn() ? fillColor() : null, fillOpacity: fillOp(),
          text: "", size: sizeVal(), textColor: "#000000",
        }
      : { id, type: "highlight", page: L.page, x, y, w, h, color: marker() };
    commit([...marks, mark]);
    announce(mark.type === "rect" ? "Box added. Use the arrow keys to move it." : "Highlight added.");
    if (mark.type === "rect") { setMode("select"); select(id, false); gOf.get(id)?.focus({ preventScroll: true }); }
  }

  function onClick(L: Layer, e: MouseEvent) {
    if (mode !== "text" || editing) return;
    const [x, y] = toPt(e, L);
    const size = sizeVal();
    startEdit({ id: newId(), type: "text", page: L.page, x: Math.min(x, L.W - 20), y: Math.max(0, y - size * 0.6), text: "", size, color: ink() }, true);
  }
  function onDouble(L: Layer, e: MouseEvent) {
    if (mode !== "select") return;
    const g = (e.target as Element).closest<SVGGElement>(".pes-mark");
    const m = g && find(g.dataset.id!);
    if (m && (m.type === "text" || m.type === "rect")) startEdit(m, false);
  }

  // Touch: while a mark is dragged, the page must not scroll.
  pages.addEventListener("touchmove", (e) => { if (drag) e.preventDefault(); }, { passive: false });

  // ---- Add in the middle of the screen (the keyboard way) ---------------------------------------
  function visibleCenter(): { L: Layer; x: number; y: number } | null {
    let best: { L: Layer; top: number; bottom: number; vis: number } | null = null;
    for (const L of layers.values()) {
      const r = L.el.getBoundingClientRect();
      const top = Math.max(r.top, 120), bottom = Math.min(r.bottom, window.innerHeight);
      const vis = bottom - top;
      if (!best || vis > best.vis) best = { L, top, bottom, vis };
    }
    if (!best) return null;
    const r = best.L.el.getBoundingClientRect();
    const mid = best.vis > 0 ? (best.top + best.bottom) / 2 : r.top + 80;
    return { L: best.L, x: best.L.W / 2, y: clamp(((mid - r.top) * best.L.H) / r.height, 0, best.L.H) };
  }
  $("pes-add").addEventListener("click", () => {
    const c = visibleCenter();
    if (!c) return;
    if (mode === "text") {
      const size = sizeVal();
      startEdit({ id: newId(), type: "text", page: c.L.page, x: Math.max(0, c.x - 60), y: Math.max(0, c.y - size / 2), text: "", size, color: ink() }, true);
    } else if (mode === "box") addRect(c.L, c.x - 75, Math.max(0, c.y - 28), 150, 56);
    else if (mode === "highlight") {
      const before = marks.length;
      addRect(c.L, c.x - 70, Math.max(0, c.y - 7), 140, 15);
      if (marks.length > before) select(marks[marks.length - 1].id, true);
    }
  });

  // ---- Signature --------------------------------------------------------------------------------
  $("pes-sig-open").addEventListener("click", async () => {
    finishEdit(true);
    if (!file) { $("pes-drop").focus(); announce("Choose a PDF first."); return; }
    const sig = await signature.open();
    if (!sig) return;
    const c = visibleCenter();
    if (!c) return;
    const w = Math.min(180, c.L.W * 0.45), h = (w * sig.height) / sig.width;
    const mark = {
      id: newId(), type: "image", page: c.L.page, x: clamp(c.x - w / 2, 0, Math.max(0, c.L.W - w)), y: clamp(c.y - h / 2, 0, Math.max(0, c.L.H - h)),
      w, h, bytes: sig.bytes, mime: "image/png", label: "Signature",
    };
    setMode("select");
    commit([...marks, mark]);
    select(mark.id, true);
    announce("Signature added. Drag it, or use the arrow keys, to move it. Use Bigger and Smaller to change its size.");
  });

  // ---- Keyboard ---------------------------------------------------------------------------------
  document.addEventListener("keydown", (e) => {
    if (!file || $<HTMLDialogElement>("pes-sig").open) return;
    const t = e.target as HTMLElement;
    const inField = t.matches?.("textarea, select, input:not([type=checkbox]):not([type=radio]):not([type=color])");
    const inTool = root.contains(t) || t === document.body;
    if (!inTool || inField) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key;
    if (mod && !e.altKey && k.toLowerCase() === "z") { e.preventDefault(); (e.shiftKey ? redo : undo)(); return; }
    if (mod && !e.altKey && k.toLowerCase() === "y") { e.preventDefault(); redo(); return; }
    if (mod) return;
    const onMarks = !!t.closest?.(".pes-pages, .pes-selbar") || t === document.body;
    if (!onMarks) return;
    const m = find(selId);
    if (!m) return;
    const step = e.shiftKey ? 10 : 2;
    if (k === "Delete" || k === "Backspace") { e.preventDefault(); remove(m.id); }
    else if (k.startsWith("Arrow")) {
      e.preventDefault();
      nudge(k === "ArrowLeft" ? -step : k === "ArrowRight" ? step : 0, k === "ArrowUp" ? -step : k === "ArrowDown" ? step : 0, `nudge:${m.id}`);
    } else if ((k === "Enter" || k === "F2") && (m.type === "text" || m.type === "rect") && t.closest?.(".pes-mark")) { e.preventDefault(); startEdit(m, false); }
    else if (k === "+" || k === "=") { e.preventDefault(); resize(1.1, "size-step"); }
    else if (k === "-") { e.preventDefault(); resize(0.9, "size-step"); }
    else if (k === "Escape") { select(null); }
  });
  // Tabbing to a mark selects it, so Delete and the arrow keys work on it at once.
  pages.addEventListener("focusin", (e) => {
    const g = (e.target as Element).closest<SVGGElement>(".pes-mark");
    if (g && g.dataset.id !== selId && !drag) select(g.dataset.id!);
  });

  // ---- Pages ------------------------------------------------------------------------------------
  const queue: Layer[] = [];
  let running = 0;
  function pump() {
    while (running < 2 && queue.length && file) {
      const L = queue.shift()!;
      if (L.busy) continue;
      const w = L.el.clientWidth;
      if (!w || (L.drawnAt && Math.abs(w - L.drawnAt) / L.drawnAt < 0.25)) continue;
      L.busy = true; running++;
      pdfDrawPage(file, L.page, L.canvas, w).then((ok) => { if (ok) L.drawnAt = w; }).finally(() => { L.busy = false; running--; pump(); });
    }
  }
  function buildPages(sizes: { width: number; height: number }[]) {
    io?.disconnect();
    layers.clear(); gOf.clear(); shown.clear();
    for (const u of urls.values()) URL.revokeObjectURL(u);
    urls.clear();
    pages.replaceChildren();
    io = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver((entries) => {
      for (const en of entries) {
        const L = layers.get(Number((en.target as HTMLElement).dataset.page))!;
        if (en.isIntersecting) { queue.push(L); pump(); }
        else if (L.drawnAt && !L.busy) { L.canvas.width = 1; L.canvas.height = 1; L.drawnAt = 0; } // let go of pictures far from the screen
      }
    }, { rootMargin: "1400px 0px" });
    sizes.forEach((sz, i) => {
      const n = i + 1;
      const wrap = document.createElement("div");
      wrap.className = "pes-pg";
      const cap = document.createElement("p");
      cap.className = "pes-cap";
      cap.textContent = `Page ${n} of ${sizes.length}`;
      const el = document.createElement("div");
      el.className = "pes-page";
      el.dataset.page = String(n);
      el.style.aspectRatio = `${sz.width} / ${sz.height}`;
      const canvas = document.createElement("canvas");
      canvas.className = "pes-canvas";
      canvas.setAttribute("aria-hidden", "true");
      const svg = document.createElementNS(NS, "svg") as SVGSVGElement;
      svg.setAttribute("class", "pes-layer");
      svg.setAttribute("viewBox", `0 0 ${sz.width} ${sz.height}`);
      svg.setAttribute("preserveAspectRatio", "none");
      svg.setAttribute("role", "group");
      svg.setAttribute("aria-label", `Page ${n}: marks you added`);
      const gm = document.createElementNS(NS, "g") as SVGGElement, gu = document.createElementNS(NS, "g") as SVGGElement;
      svg.append(gm, gu);
      el.append(canvas, svg);
      wrap.append(cap, el);
      pages.append(wrap);
      const L: Layer = { page: n, el, canvas, svg, gm, gu, W: sz.width, H: sz.height, drawnAt: 0, busy: false };
      layers.set(n, L);
      svg.addEventListener("pointerdown", (e) => onDown(L, e));
      svg.addEventListener("pointermove", (e) => onMove(L, e));
      svg.addEventListener("pointerup", (e) => onUp(L, e));
      svg.addEventListener("pointercancel", () => onCancel(L));
      svg.addEventListener("click", (e) => onClick(L, e));
      svg.addEventListener("dblclick", (e) => onDouble(L, e));
      if (io) io.observe(el); else if (n <= 3) { queue.push(L); pump(); }
    });
  }
  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      for (const L of layers.values()) { const r = L.el.getBoundingClientRect(); if (L.drawnAt && r.bottom > -1400 && r.top < window.innerHeight + 1400) queue.push(L); }
      pump();
      drawSelection();
    }, 250);
  });

  // ---- Choosing a file --------------------------------------------------------------------------
  wireDrop("pes", async (files) => {
    const picked0 = files.find((x) => /\.pdf$/i.test(x.name) || x.type === "application/pdf");
    if (!picked0) return;
    await withUnlocked(picked0, $("pes-drop"), use);
  });

  async function use(f: File) {
    showWait(result, WAIT);
    try {
      const buf = await f.arrayBuffer();
      const sizes = await pdfPageSizes(f);
      if (!sizes.length) throw new Error("This PDF has no pages.");
      bytes = buf;
      file = f;
      history.reset([]);
      marks = [];
      selId = null;
      dirty = false;
      $("pes-name").textContent = f.name;
      $("pes-meta").textContent = pdfMeta(await pdfFacts(f), f.size);
      $("pes-picked").hidden = false;
      pdfPreview($("pes-thumb"), f, f.name, sizes.length);
      compactDrop("pes", true);
      buildPages(sizes);
      setMode("select");
      afterChange();
      stepTo(root, 2);
      pages.scrollIntoView({ block: "start" });
      keepForOffline();
    } catch (e) {
      const text = (e as Error).message;
      showError(result, /no pages/.test(text) ? text : "This file couldn't be opened as a PDF. It may be damaged.");
    }
  }

  // The pdf.js worker is fetched now that a PDF is open. Fetch the font and the font code too, once
  // the page is idle, so the service worker keeps them and the tool works offline after being used.
  let kept = false;
  function keepForOffline() {
    if (kept || navigator.onLine === false) return;
    kept = true;
    const go = () => { fetch(FONT_URL).catch(() => {}); import("@pdf-lib/fontkit").catch(() => {}); };
    if ("requestIdleCallback" in window) window.requestIdleCallback(go, { timeout: 4000 }); else setTimeout(go, 2000);
  }

  // ---- Save -------------------------------------------------------------------------------------
  async function save() {
    finishEdit(true);
    if (!file || !bytes) return;
    if (!marks.length) {
      showError(result, "Add some text, a box, a highlight, a drawing or your signature to the pages first.", "Nothing to save yet");
      return;
    }
    go.disabled = true;
    stepTo(root, 3);
    await showBusy(result);
    try {
      const opts: { fontkit?: unknown; unicodeFont?: Uint8Array } = {};
      if (marks.some((m) => (m.type === "text" || m.type === "rect") && !isLatinText(m.text ?? ""))) {
        const [kit, res] = await Promise.all([import("@pdf-lib/fontkit"), fetch(FONT_URL)]);
        if (!res.ok) throw new Error("The font for this text could not be loaded. Reload the page and try again.");
        opts.fontkit = (kit as any).default ?? kit;
        opts.unicodeFont = new Uint8Array(await res.arrayBuffer());
      }
      const out = await applyMarks(bytes.slice(0), marks, opts);
      const name = `${baseName(file.name)}-signed.pdf`;
      const dl = downloadLink(out, name, "application/pdf", "Download PDF");
      dl.classList.add("run");
      showDone(result, "Done. Your marks are saved into the PDF.", `${name} · ${fmtBytes(out.byteLength)}`);
      result.append(outputRow(out, dl));
      stepTo(root, 4);
      dirty = false;
    } catch (e) {
      showError(result, (e as Error).message);
    }
    go.disabled = !file;
  }
  go.addEventListener("click", save);

  window.addEventListener("beforeunload", (e) => { if (dirty) { e.preventDefault(); } });
  setMode("select");
}
