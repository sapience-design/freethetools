// The editing toolbar of the viewer, built by script when Edit is pressed. One tool palette, the way
// drawing and markup tools lay it out: the tools, then the style of the tool in hand (or of the
// selected mark) as small visual choices with no form labels, then Undo, Redo, Delete and Save.
// On a wide screen it sits under the viewer's top bar; on a phone it is a bar at the bottom, with
// the style choices in one slim strip above the tools. Every choice is a real radio button
// underneath, named for screen readers.
import { T } from "./words";
import { button, el, icon } from "./dom";
import type { IconName } from "./icons";

export const INKS: [string, string, string][] = [["#000000", "cBlack", "Black"], ["#c62828", "cRed", "Red"], ["#1f5fcc", "cBlue", "Blue"], ["#0f7a44", "cGreen", "Green"]];
export const MARKERS: [string, string, string][] = [["#ffdf3d", "cYellow", "Yellow"], ["#7ddf64", "cGreen", "Green"], ["#ff8fc4", "cPink", "Pink"], ["#6fb7ff", "cBlue", "Blue"], ["#ffa24d", "cOrange", "Orange"]];
// White first: a white box covers a mistake on the page.
export const FILLS: [string, string, string][] = [["#ffffff", "cWhite", "White"], ["#ffdf3d", "cYellow", "Yellow"], ["#dbe8ff", "cLightBlue", "Light blue"], ["#dcf2d4", "cLightGreen", "Light green"], ["#ececec", "cGrey", "Grey"]];
export const MODES: [string, string, string, IconName][] = [
  ["select", "edSelect", "Select", "cursor"],
  ["text", "edText", "Text", "textT"],
  ["box", "edBox", "Box", "rectangle"],
  ["highlight", "edHighlight", "Highlight", "highlighter"],
  ["draw", "edDraw", "Draw", "scribble"],
];
// Text sizes in points, as steps people know from drawing tools. Smaller and Bigger fine-tune a mark.
const SIZES: [string, string, string, number][] = [["12", "sSmall", "Small", 11], ["16", "sMedium", "Medium", 14], ["22", "sLarge", "Large", 17], ["32", "sXLarge", "Extra large", 21]];

/** A group of choices drawn as small buttons over radio inputs. `value` reads and sets the checked one. */
export type Choice = { el: HTMLFieldSetElement; value: string; on: (fn: () => void) => void };

function choice(name: string, legend: string, cls: string, items: { value: string; label: string; draw: (lab: HTMLElement) => void }[], value: string): Choice {
  const set = el("fieldset", `fv-ch ${cls}`) as HTMLFieldSetElement;
  set.append(el("legend", "sr-only", legend));
  for (const it of items) {
    const id = `fv-ed-${name}-${it.value.replace(/[^\w]/g, "")}`;
    const input = el("input", "", "", { type: "radio", name: `fv-ed-${name}`, id, value: it.value, checked: it.value === value });
    const lab = el("label", "", "", { for: id, title: it.label });
    it.draw(lab);
    lab.append(el("span", "sr-only", it.label));
    set.append(input, lab);
  }
  const radios = () => [...set.querySelectorAll<HTMLInputElement>(`input[name="fv-ed-${name}"]`)];
  return {
    el: set,
    get value() { return radios().find((r) => r.checked)?.value ?? ""; },
    set value(v: string) { for (const r of radios()) r.checked = r.value === v; },
    on(fn) { for (const r of radios()) r.addEventListener("change", fn); },
  };
}

