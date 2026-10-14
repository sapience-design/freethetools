// Editing a PDF inside the full-screen viewer: one session per time Edit is pressed. It keeps the
// marks (text, boxes, highlights, drawings, a signature picture), takes clicks, drags, keys and
// touches, and saves. The marks and the saving live in core.js. Nothing is uploaded.
//
// How it is built: the viewer draws each page as a canvas inside a cell. The session lays one <svg>
// over each cell. The svg's viewBox is the page in points, so a mark's numbers are the same on
// screen, at any zoom, and in the saved file. Every mark is a focusable <g>; the selected one gets a
// dashed box and a resize handle. The viewer calls mount() for each cell it builds, key() for key
// presses, and relayout() after a zoom or a resize.
import {
  applyMarks, boundsOf, BASELINE, createHistory, describeMark, HIGHLIGHT_OPACITY, isLatinText, LINE, MARK_WORDS, moveMark, PAD, scaleMark,
  smoothPath, textLines, textOrigin,
} from "./core.js";
import { T } from "./words";
import { baseName } from "../files";
import { pdfPageSizes, pdfViewItem } from "../pdfthumb";
import type { ViewItem } from "../expand";
import { buildBar, INKS, MARKERS, type Bar } from "./bar";
import { el } from "./dom";
import { setupSignature } from "./signature";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Mark = any;
type Layer = { page: number; el: HTMLElement; svg: SVGSVGElement; gm: SVGGElement; gu: SVGGElement; W: number; H: number };

/** What the viewer gives the session. */
export interface EditHost {
  dlg: HTMLDialogElement;
  stage: HTMLElement;
  /** The empty toolbar container the session fills. */
  bar: HTMLElement;
  file: Blob;
  name: string;
  /** The finished copy: the viewer downloads it or hands it on, and shows it from now on. */
  saved(blob: Blob, name: string): void | Promise<void>;
  /** Close the viewer (after the person chose what to do with unsaved marks). */
  close(): void;
  /** Say something to screen readers. */
  live(text: string): void;
}

export interface Session {
  /** Each page's size in points, as a person sees it. */
  sizes: { width: number; height: number }[];
  /** Lay the editing layer of `page` over its cell. Called every time the viewer builds its cells. */
  mount(page: number, cell: HTMLElement): void;
  /** A key press inside the viewer. True when the session used it. */
  key(e: KeyboardEvent): boolean;
  /** The zoom or the window size changed: redraw what depends on screen pixels. */
  relayout(): void;
  /** A viewer item for a saved copy. Here, so the viewer itself does not have to load the PDF drawing code. */
  item(blob: Blob, name: string, pages: number, page: number, onSave?: (blob: Blob, name: string) => void): ViewItem;
  /** Run `proceed` now, or after the person has chosen Save or Discard when marks are unsaved. */
  guard(proceed: () => void): void;
  readonly dirty: boolean;
  destroy(): void;
}

