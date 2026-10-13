// The editing toolbar of the viewer, built by script when Edit is pressed. On a wide screen it sits
// under the viewer's top bar; on a phone it is a bar at the bottom with the main actions always in
// reach and the colour, size and thickness choices behind an Options button.
import { T } from "./words";
import { button, el, icon } from "./dom";
import type { IconName } from "./icons";

export const INKS: [string, string, string][] = [["#000000", "cBlack", "Black"], ["#c62828", "cRed", "Red"], ["#1f5fcc", "cBlue", "Blue"], ["#0f7a44", "cGreen", "Green"]];
export const MARKERS: [string, string, string][] = [["#ffdf3d", "cYellow", "Yellow"], ["#7ddf64", "cGreen", "Green"], ["#ff8fc4", "cPink", "Pink"], ["#6fb7ff", "cBlue", "Blue"], ["#ffa24d", "cOrange", "Orange"]];
export const MODES: [string, string, string, IconName][] = [
  ["select", "edSelect", "Select", "cursor"],
  ["text", "edText", "Text", "textT"],
  ["box", "edBox", "Box", "rectangle"],
  ["highlight", "edHighlight", "Highlight", "highlighter"],
  ["draw", "edDraw", "Draw", "scribble"],
];

/** A row of colour swatches: radio buttons drawn as circles. `own` adds a "pick any colour" swatch. */
function swatches(name: string, list: [string, string, string][], own?: string): HTMLElement {
  const wrap = el("div", "fv-sw");
  list.forEach(([hex, key, en], i) => {
    const id = `fv-ed-${name}-${i}`;
    const lab = el("label", "fv-swl", "", { for: id });
    lab.style.background = hex;
    lab.append(el("span", "sr-only", T(key, en)));
    wrap.append(el("input", "", "", { type: "radio", name: `fv-ed-${name}`, id, value: hex, checked: i === 0 }), lab);
  });
  if (own) {
    const lab = el("label", "fv-swl fv-swl-own", "", { for: `fv-ed-${name}-own` });
    lab.append(el("span", "sr-only", T("cOther", "Other colour")));
    wrap.append(lab, el("input", "fv-swpick", "", { type: "color", id: `fv-ed-${name}-own`, value: own }));
  }
  return wrap;
}

function selectField(id: string, label: string, options: [string, string][], value: string, cls = ""): HTMLLabelElement {
  const f = el("label", `field fv-ed-opt ${cls}`.trim(), "", { id: `${id}-f`, hidden: true });
  const sel = el("select", "", "", { id });
  for (const [v, l] of options) sel.append(el("option", "", l, { value: v, selected: v === value }));
  f.append(el("span", "", label), sel);
  return f;
}