/** Colour dots. `own` adds a dot that opens the browser's colour picker; `none` adds "no colour". */
function dots(name: string, legend: string, list: [string, string, string][], opts: { own?: string; none?: [string, string] } = {}) {
  const items = list.map(([hex, key, en]) => ({ value: hex, label: T(key, en), draw: (lab: HTMLElement) => { const d = el("span", "fv-dot"); d.style.setProperty("--c", hex); lab.append(d); } }));
  if (opts.none) items.unshift({ value: "none", label: T(opts.none[0], opts.none[1]), draw: (lab) => lab.append(el("span", "fv-dot fv-dot-none")) });
  const c = choice(name, legend, "fv-dots", items, items[0].value);
  let own: HTMLInputElement | null = null, ownDot: HTMLElement | null = null;
  if (opts.own) {
    // The picker sits inside its own dot, so a click opens it and the dot shows what was picked.
    const lab = el("label", "fv-own", "", { title: T("cOther", "Other colour") });
    ownDot = el("span", "fv-dot fv-dot-own");
    own = el("input", "", "", { type: "color", value: opts.own, "aria-label": T("cOther", "Other colour") }) as HTMLInputElement;
    lab.append(ownDot, own);
    c.el.append(lab);
  }
  // Not a spread: that would copy the value once instead of keeping it live.
  return Object.assign(c, { own, ownDot });
}

/** Line weights drawn as lines that get heavier; 0 is drawn as "none". */
function weights(name: string, legend: string, list: [string, string, string][], value: string) {
  return choice(name, legend, "fv-seg-s", list.map(([v, key, en]) => ({
    value: v, label: T(key, en),
    draw: (lab: HTMLElement) => {
      if (Number(v) === 0) { lab.append(el("span", "fv-dot fv-dot-none fv-dot-sm")); return; }
      const line = el("span", "fv-line");
      line.style.setProperty("--w", `${Math.max(1.5, Math.min(7, Number(v) * 1.3))}px`);
      lab.append(line);
    },
  })), value);
}

