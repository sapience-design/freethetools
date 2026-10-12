// The signature dialog: draw it, type it, or pick a picture. The result is a transparent PNG
// trimmed to the ink. Nothing is uploaded: a picked file is read here and never fetched.

export type Signature = { bytes: Uint8Array; width: number; height: number };

const STYLES: Record<string, string> = {
  script: 'italic 110px "Segoe Script", "Snell Roundhand", "Brush Script MT", "Lucida Handwriting", "URW Chancery L", cursive',
  formal: 'italic 110px "Apple Chancery", "Lucida Calligraphy", "URW Chancery L", "Palatino Linotype", Palatino, Georgia, serif',
  casual: '100px "Bradley Hand", "Segoe Print", "Chalkboard SE", "Comic Sans MS", "Comic Neue", cursive',
};
const MAX_WIDTH = 900;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

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

/** Wire the dialog. `open()` shows it and resolves with the signature, or null when cancelled. */
export function setupSignature() {
  const dlg = $<HTMLDialogElement>("pes-sig");
  const pad = $<HTMLCanvasElement>("pes-pad");
  const prev = $<HTMLCanvasElement>("pes-sigprev");
  const pic = $<HTMLCanvasElement>("pes-sigpic");
  const use = $<HTMLButtonElement>("pes-sig-use");
  const last = $<HTMLButtonElement>("pes-sig-last");
  const err = $("pes-sig-err");
  let remembered: Signature | null = null;
  let settle: ((s: Signature | null) => void) | null = null;
  let picked: ImageBitmap | HTMLImageElement | null = null;
  let strokes = 0;

  const tab = () => (document.querySelector('input[name="pes-sigtab"]:checked') as HTMLInputElement).value as "draw" | "type" | "pic";
  const ink = () => (document.querySelector('input[name="pes-ink"]:checked') as HTMLInputElement).value;
  const problem = (text: string) => { err.textContent = text; err.hidden = !text; };

  // ---- Draw -------------------------------------------------------------------------------------
  const pctx = pad.getContext("2d")!;
  const clearPad = () => { pctx.clearRect(0, 0, pad.width, pad.height); strokes = 0; refresh(); };
  let drawing = false, lastPt: [number, number] | null = null;
  const at = (e: PointerEvent): [number, number] => {
    const r = pad.getBoundingClientRect();
    return [((e.clientX - r.left) * pad.width) / r.width, ((e.clientY - r.top) * pad.height) / r.height];
  };
  const segment = (from: [number, number], to: [number, number]) => {
    pctx.strokeStyle = ink();
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
    segment(lastPt, [lastPt[0] + 0.01, lastPt[1]]); // a tap leaves a dot
    strokes++;
    refresh();
  });
  pad.addEventListener("pointermove", (e) => {
    if (!drawing || !lastPt) return;
    e.preventDefault();
    for (const p of e.getCoalescedEvents?.() ?? [e]) {
      const next = at(p);
      segment(lastPt, next);
      lastPt = next;
    }
  });
  const stop = () => { drawing = false; lastPt = null; };
  pad.addEventListener("pointerup", stop);
  pad.addEventListener("pointercancel", stop);
  $("pes-pad-clear").addEventListener("click", clearPad);

  // ---- Type -------------------------------------------------------------------------------------
  const tctx = prev.getContext("2d")!;
  function drawTyped() {
    const text = ($("pes-sigtext") as HTMLInputElement).value.trim();
    const font = STYLES[($("pes-sigfont") as HTMLSelectElement).value] ?? STYLES.script;
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
  $("pes-sigtext").addEventListener("input", drawTyped);
  $("pes-sigfont").addEventListener("change", drawTyped);

  // ---- Picture ----------------------------------------------------------------------------------
  const cctx = pic.getContext("2d", { willReadFrequently: true })!;
  function drawPicked() {
    cctx.clearRect(0, 0, pic.width, pic.height);
    if (!picked) return refresh();
    const w = "naturalWidth" in picked ? picked.naturalWidth : picked.width;
    const h = "naturalHeight" in picked ? picked.naturalHeight : picked.height;
    const scale = Math.min(pic.width / w, pic.height / h, 1);
    cctx.drawImage(picked, 0, 0, w * scale, h * scale);
    if (($("pes-sig-see") as HTMLInputElement).checked) {
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
  $("pes-sigfile").addEventListener("change", async (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    picked = null;
    problem("");
    if (f) {
      if (!/^image\/(png|jpeg)$/.test(f.type)) problem("Choose a PNG or JPG picture.");
      else if (f.size > 15 * 1024 * 1024) problem("That picture is very large. Choose one under 15 MB.");
      else {
        try { picked = await createImageBitmap(f); }
        catch { problem("That picture could not be opened. Try another one."); }
      }
    }
    drawPicked();
  });
  $("pes-sig-see").addEventListener("change", drawPicked);

  // ---- Dialog -----------------------------------------------------------------------------------
  function ready(): boolean {
    if (tab() === "draw") return strokes > 0;
    if (tab() === "type") return !!($("pes-sigtext") as HTMLInputElement).value.trim();
    return !!picked;
  }
  function refresh() { use.disabled = !ready(); }

  const panels = { draw: $("pes-sp-draw"), type: $("pes-sp-type"), pic: $("pes-sp-pic") };
  document.querySelectorAll('input[name="pes-sigtab"]').forEach((r) =>
    r.addEventListener("change", () => {
      for (const [k, el] of Object.entries(panels)) el.hidden = k !== tab();
      problem("");
      refresh();
    }));

  use.addEventListener("click", async () => {
    const source = tab() === "draw" ? pad : tab() === "type" ? prev : pic;
    const cut = trim(source);
    if (!cut) return problem("There is nothing to use yet.");
    // Keep the picture a sensible size: it is shown small on the page.
    let out = cut;
    if (cut.width > MAX_WIDTH) {
      out = document.createElement("canvas");
      out.width = MAX_WIDTH;
      out.height = Math.max(1, Math.round((cut.height * MAX_WIDTH) / cut.width));
      out.getContext("2d")!.drawImage(cut, 0, 0, out.width, out.height);
    }
    const sig = await toPng(out);
    if (!sig) return problem("The signature could not be made. Try again.");
    remembered = sig;
    finish(sig);
  });
  last.addEventListener("click", () => finish(remembered));
  $("pes-sig-cancel").addEventListener("click", () => finish(null));

  function finish(result: Signature | null) {
    const done = settle;
    settle = null;
    if (dlg.open) dlg.close();
    done?.(result);
  }
  dlg.addEventListener("close", () => { const done = settle; settle = null; done?.(null); }); // Escape

  return {
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
  };
}
