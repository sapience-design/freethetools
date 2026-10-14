// The signature dialog: draw it, type it, or pick a picture. The result is a transparent PNG
// trimmed to the ink. Nothing is uploaded: a picked file is read here and never fetched.
// The dialog is built by script when the editor starts and removed when it ends.
import { T } from "./words";
import { el, icon } from "./dom";

export type Signature = { bytes: Uint8Array; width: number; height: number };

const STYLES: Record<string, string> = {
  script: 'italic 110px "Segoe Script", "Snell Roundhand", "Brush Script MT", "Lucida Handwriting", "URW Chancery L", cursive',
  formal: 'italic 110px "Apple Chancery", "Lucida Calligraphy", "URW Chancery L", "Palatino Linotype", Palatino, Georgia, serif',
  casual: '100px "Bradley Hand", "Segoe Print", "Chalkboard SE", "Comic Sans MS", "Comic Neue", cursive',
};
const MAX_WIDTH = 900;

/** Crop a canvas to the pixels that have ink, with a small margin. Null when it is empty. */
function trim(src: HTMLCanvasElement): HTMLCanvasElement | null {
  const w = src.width, h = src.height;
  const data = src.getContext("2d")!.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 12) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  const pad = 8;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
  const out = document.createElement("canvas");
  out.width = x1 - x0 + 1;
  out.height = y1 - y0 + 1;
  out.getContext("2d")!.drawImage(src, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

const toPng = (c: HTMLCanvasElement) =>
  new Promise<Signature | null>((done) =>
    c.toBlob(async (b) => done(b ? { bytes: new Uint8Array(await b.arrayBuffer()), width: c.width, height: c.height } : null), "image/png"));

/** A group of radio buttons that look like the site's segmented control. */
function segment(name: string, legend: string, items: [string, string, string?][], extra = ""): HTMLFieldSetElement {
  const fs = el("fieldset", `seg fv-sg-seg ${extra}`.trim());
  fs.append(el("legend", "sr-only", legend));
  items.forEach(([value, label], i) => {
    const id = `fv-sg-${name}-${value}`;
    fs.append(el("input", "", "", { type: "radio", name: `fv-sg-${name}`, id, value, checked: i === 0 }), el("label", "", label, { for: id }));
  });
  return fs;
}

/** Build the dialog and wire it. `open()` shows it and resolves with the signature, or null when cancelled. */
export function setupSignature() {
  const dlg = el("dialog", "fv-sg", "", { "aria-labelledby": "fv-sg-title" });
  const box = el("div", "fv-sg-box");
  const err = el("p", "tool-error", "", { id: "fv-sg-err", role: "alert", hidden: true });

  const tabs = segment("tab", T("sigHow", "How do you want to make it?"), [["draw", T("sigDraw", "Draw")], ["type", T("sigType", "Type")], ["pic", T("sigPicture", "Picture")]], "fv-sg-tabs");
  tabs.querySelectorAll("label").forEach((l, i) => l.prepend(icon((["scribble", "textT", "image"] as const)[i])));

  // Draw
  const pad = el("canvas", "fv-sg-pad", "", { id: "fv-sg-pad", width: 900, height: 300, role: "img", "aria-label": T("sigPad", "Signature drawing area. Use the Type tab if you cannot draw.") });
  const clear = el("button", "btn quiet small", T("sigClear", "Clear"), { type: "button", id: "fv-sg-clear" });
  const inks = segment("ink", T("sigInk", "Ink colour"), [["#111111", T("cBlack", "Black")], ["#1f3f9e", T("cBlue", "Blue")]], "fv-sg-inkset");
  const panelDraw = el("div", "fv-sg-panel");
  panelDraw.append(pad, Object.assign(el("div", "fv-sg-padbar"), {}));
  panelDraw.lastElementChild!.append(inks, clear);

  // Type
  const nameIn = el("input", "", "", { type: "text", id: "fv-sg-text", maxlength: 60, autocomplete: "off" });
  const nameField = el("label", "field");
  nameField.append(el("span", "", T("sigName", "Your name")), nameIn);
  const fontSel = el("select", "", "", { id: "fv-sg-font" });
  for (const [v, l] of [["script", T("sigScript", "Script")], ["formal", T("sigFormal", "Formal")], ["casual", T("sigCasual", "Casual")]]) fontSel.append(el("option", "", l, { value: v }));
  const fontField = el("label", "field");
  fontField.append(el("span", "", T("sigStyle", "Style")), fontSel);
  const prev = el("canvas", "fv-sg-pad fv-sg-prev", "", { width: 900, height: 200, "aria-hidden": "true" });
  const panelType = el("div", "fv-sg-panel", "", { hidden: true });
  panelType.append(nameField, fontField, prev);

  // Picture
  const fileIn = el("input", "", "", { type: "file", id: "fv-sg-file", accept: "image/png,image/jpeg" });
  const fileField = el("label", "field");
  fileField.append(el("span", "", T("sigFile", "A PNG or JPG of your signature")), fileIn);
  const see = el("input", "", "", { type: "checkbox", id: "fv-sg-see", checked: true });
  const seeField = el("label", "check");
  seeField.append(see, document.createTextNode(" "), el("span", "", T("sigSee", "Make the white background see-through")));
  const pic = el("canvas", "fv-sg-pad fv-sg-prev", "", { width: 900, height: 300, "aria-hidden": "true" });
  const panelPic = el("div", "fv-sg-panel", "", { hidden: true });
  panelPic.append(fileField, seeField, pic, el("p", "fv-sg-small", T("sigPicNote", "Sign on white paper and take a straight photo, or scan it. The picture stays on this device.")));

  const use = el("button", "btn", T("sigUse", "Use signature"), { type: "button", id: "fv-sg-use", disabled: true });
  const last = el("button", "btn quiet", T("sigLast", "Use the last one"), { type: "button", hidden: true });
  const cancel = el("button", "btn quiet", T("sigCancel", "Cancel"), { type: "button", id: "fv-sg-cancel" });
  const acts = el("div", "fv-sg-acts");
  acts.append(use, last, cancel);

  box.append(
    el("h2", "", T("sigTitle", "Add your signature"), { id: "fv-sg-title" }),
    el("p", "fv-sg-note", T("sigNote", "This adds a picture of your signature. It is not a certificate-based digital signature.")),
    tabs, panelDraw, panelType, panelPic, err, acts,
  );
  dlg.append(box);
  document.body.append(dlg);

  let remembered: Signature | null = null;
  let settle: ((s: Signature | null) => void) | null = null;
  let picked: ImageBitmap | HTMLImageElement | null = null;
  let strokes = 0;

  const checked = (name: string) => (dlg.querySelector(`input[name="fv-sg-${name}"]:checked`) as HTMLInputElement).value;
  const tab = () => checked("tab") as "draw" | "type" | "pic";
  const problem = (text: string) => { err.textContent = text; err.hidden = !text; };

  // ---- Draw -------------------------------------------------------------------------------------
  const pctx = pad.getContext("2d")!;
  const clearPad = () => { pctx.clearRect(0, 0, pad.width, pad.height); strokes = 0; refresh(); };
  let drawing = false, lastPt: [number, number] | null = null;
  const at = (e: PointerEvent): [number, number] => {
    const r = pad.getBoundingClientRect();
    return [((e.clientX - r.left) * pad.width) / r.width, ((e.clientY - r.top) * pad.height) / r.height];
  };
  const seg = (from: [number, number], to: [number, number]) => {
    pctx.strokeStyle = checked("ink");
    pctx.lineWidth = 6;
    pctx.lineCap = "round";
    pctx.lineJoin = "round";
    pctx.beginPath();
    pctx.moveTo(...from);
    pctx.lineTo(...to);
    pctx.stroke();
  };
  pad.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    pad.setPointerCapture(e.pointerId);
    drawing = true;
    lastPt = at(e);
    seg(lastPt, [lastPt[0] + 0.01, lastPt[1]]); // a tap leaves a dot
    strokes++;
    refresh();
  });
  pad.addEventListener("pointermove", (e) => {
    if (!drawing || !lastPt) return;
    e.preventDefault();
    for (const p of e.getCoalescedEvents?.() ?? [e]) {
      const next = at(p);
      seg(lastPt, next);
      lastPt = next;
    }
  });
  const stop = () => { drawing = false; lastPt = null; };
  pad.addEventListener("pointerup", stop);
  pad.addEventListener("pointercancel", stop);
  clear.addEventListener("click", clearPad);

  // ---- Type -------------------------------------------------------------------------------------
  const tctx = prev.getContext("2d")!;
  function drawTyped() {
    const text = nameIn.value.trim();
    const font = STYLES[fontSel.value] ?? STYLES.script;
    tctx.clearRect(0, 0, prev.width, prev.height);
    if (text) {
      tctx.font = font;
      tctx.textBaseline = "middle";
      tctx.fillStyle = "#111111";
      let size = 110;
      // Long names shrink to fit instead of running off the picture.
      while (tctx.measureText(text).width > prev.width - 40 && size > 24) {
        size -= 6;
        tctx.font = font.replace(/\d+px/, `${size}px`);
      }
      tctx.fillText(text, 20, prev.height / 2);
    }
    refresh();
  }
  nameIn.addEventListener("input", drawTyped);
  fontSel.addEventListener("change", drawTyped);

  // ---- Picture ----------------------------------------------------------------------------------
  const cctx = pic.getContext("2d", { willReadFrequently: true })!;
  function drawPicked() {
    cctx.clearRect(0, 0, pic.width, pic.height);
    if (!picked) return refresh();
    const w = "naturalWidth" in picked ? picked.naturalWidth : picked.width;
    const h = "naturalHeight" in picked ? picked.naturalHeight : picked.height;
    const scale = Math.min(pic.width / w, pic.height / h, 1);
    cctx.drawImage(picked, 0, 0, w * scale, h * scale);
    if (see.checked) {
      // White paper becomes see-through: the lighter a pixel, the less of it is kept.
      const img = cctx.getImageData(0, 0, pic.width, pic.height);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        if (!d[i + 3]) continue;
        const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        const keep = lum >= 235 ? 0 : lum <= 150 ? 1 : (235 - lum) / 85;
        d[i + 3] = Math.round(d[i + 3] * keep);
      }
      cctx.putImageData(img, 0, 0);
    }
    refresh();
  }
  fileIn.addEventListener("change", async () => {
    const f = fileIn.files?.[0];
    picked = null;
    problem("");
    if (f) {
      if (!/^image\/(png|jpeg)$/.test(f.type)) problem(T("sigErrType", "Choose a PNG or JPG picture."));
      else if (f.size > 15 * 1024 * 1024) problem(T("sigErrBig", "That picture is very large. Choose one under 15 MB."));
      else {
        try { picked = await createImageBitmap(f); }
        catch { problem(T("sigErrOpen", "That picture could not be opened. Try another one.")); }
      }
    }
    drawPicked();
  });
  see.addEventListener("change", drawPicked);

  // ---- Dialog -----------------------------------------------------------------------------------
  function ready(): boolean {
    if (tab() === "draw") return strokes > 0;
    if (tab() === "type") return !!nameIn.value.trim();
    return !!picked;
  }
  function refresh() { use.disabled = !ready(); }

  const panels = { draw: panelDraw, type: panelType, pic: panelPic };
  tabs.querySelectorAll("input").forEach((r) =>
    r.addEventListener("change", () => {
      for (const [k, p] of Object.entries(panels)) p.hidden = k !== tab();
      problem("");
      refresh();
    }));

  use.addEventListener("click", async () => {
    const source = tab() === "draw" ? pad : tab() === "type" ? prev : pic;
    const cut = trim(source);
    if (!cut) return problem(T("sigErrEmpty", "There is nothing to use yet."));
    // Keep the picture a sensible size: it is shown small on the page.
    let out = cut;
    if (cut.width > MAX_WIDTH) {
      out = document.createElement("canvas");
      out.width = MAX_WIDTH;
      out.height = Math.max(1, Math.round((cut.height * MAX_WIDTH) / cut.width));
      out.getContext("2d")!.drawImage(cut, 0, 0, out.width, out.height);
    }
    const sig = await toPng(out);
    if (!sig) return problem(T("sigErrMake", "The signature could not be made. Try again."));
    remembered = sig;
    finish(sig);
  });
  last.addEventListener("click", () => finish(remembered));
  cancel.addEventListener("click", () => finish(null));

  function finish(result: Signature | null) {
    const done = settle;
    settle = null;
    if (dlg.open) dlg.close();
    done?.(result);
  }
  dlg.addEventListener("close", () => { const done = settle; settle = null; done?.(null); }); // Escape

  return {
    get isOpen() { return dlg.open; },
    /** Remember the last signature between visits to the dialog (until the editor ends). */
    open(): Promise<Signature | null> {
      problem("");
      clearPad();
      last.hidden = !remembered;
      refresh();
      return new Promise((done) => {
        settle = done;
        dlg.showModal();
      });
    },
    destroy() {
      if (dlg.open) dlg.close();
      dlg.remove();
    },
  };
}