/** Everything the session needs to read from and write to. */
export function buildBar() {
  const root = el("div", "fv-ed-in");

  // ---- Tools ------------------------------------------------------------------------------------
  const main = el("div", "fv-ed-main");
  const modes = el("fieldset", "fv-eseg");
  modes.append(el("legend", "sr-only", T("edMode", "What do you want to do?")));
  for (const [id, key, en, ico] of MODES) {
    const input = el("input", "", "", { type: "radio", name: "fv-ed-mode", id: `fv-ed-m-${id}`, value: id, checked: id === "select" });
    const lab = el("label", "", "", { for: `fv-ed-m-${id}`, title: T(key, en) });
    lab.append(icon(ico), el("span", "fv-cap", T(key, en)));
    modes.append(input, lab);
  }
  const sig = button("fv-btn fv-ed-sigbtn", T("edSign", "Signature"), "signature", { id: "fv-ed-sig", "aria-haspopup": "dialog" });
  const tools = el("div", "fv-ed-tools");
  tools.append(modes, sig);

  // ---- Style of the tool in hand, or of the selected mark -----------------------------------------
  const ctx = el("div", "fv-ed-ctx", "", { id: "fv-ed-opts" });
  const selLabel = el("p", "fv-ed-sel", "", { id: "fv-ed-seltext", hidden: true });
  const color = dots("color", T("edColor", "Colour"), INKS, { own: "#7b3fc4" });
  const marker = dots("marker", T("edHlColor", "Highlight colour"), MARKERS);
  const size = choice("size", T("edSize", "Text size"), "fv-seg-s", SIZES.map(([v, key, en, px]) => ({
    value: v, label: T(key, en), draw: (lab: HTMLElement) => { const a = el("span", "fv-aa", "A"); a.style.fontSize = `${px}px`; a.setAttribute("aria-hidden", "true"); lab.append(a); },
  })), "16");
  const bw = weights("bw", T("edBorder", "Border"), [["0", "wNone", "No border"], ["1", "wThin", "Thin"], ["2", "wMedium", "Medium"], ["4", "wThick", "Thick"]], "2");
  const fill = dots("fill", T("edFill", "Fill"), FILLS, { none: ["wNoFill", "No fill"] });
  const fillOp = choice("fillop", T("edFillStrength", "Fill strength"), "fv-seg-s", [["0.35", "opLight", "Light"], ["0.65", "opMedium", "Medium"], ["1", "opSolid", "Solid"]].map(([v, key, en]) => ({
    value: v, label: T(key, en), draw: (lab: HTMLElement) => { const s = el("span", "fv-op"); s.style.setProperty("--o", v); lab.append(s); },
  })), "1");
  const pw = weights("pw", T("edPen", "Pen thickness"), [["1.5", "wThin", "Thin"], ["3", "wMedium", "Medium"], ["6", "wThick", "Thick"]], "3");
  const editText = button("fv-btn", T("edEditText", "Edit text"), "pencil", { id: "fv-ed-edit" });
  const smaller = button("fv-btn fv-ico", T("edSmaller", "Smaller"), "minus", { id: "fv-ed-smaller", title: T("edSmaller", "Smaller") });
  const bigger = button("fv-btn fv-ico", T("edBigger", "Bigger"), "plus", { id: "fv-ed-bigger", title: T("edBigger", "Bigger") });
  const selacts = el("div", "fv-ed-selacts", "", { id: "fv-ed-selbar", hidden: true });
  selacts.append(editText, smaller, bigger);
  const add = el("button", "fv-btn fv-ed-add", "", { type: "button", id: "fv-ed-add", hidden: true });
  // The row keeps its place when there is nothing to style, so the page never jumps.
  const empty = el("p", "fv-ed-empty", T("edPickTool", "Choose a tool, or select a mark to change it."), { hidden: true });
  const groups = [color.el, marker.el, size.el, bw.el, fill.el, fillOp.el, pw.el];
  groups.forEach((g) => (g.hidden = true));
  ctx.append(empty, selLabel, ...groups, selacts, add);

  // ---- History and saving ------------------------------------------------------------------------
  const acts = el("div", "fv-ed-acts");
  const undo = button("fv-btn fv-ico", T("edUndo", "Undo"), "undo", { id: "fv-ed-undo", disabled: true, title: T("edUndo", "Undo") });
  const redo = button("fv-btn fv-ico", T("edRedo", "Redo"), "redo", { id: "fv-ed-redo", disabled: true, title: T("edRedo", "Redo") });
  const del = button("fv-btn fv-ico", T("edDelete", "Delete"), "trash", { id: "fv-ed-del", disabled: true, title: T("edDelete", "Delete") });
  const save = button("fv-btn fv-ed-save fv-keep", T("edSave", "Save"), "floppy", { id: "fv-ed-save" });
  acts.append(undo, redo, del, save);
  main.append(tools, ctx, acts);

  // ---- The unsaved choice and the status line -----------------------------------------------------
  const ask = el("div", "fv-ed-ask", "", { id: "fv-ed-ask", role: "group", "aria-labelledby": "fv-ed-ask-t", hidden: true });
  const askT = el("p", "", T("unsavedTitle", "You have changes that are not saved."), { id: "fv-ed-ask-t" });
  const askSave = el("button", "fv-btn", T("unsavedSave", "Save"), { type: "button", id: "fv-ed-ask-save" });
  const askDiscard = el("button", "fv-btn", T("unsavedDiscard", "Discard"), { type: "button", id: "fv-ed-ask-discard" });
  const askKeep = el("button", "fv-btn", T("unsavedKeep", "Keep editing"), { type: "button", id: "fv-ed-ask-keep" });
  ask.append(askT, askSave, askDiscard, askKeep);
  const status = el("p", "fv-ed-status", "", { id: "fv-ed-status" });
  // How to use the tool in hand: shown for a few seconds over the page, and read out once.
  const hint = el("p", "fv-ed-toast", "", { id: "fv-ed-hint", role: "status" });

  root.append(ask, main, status, hint);
  return {
    root, main, ctx, modes, sig, undo, redo, del, save,
    color, marker, size, bw, fill, fillOp, pw, groups,
    selLabel, selacts, editText, smaller, bigger, add, hint, empty,
    ask, askSave, askDiscard, askKeep, status,
  };
}
export type Bar = ReturnType<typeof buildBar>;