/** Everything the session needs to read from and write to. */
export function buildBar() {
  const root = el("div", "fv-ed-in");

  // ---- Main row -----------------------------------------------------------------------------
  const main = el("div", "fv-ed-main");
  const modes = el("fieldset", "fv-eseg");
  modes.append(el("legend", "sr-only", T("edMode", "What do you want to do?")));
  for (const [id, key, en, ico] of MODES) {
    const input = el("input", "", "", { type: "radio", name: "fv-ed-mode", id: `fv-ed-m-${id}`, value: id, checked: id === "select" });
    const lab = el("label", "", "", { for: `fv-ed-m-${id}` });
    lab.append(icon(ico), el("span", "fv-cap", T(key, en)));
    modes.append(input, lab);
  }
  const sig = button("fv-btn", T("edSign", "Signature"), "signature", { id: "fv-ed-sig", "aria-haspopup": "dialog" });
  const acts = el("div", "fv-ed-acts");
  const undo = button("fv-btn", T("edUndo", "Undo"), "undo", { id: "fv-ed-undo", disabled: true });
  const redo = button("fv-btn", T("edRedo", "Redo"), "redo", { id: "fv-ed-redo", disabled: true });
  const del = button("fv-btn", T("edDelete", "Delete"), "trash", { id: "fv-ed-del", disabled: true });
  const opts = button("fv-btn fv-ed-optbtn", T("edOptions", "Options"), "sliders", { id: "fv-ed-optbtn", "aria-expanded": "false", "aria-controls": "fv-ed-sheet" });
  const save = button("fv-btn fv-ed-save fv-keep", T("edSave", "Save"), "floppy", { id: "fv-ed-save" });
  acts.append(undo, redo, del, opts, save);
  main.append(modes, sig, acts);

  // ---- Sheet: options for the mode or the selected mark, a hint, the selected mark's actions -----
  const sheet = el("div", "fv-ed-sheet", "", { id: "fv-ed-sheet" });
  const optRow = el("div", "fv-ed-opts", "", { id: "fv-ed-opts" });

  const colorSet = el("fieldset", "fv-ed-opt", "", { id: "fv-ed-o-color", hidden: true });
  const colorLegend = el("legend", "", T("edColor", "Colour"), { id: "fv-ed-o-color-l" });
  colorSet.append(colorLegend, swatches("color", INKS, "#7b3fc4"));
  const markSet = el("fieldset", "fv-ed-opt", "", { id: "fv-ed-o-marker", hidden: true });
  markSet.append(el("legend", "", T("edHlColor", "Highlight colour")), swatches("marker", MARKERS));

  const size = el("label", "field fv-ed-opt fv-small", "", { id: "fv-ed-o-size", hidden: true });
  size.append(el("span", "", T("edSize", "Text size")), el("input", "", "", { type: "number", id: "fv-ed-size", min: 6, max: 96, step: 1, value: 16, inputmode: "numeric" }));
  const bw = selectField("fv-ed-bw", T("edBorder", "Border"), [["0", T("wNone", "None")], ["1", T("wThin", "Thin")], ["2", T("wMedium", "Medium")], ["4", T("wThick", "Thick")]], "2", "fv-small");
  const fill = el("fieldset", "fv-ed-opt fv-ed-fill", "", { id: "fv-ed-o-fill", hidden: true });
  const fillOn = el("input", "", "", { type: "checkbox", id: "fv-ed-fill-on" });
  const fillOnL = el("label", "check");
  fillOnL.append(fillOn, document.createTextNode(" "), el("span", "", T("edFill", "Fill")));
  const fillColor = el("input", "fv-swpick fv-fillpick", "", { type: "color", id: "fv-ed-fill-color", value: "#ffdf3d", "aria-label": T("edFillColor", "Fill colour") });
  const fillOp = el("select", "", "", { id: "fv-ed-fill-op", "aria-label": T("edFillStrength", "Fill strength") });
  for (const [v, l] of [["0.25", "25%"], ["0.5", "50%"], ["0.75", "75%"], ["1", "100%"]]) fillOp.append(el("option", "", l, { value: v, selected: v === "0.5" }));
  fill.append(el("legend", "sr-only", T("edFill", "Fill")), fillOnL, fillColor, fillOp);
  const pw = selectField("fv-ed-pw", T("edPen", "Pen thickness"), [["1.5", T("wThin", "Thin")], ["3", T("wMedium", "Medium")], ["6", T("wThick", "Thick")]], "3", "fv-small");
  pw.id = "fv-ed-o-pw";
  bw.id = "fv-ed-o-bw";
  optRow.append(colorSet, markSet, size, bw, fill, pw);

  const hintRow = el("div", "fv-ed-hintrow");
  const hint = el("p", "fv-ed-hint", "", { id: "fv-ed-hint" });
  const add = el("button", "fv-btn", "", { type: "button", id: "fv-ed-add", hidden: true });
  hintRow.append(hint, add);

  const selbar = el("div", "fv-ed-selbar", "", { id: "fv-ed-selbar", hidden: true });
  const seltext = el("p", "", "", { id: "fv-ed-seltext" });
  const selacts = el("div", "fv-ed-selacts");
  const editText = button("fv-btn", T("edEditText", "Edit text"), "pencil", { id: "fv-ed-edit" });
  const smaller = button("fv-btn", T("edSmaller", "Smaller"), "minus", { id: "fv-ed-smaller" });
  const bigger = button("fv-btn", T("edBigger", "Bigger"), "plus", { id: "fv-ed-bigger" });
  selacts.append(editText, smaller, bigger);
  selbar.append(seltext, selacts);
  sheet.append(optRow, hintRow, selbar);

  // ---- The unsaved choice and the status line -----------------------------------------------------
  const ask = el("div", "fv-ed-ask", "", { id: "fv-ed-ask", role: "group", "aria-labelledby": "fv-ed-ask-t", hidden: true });
  const askT = el("p", "", T("unsavedTitle", "You have changes that are not saved."), { id: "fv-ed-ask-t" });
  const askSave = el("button", "fv-btn", T("unsavedSave", "Save"), { type: "button", id: "fv-ed-ask-save" });
  const askDiscard = el("button", "fv-btn", T("unsavedDiscard", "Discard"), { type: "button", id: "fv-ed-ask-discard" });
  const askKeep = el("button", "fv-btn", T("unsavedKeep", "Keep editing"), { type: "button", id: "fv-ed-ask-keep" });
  ask.append(askT, askSave, askDiscard, askKeep);
  const status = el("p", "fv-ed-status", "", { id: "fv-ed-status" });

  root.append(ask, main, sheet, status);
  return {
    root, main, modes, sig, undo, redo, del, opts, save, sheet, optRow,
    colorSet, colorLegend, markSet, size, bw, fill, pw, hint, add, selbar, seltext, editText, smaller, bigger,
    ask, askSave, askDiscard, askKeep, status,
    own: colorSet.querySelector<HTMLInputElement>(".fv-swpick")!,
    ownLabel: colorSet.querySelector<HTMLElement>(".fv-swl-own")!,
    sizeIn: size.querySelector<HTMLInputElement>("input")!,
    bwSel: bw.querySelector<HTMLSelectElement>("select")!,
    pwSel: pw.querySelector<HTMLSelectElement>("select")!,
    fillOn, fillColor, fillOp,
  };
}
export type Bar = ReturnType<typeof buildBar>;
