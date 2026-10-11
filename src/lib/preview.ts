// Previews of what a tool made, so a person can look before they download: a before-and-after
// slider for pictures, and a player for sound and video. Everything is a blob: URL made here;
// nothing leaves the page.
import { fmtBytes } from "./files";

/** A slider that reveals the "after" picture over the "before" one. Both are drawn to the same box. */
export function compareSlider(before: Blob, after: Blob, o: { beforeLabel?: string; afterLabel?: string } = {}): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "cmp-pics";
  const stage = document.createElement("div");
  stage.className = "cmp-stage";
  const a = new Image(), b = new Image();
  a.alt = o.beforeLabel ?? "Before";
  b.alt = o.afterLabel ?? "After";
  a.decoding = b.decoding = "async";
  a.src = URL.createObjectURL(before);
  b.src = URL.createObjectURL(after);
  a.className = "cmp-before";
  b.className = "cmp-after";
  const la = document.createElement("span"); la.className = "cmp-tag a"; la.textContent = `${o.beforeLabel ?? "Before"} · ${fmtBytes(before.size)}`;
  const lb = document.createElement("span"); lb.className = "cmp-tag b"; lb.textContent = `${o.afterLabel ?? "After"} · ${fmtBytes(after.size)}`;
  const bar = document.createElement("span"); bar.className = "cmp-handle"; bar.setAttribute("aria-hidden", "true");
  stage.append(a, b, la, lb, bar);
  // The stage takes the picture's own shape: a portrait photo stands tall, a panorama lies wide,
  // and nothing sits in an empty box. The tallest it gets is 520 px (see .cmp-stage).
  a.addEventListener("load", () => {
    if (!a.naturalWidth || !a.naturalHeight) return;
    stage.style.aspectRatio = `${a.naturalWidth} / ${a.naturalHeight}`;
    wrap.style.maxWidth = `${Math.round((a.naturalWidth / a.naturalHeight) * 520)}px`; // the slider under it matches
  }, { once: true });
  const range = document.createElement("input");
  range.type = "range"; range.min = "0"; range.max = "100"; range.value = "50";
  range.className = "cmp-range";
  range.setAttribute("aria-label", "Slide to compare before and after");
  const draw = () => {
    const pct = +range.value;
    // Set through CSSOM: the content security policy blocks style attributes, not this.
    b.style.clipPath = `inset(0 0 0 ${pct}%)`;
    bar.style.left = `${pct}%`;
    lb.hidden = pct > 70;
    la.hidden = pct < 30;
  };
  range.addEventListener("input", draw);
  // Dragging on the picture itself moves the slider too.
  const fromPointer = (e: PointerEvent) => {
    const r = stage.getBoundingClientRect();
    range.value = String(Math.round(Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100))));
    draw();
  };
  stage.addEventListener("pointerdown", (e) => { stage.setPointerCapture(e.pointerId); fromPointer(e); });
  stage.addEventListener("pointermove", (e) => { if (stage.hasPointerCapture(e.pointerId)) fromPointer(e); });
  draw();
  wrap.append(stage, range);
  return wrap;
}

/**
 * A "Compare" button for a result row. Pressing it opens the slider under the row; pressing it
 * again closes it. The slider is built on first use only.
 */
export function compareButton(row: HTMLElement, before: Blob, after: Blob, labels?: { beforeLabel?: string; afterLabel?: string }) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "btn quiet small";
  b.textContent = "Compare";
  b.setAttribute("aria-expanded", "false");
  let panel: HTMLElement | null = null;
  b.addEventListener("click", () => {
    if (!panel) {
      panel = document.createElement("div");
      panel.className = "fwide";
      panel.hidden = true; // opened just below
      panel.append(compareSlider(before, after, labels));
      row.append(panel);
    }
    const open = panel.hidden;
    panel.hidden = !open;
    b.textContent = open ? "Hide" : "Compare";
    b.setAttribute("aria-expanded", String(open));
  });
  return b;
}

/** Is this a file a player can show: sound or video? */
export const isMedia = (type: string) => type.startsWith("audio/") || type.startsWith("video/");

/** A sound or video player for a blob, under a result row. Null for other types. */
export function mediaPlayer(blob: Blob, label: string): HTMLElement | null {
  if (!isMedia(blob.type)) return null;
  const el = document.createElement(blob.type.startsWith("video/") ? "video" : "audio");
  el.controls = true;
  el.preload = "metadata";
  el.setAttribute("aria-label", label);
  el.src = URL.createObjectURL(blob);
  el.className = "media-preview";
  if (el instanceof HTMLVideoElement) el.playsInline = true;
  const wrap = document.createElement("div");
  wrap.className = "fwide";
  wrap.append(el);
  return wrap;
}