const NS = "http://www.w3.org/2000/svg";
const FONT = '"Helvetica Neue", Helvetica, Arial, "Liberation Sans", sans-serif';
export const FONT_URL = "/pdf/edit/vendor/Roboto-Regular.woff";

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export async function startSession(host: EditHost): Promise<Session> {
  const sizes = await pdfPageSizes(host.file);
  if (!sizes.length) throw new Error("no pages");
  let bytes: ArrayBuffer = await host.file.arrayBuffer();
  let name = host.name;

  const ui: Bar = buildBar();
  host.bar.replaceChildren(ui.root);
  host.bar.hidden = false;
  const { dlg, stage } = host;
  const signature = setupSignature();

  // ---- State ------------------------------------------------------------------------------------
  const history = createHistory([] as Mark[]);
  let marks: Mark[] = [];
  let selId: string | null = null;
  let mode = "select";
  let seq = 0;
  let dirty = false;
  let saving = false;
  let gone = false;
  const layers = new Map<number, Layer>();
  const gOf = new Map<string, SVGGElement>();
  const shown = new Map<string, Mark>();
  const urls = new Map<Uint8Array, string>();
  let drag: any = null;
  let editing: { m: Mark; isNew: boolean; ta: HTMLTextAreaElement; L: Layer } | null = null;

  const newId = () => `m${++seq}`;
  const announce = (text: string) => host.live(text);
  const words = () => ({
    page: T("wPage", MARK_WORDS.page), text: T("wText", MARK_WORDS.text), box: T("wBox", MARK_WORDS.box), boxText: T("wBoxText", MARK_WORDS.boxText),
    highlight: T("wHighlight", MARK_WORDS.highlight), drawing: T("wDrawing", MARK_WORDS.drawing), picture: T("wPicture", MARK_WORDS.picture), mark: T("wMark", MARK_WORDS.mark),
  });
  const describe = (m: Mark) => describeMark(m, words());

  // Text is measured with the browser's own font, in the same unit as the page's points.
  const mctx = document.createElement("canvas").getContext("2d")!;
  const measureFor = (size: number) => (s: string) => { mctx.font = `${size}px ${FONT}`; return mctx.measureText(s).width; };
  const boundsFor = (m: Mark) => boundsOf(m, measureFor(m.size));
  const find = (id: string | null) => marks.find((m) => m.id === id) as Mark | undefined;

  // ---- Controls (the controls are the one place the current choices live) -----------------------
  let ownOn = false;
  const own = ui.color.own!, ownDot = ui.color.ownDot!;
  const ink = () => (ownOn || !ui.color.value ? own.value : ui.color.value);
  const marker = () => ui.marker.value || "#ffdf3d";
  // A selected mark may have been resized to a size between the steps; new marks take the step.
  const sizeVal = () => clamp(Math.round(Number(ui.size.value) || 16), 6, 96);
  const bwVal = () => Number(ui.bw.value || 2);
  const pwVal = () => Number(ui.pw.value || 3);
  const fillOn = () => !!ui.fill.value && ui.fill.value !== "none";
  const fillColor = () => ui.fill.value;
  const fillOp = () => Number(ui.fillOp.value || 1);

  /** The "other colour" dot shows the picked colour and the selection ring while it is in use. */
  function markOwn(on: boolean, c?: string) {
    ownOn = on;
    ownDot.parentElement!.classList.toggle("on", on);
    if (c) ownDot.style.setProperty("--c", c);
  }
  function setInk(c: string) {
    const hit = INKS.find(([h]) => h.toLowerCase() === c.toLowerCase());
    if (hit) { ui.color.value = hit[0]; markOwn(false); }
    else { ui.color.value = ""; own.value = c; markOwn(true, c); }
  }
  function setMarker(c: string) {
    ui.marker.value = MARKERS.find(([h]) => h.toLowerCase() === c.toLowerCase())?.[0] ?? "";
  }

  /** Which kind of mark the option controls are about: the selected mark's, else the mode's. */
  function kind(): "text" | "rect" | "hl" | "pen" | null {
    const m = find(selId);
    if (m) return ({ text: "text", rect: "rect", highlight: "hl", path: "pen" } as any)[m.type] ?? null;
    return ({ text: "text", box: "rect", highlight: "hl", draw: "pen" } as any)[mode] ?? null;
  }
  function showOptions() {
    const k = kind();
    ui.color.el.hidden = !(k === "text" || k === "rect" || k === "pen");
    ui.marker.el.hidden = k !== "hl";
    ui.size.el.hidden = !(k === "text" || k === "rect");
    ui.bw.el.hidden = k !== "rect";
    ui.fill.el.hidden = k !== "rect";
    ui.fillOp.el.hidden = k !== "rect" || !fillOn();
    ui.pw.el.hidden = k !== "pen";
    ui.color.el.querySelector("legend")!.textContent = k === "rect" ? T("edBorderColor", "Border colour") : k === "text" ? T("edTextColor", "Text colour") : T("edPenColor", "Pen colour");
    showContext();
  }
  /** The style row is always there; with nothing to style it says what to do. */
  function showContext() {
    ui.empty.hidden = !(ui.groups.every((g) => g.hidden) && ui.selacts.hidden && ui.add.hidden);
  }
  function controlsFrom(m: Mark) {
    if (m.type === "text") { setInk(m.color); ui.size.value = String(Math.round(m.size)); }
    else if (m.type === "rect") {
      setInk(m.color);
      ui.size.value = String(Math.round(m.size));
      ui.bw.value = String(m.strokeWidth);
      ui.fill.value = m.fill ?? "none";
      ui.fillOp.value = String(m.fillOpacity);
    } else if (m.type === "highlight") setMarker(m.color);
    else if (m.type === "path") { setInk(m.color); ui.pw.value = String(m.width); }
  }
  /** A changed control also changes the selected mark, when it has that setting. */
  function change(patch: (m: Mark) => Mark | null, key: string) {
    const m = find(selId);
    if (!m) return;
    const next = patch(m);
    if (next) commit(marks.map((x) => (x.id === m.id ? next : x)), `${key}:${m.id}`);
  }
  ui.color.on(() => {
    markOwn(false);
    change((m) => (m.type === "text" || m.type === "rect" || m.type === "path" ? { ...m, color: ink() } : null), "ink");
  });
  own.addEventListener("input", () => {
    setInk(own.value);
    change((m) => (m.type === "text" || m.type === "rect" || m.type === "path" ? { ...m, color: own.value } : null), "ink");
  });
  ui.marker.on(() => change((m) => (m.type === "highlight" ? { ...m, color: marker() } : null), "marker"));
  ui.size.on(() => change((m) => (m.type === "text" || m.type === "rect" ? { ...m, size: sizeVal() } : null), "size"));
  ui.bw.on(() => change((m) => (m.type === "rect" ? { ...m, strokeWidth: bwVal() } : null), "bw"));
  ui.pw.on(() => change((m) => (m.type === "path" ? { ...m, width: pwVal() } : null), "pw"));
  const fillChange = () => {
    ui.fillOp.el.hidden = kind() !== "rect" || !fillOn();
    change((m) => (m.type === "rect" ? { ...m, fill: fillOn() ? fillColor() : null, fillOpacity: fillOp() } : null), "fill");
  };
  ui.fill.on(fillChange);
  ui.fillOp.on(fillChange);

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
    g.setAttribute("aria-label", describe(m));
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
      svgEl(g, "rect", { x: m.x, y: m.y, width: m.w, height: m.h, fill: m.color, opacity: HIGHLIGHT_OPACITY, class: "fv-hl" });
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
      g.setAttribute("class", "fv-mark");
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
  const scaleOf = (L: Layer) => L.el.clientWidth / L.W || 1;
  function drawSelection() {
    for (const L of layers.values()) L.gu.replaceChildren();
    for (const [id, g] of gOf) g.setAttribute("aria-pressed", String(id === selId));
    const m = find(selId);
    if (!m) return;
    const L = layers.get(m.page);
    if (!L) return;
    const b = boundsFor(m);
    const p = 3;
    svgEl(L.gu, "rect", { x: b.x - p, y: b.y - p, width: b.w + 2 * p, height: b.h + 2 * p, class: "fv-selbox" });
    const s = scaleOf(L);
    const cx = b.x + b.w + p, cy = b.y + b.h + p;
    svgEl(L.gu, "circle", { cx, cy, r: 22 / s, class: "fv-grab" });
    svgEl(L.gu, "circle", { cx, cy, r: 6 / s, class: "fv-handle" });
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
    ui.status.textContent = "";
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
    announce(T("edUndone", "Undone."));
  }
  function redo() {
    finishEdit(true);
    if (!history.canRedo) return;
    marks = history.redo();
    afterChange();
    announce(T("edRedone", "Redone."));
  }
  function remove(id: string, focus: "stage" | "none" = "stage") {
    const m = find(id);
    if (!m) return;
    commit(marks.filter((x) => x.id !== id));
    announce(T("edDeleted", "Deleted: {what}.", { what: describe(m) }));
    if (focus === "stage") stage.focus({ preventScroll: true });
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

  // ---- Buttons and hints ------------------------------------------------------------------------
  const HINT: Record<string, [string, string, string, string]> = {
    select: ["hintSelect", "Click a mark to select it. Drag it, or use the arrow keys, to move it. Press Delete to remove it.", "", ""],
    text: ["hintText", "Click or tap on the page where the text should go, then type.", "addText", "Add text in the middle of the screen"],
    box: ["hintBox", "Drag on the page to draw a box. To type inside it, select it and choose Edit text.", "addBox", "Add a box in the middle of the screen"],
    highlight: ["hintHighlight", "Drag over the part you want to highlight.", "addHighlight", "Add a highlight in the middle of the screen"],
    draw: ["hintDraw", "Draw with your mouse, finger or pen. On a phone, choose Select again when you want to scroll.", "", ""],
  };
  function updateUi() {
    ui.undo.disabled = !history.canUndo;
    ui.redo.disabled = !history.canRedo;
    ui.del.disabled = !selId;
    ui.save.disabled = saving;
    const m = find(selId);
    ui.selacts.hidden = !m;
    ui.selLabel.hidden = !m;
    if (m) {
      // Short on screen; the whole sentence, with how to move it, for screen readers.
      ui.selLabel.textContent = T("edSelectedShort", "Selected: {what}", { what: describe(m) });
      ui.selLabel.append(el("span", "sr-only", ` ${T("edMoveHow", "Move it with the arrow keys (Shift for bigger steps).")}`));
      ui.editText.hidden = m.type !== "text" && m.type !== "rect";
    }
    const [, , addKey, addEn] = HINT[mode];
    ui.add.hidden = !addKey;
    if (addKey) ui.add.textContent = T(addKey, addEn);
    showContext();
    dlg.dataset.marks = String(marks.length);
  }

  // How to use the tool in hand shows for a few seconds over the page, then gets out of the way.
  let hintTimer = 0;
  function showHint(text: string) {
    ui.hint.textContent = text;
    ui.hint.classList.add("show");
    clearTimeout(hintTimer);
    hintTimer = window.setTimeout(() => {
      ui.hint.classList.remove("show");
      hintTimer = window.setTimeout(() => (ui.hint.textContent = ""), 300);
    }, 4500);
  }

  function setMode(next: string, hint = true) {
    finishEdit(true);
    mode = next;
    const input = ui.root.querySelector<HTMLInputElement>(`#fv-ed-m-${next}`);
    if (input) input.checked = true;
    dlg.dataset.edmode = next;
    dlg.classList.toggle("fv-draggy", next === "box" || next === "highlight" || next === "draw");
    if (next !== "select") { selId = null; drawSelection(); }
    const [hk, he] = HINT[next];
    if (hint) showHint(T(hk, he));
    showOptions();
    updateUi();
  }
  ui.root.querySelectorAll('input[name="fv-ed-mode"]').forEach((r) => r.addEventListener("change", () => setMode((r as HTMLInputElement).value)));
  ui.undo.addEventListener("click", undo);
  ui.redo.addEventListener("click", redo);
  ui.del.addEventListener("click", () => { if (selId) remove(selId, "stage"); });
  ui.editText.addEventListener("click", () => { const m = find(selId); if (m) startEdit(m, false); });
  ui.smaller.addEventListener("click", () => resize(0.9, "size-step"));
  ui.bigger.addEventListener("click", () => resize(1.1, "size-step"));

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
    ta.className = m.type === "rect" ? "fv-ed-edit fv-wrap" : "fv-ed-edit";
    ta.value = m.text ?? "";
    ta.setAttribute("aria-label", m.type === "rect" ? T("edTextInBox", "Text inside the box") : T("edTextToAdd", "Text to add"));
    ta.setAttribute("wrap", m.type === "rect" ? "soft" : "off");
    ta.rows = 1;
    L.el.append(ta);
    placeEditor(ta, m, L);
    editing = { m, isNew, ta, L };
    if (!isNew) gOf.get(m.id)?.classList.add("fv-editing-mark");
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
    gOf.get(m.id)?.classList.remove("fv-editing-mark");
    ta.remove();
    if (!commitIt) return;
    if (isNew) {
      if (!text.trim()) return;
      const mark = { ...m, text };
      commit([...marks, mark]);
      announce(T("edTextAdded", "Text added. Use the arrow keys to move it."));
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
  const ghostOf = (L: Layer) => (L.gu.querySelector(".fv-ghost") as SVGElement | null) ?? svgEl(L.gu, "rect", { class: "fv-ghost", x: 0, y: 0, width: 0, height: 0 });

  function onDown(L: Layer, e: PointerEvent) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    finishEdit(true);
    const t = e.target as Element;
    const pt = toPt(e, L);
    if (mode === "select") {
      const m = find(selId);
      if (t.closest(".fv-grab") && m) {
        drag = { kind: "resize", L, orig: m, cur: m, start: pt, b: boundsFor(m) };
      } else {
        const g = t.closest<SVGGElement>(".fv-mark");
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
      if (g) { paint(g, drag.mark); g.classList.add("fv-live-mark"); }
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
      drag.moved = true;
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
      L.gu.querySelector(".fv-ghost")?.remove();
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
      g?.classList.remove("fv-live-mark");
      gOf.delete(d.mark.id); shown.delete(d.mark.id);
      g?.remove();
      commit([...marks, { ...d.mark, points: d.points }]);
      announce(T("edDrawingAdded", "Drawing added."));
    }
  }
  function onCancel(L: Layer) {
    const d = drag;
    if (!d) return;
    drag = null;
    L.gu.querySelector(".fv-ghost")?.remove();
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
    announce(mark.type === "rect" ? T("edBoxAdded", "Box added. Use the arrow keys to move it.") : T("edHighlightAdded", "Highlight added."));
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
    const g = (e.target as Element).closest<SVGGElement>(".fv-mark");
    const m = g && find(g.dataset.id!);
    if (m && (m.type === "text" || m.type === "rect")) startEdit(m, false);
  }

  // Touch: while a mark is dragged, the page must not scroll.
  const touchMove = (e: TouchEvent) => { if (drag) e.preventDefault(); };
  stage.addEventListener("touchmove", touchMove, { passive: false });

  // ---- Add in the middle of the screen (the keyboard way) ---------------------------------------
  function visibleCenter(): { L: Layer; x: number; y: number } | null {
    const sr = stage.getBoundingClientRect();
    let best: { L: Layer; top: number; bottom: number; vis: number } | null = null;
    for (const L of layers.values()) {
      if (!L.el.isConnected) continue;
      const r = L.el.getBoundingClientRect();
      const top = Math.max(r.top, sr.top), bottom = Math.min(r.bottom, sr.bottom);
      const vis = bottom - top;
      if (!best || vis > best.vis) best = { L, top, bottom, vis };
    }
    if (!best) return null;
    const r = best.L.el.getBoundingClientRect();
    const mid = best.vis > 0 ? (best.top + best.bottom) / 2 : r.top + 80;
    return { L: best.L, x: best.L.W / 2, y: clamp(((mid - r.top) * best.L.H) / r.height, 0, best.L.H) };
  }
  ui.add.addEventListener("click", () => {
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
  ui.sig.addEventListener("click", async () => {
    finishEdit(true);
    const sig = await signature.open();
    if (!sig || gone) return;
    const c = visibleCenter();
    if (!c) return;
    const w = Math.min(180, c.L.W * 0.45), h = (w * sig.height) / sig.width;
    const mark = {
      id: newId(), type: "image", page: c.L.page, x: clamp(c.x - w / 2, 0, Math.max(0, c.L.W - w)), y: clamp(c.y - h / 2, 0, Math.max(0, c.L.H - h)),
      w, h, bytes: sig.bytes, mime: "image/png", label: T("wSignature", "Signature"),
    };
    setMode("select");
    commit([...marks, mark]);
    select(mark.id, true);
    announce(T("edSigAdded", "Signature added. Drag it, or use the arrow keys, to move it. Use Bigger and Smaller to change its size."));
  });

  // ---- Keyboard ---------------------------------------------------------------------------------
  function key(e: KeyboardEvent): boolean {
    if (signature.isOpen || gone) return false;
    const t = e.target as HTMLElement;
    const k = e.key;
    if (t.matches?.("textarea, select, input:not([type=checkbox]):not([type=radio]):not([type=color])")) return false;
    if (!ui.ask.hidden && k === "Escape") { e.preventDefault(); keepEditing(); return true; }
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.altKey && k.toLowerCase() === "z") { e.preventDefault(); (e.shiftKey ? redo : undo)(); return true; }
    if (mod && !e.altKey && k.toLowerCase() === "y") { e.preventDefault(); redo(); return true; }
    if (mod || e.altKey) return false;
    const onMark = !!t.closest?.(".fv-mark");
    const inArea = onMark || !!t.closest?.(".fv-stage, .fv-ed-selbar") || t === dlg;
    const m = find(selId);
    if (k === "Escape") {
      if (m) { e.preventDefault(); select(null); return true; }
      if (dirty) { e.preventDefault(); guard(host.close); return true; }
      return false;
    }
    if (!m) return false;
    const step = e.shiftKey ? 10 : 2;
    if ((k === "Delete" || k === "Backspace") && inArea) { e.preventDefault(); remove(m.id); return true; }
    if (k.startsWith("Arrow") && (onMark || t.closest?.(".fv-ed-selbar"))) {
      e.preventDefault();
      nudge(k === "ArrowLeft" ? -step : k === "ArrowRight" ? step : 0, k === "ArrowUp" ? -step : k === "ArrowDown" ? step : 0, `nudge:${m.id}`);
      return true;
    }
    if ((k === "Enter" || k === "F2") && (m.type === "text" || m.type === "rect") && onMark) { e.preventDefault(); startEdit(m, false); return true; }
    if (onMark && (k === "+" || k === "=")) { e.preventDefault(); resize(1.1, "size-step"); return true; }
    if (onMark && k === "-") { e.preventDefault(); resize(0.9, "size-step"); return true; }
    return false;
  }
  // Tabbing to a mark selects it, so Delete and the arrow keys work on it at once.
  const focusIn = (e: FocusEvent) => {
    const g = (e.target as Element).closest?.<SVGGElement>(".fv-mark");
    if (g && g.dataset.id !== selId && !drag) select(g.dataset.id!);
  };
  stage.addEventListener("focusin", focusIn);

  // ---- Layers -----------------------------------------------------------------------------------
  function makeLayer(page: number, sz: { width: number; height: number }): Layer {
    const svg = document.createElementNS(NS, "svg") as SVGSVGElement;
    svg.setAttribute("class", "fv-ed-layer");
    svg.setAttribute("viewBox", `0 0 ${sz.width} ${sz.height}`);
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("role", "group");
    svg.setAttribute("aria-label", T("edPageMarks", "Page {n}: marks you added", { n: page }));
    const gm = document.createElementNS(NS, "g") as SVGGElement, gu = document.createElementNS(NS, "g") as SVGGElement;
    svg.append(gm, gu);
    const L: Layer = { page, el: svg as unknown as HTMLElement, svg, gm, gu, W: sz.width, H: sz.height };
    svg.addEventListener("pointerdown", (e) => onDown(L, e));
    svg.addEventListener("pointermove", (e) => onMove(L, e));
    svg.addEventListener("pointerup", (e) => onUp(L, e));
    svg.addEventListener("pointercancel", () => onCancel(L));
    svg.addEventListener("click", (e) => onClick(L, e));
    svg.addEventListener("dblclick", (e) => onDouble(L, e));
    return L;
  }
  function mount(page: number, cell: HTMLElement) {
    const sz = sizes[page - 1];
    if (!sz || gone) return;
    let L = layers.get(page);
    if (!L) { L = makeLayer(page, sz); layers.set(page, L); }
    L.el = cell;
    cell.append(L.svg);
    syncLayers();
    if (selId && find(selId)?.page === page) drawSelection();
  }
  function relayout() {
    drawSelection();
    if (editing) placeEditor(editing.ta, editing.m, editing.L);
  }

  // ---- Save, and the choice about unsaved marks -------------------------------------------------
  let keepFocus: HTMLElement | null = null;
  let pending: (() => void) | null = null;

  /** Fetch the font and the font code now, once the page is idle, so editing works offline after being used. */
  let kept = false;
  function keepForOffline() {
    if (kept || navigator.onLine === false) return;
    kept = true;
    const go = () => { fetch(FONT_URL).catch(() => {}); import("@pdf-lib/fontkit").catch(() => {}); };
    if ("requestIdleCallback" in window) window.requestIdleCallback(go, { timeout: 4000 }); else setTimeout(go, 2000);
  }

  async function save(): Promise<boolean> {
    finishEdit(true);
    if (saving || gone) return false;
    if (!marks.length) {
      const text = T("edNothing", "Add some text, a box, a highlight, a drawing or your signature to the pages first.");
      ui.status.textContent = text;
      announce(text);
      return false;
    }
    saving = true;
    ui.save.disabled = true;
    ui.status.textContent = T("edSaving", "Saving…");
    try {
      const opts: { fontkit?: unknown; unicodeFont?: Uint8Array } = {};
      if (marks.some((m) => (m.type === "text" || m.type === "rect") && !isLatinText(m.text ?? ""))) {
        const [kit, res] = await Promise.all([import("@pdf-lib/fontkit"), fetch(FONT_URL)]);
        if (!res.ok) throw new Error(T("edFontFailed", "The font for this text could not be loaded. Reload the page and try again."));
        opts.fontkit = (kit as any).default ?? kit;
        opts.unicodeFont = new Uint8Array(await res.arrayBuffer());
      }
      const out = await applyMarks(bytes.slice(0), marks, opts);
      const base = baseName(name).replace(/-edited$/, "");
      const next = `${base}-edited.pdf`;
      const blob = new Blob([out as BlobPart], { type: "application/pdf" });
      // From here the saved copy is the file: the marks are part of its pages, and a new edit starts clean.
      bytes = out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
      name = next;
      history.reset([]);
      marks = [];
      selId = null;
      dirty = false;
      afterChange();
      dirty = false;
      await host.saved(blob, next);
      ui.status.textContent = T("edSaved", "Saved as {name}.", { name: next });
      announce(ui.status.textContent);
      return true;
    } catch (e) {
      const text = (e as Error).message;
      ui.status.textContent = text;
      announce(text);
      return false;
    } finally {
      saving = false;
      if (!gone) ui.save.disabled = false;
    }
  }
  ui.save.addEventListener("click", () => { void save(); });

  function closeAsk() {
    ui.ask.hidden = true;
    ui.root.classList.remove("asking");
    pending = null;
  }
  function keepEditing() {
    closeAsk();
    (keepFocus?.isConnected ? keepFocus : ui.root.querySelector<HTMLElement>('input[name="fv-ed-mode"]:checked'))?.focus();
  }
  function guard(proceed: () => void) {
    finishEdit(true);
    if (!dirty) { proceed(); return; }
    pending = proceed;
    keepFocus = document.activeElement as HTMLElement | null;
    ui.ask.hidden = false;
    ui.root.classList.add("asking");
    ui.askSave.focus();
    announce(T("unsavedTitle", "You have changes that are not saved."));
  }
  ui.askKeep.addEventListener("click", keepEditing);
  ui.askDiscard.addEventListener("click", () => {
    const go = pending;
    dirty = false;
    closeAsk();
    go?.();
  });
  ui.askSave.addEventListener("click", async () => {
    const go = pending;
    ui.askSave.disabled = true;
    const ok = await save();
    ui.askSave.disabled = false;
    if (ok) { closeAsk(); go?.(); }
    else ui.askSave.focus();
  });

  const unload = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); };
  window.addEventListener("beforeunload", unload);

  // ---- Start and end ----------------------------------------------------------------------------
  function destroy() {
    if (gone) return;
    gone = true;
    finishEdit(false);
    window.removeEventListener("beforeunload", unload);
    stage.removeEventListener("touchmove", touchMove);
    stage.removeEventListener("focusin", focusIn);
    for (const L of layers.values()) L.svg.remove();
    layers.clear(); gOf.clear(); shown.clear();
    for (const u of urls.values()) URL.revokeObjectURL(u);
    urls.clear();
    signature.destroy();
    ui.root.remove();
    host.bar.hidden = true;
    delete dlg.dataset.edmode;
    delete dlg.dataset.marks;
    dlg.classList.remove("fv-draggy");
  }

  setMode("select", false);
  afterChange();
  dirty = false;
  keepForOffline();
  return {
    sizes, mount, key, relayout, guard, destroy,
    item: pdfViewItem,
    get dirty() { return dirty; },
  };
}
