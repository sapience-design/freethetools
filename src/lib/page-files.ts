// Files from anywhere on the page: a file dropped beside the drop area, or pasted with Ctrl+V
// (Cmd+V on Apple devices), goes to the page's file input as if it had been picked there.
//
// Use it with any file input; it needs nothing else from the site:
//
//   import { takePageFiles, pasteKey } from "../lib/page-files";
//   const stop = takePageFiles({ input: fileInput, zone: dropArea, overlay: dropOverlay });
//   hintKey.textContent = pasteKey();   // "Ctrl+V" or "Cmd+V"
//   stop();                             // when the input goes away
//
// wireDrop() in src/lib/files.ts does this for every DropZone, so most tools need nothing more.
//
// The rules, so it never surprises anyone:
// - Files reach the input through its own "change" event. The tool, the Library (src/agent/page.js)
//   and the anonymous use count (src/lib/stats.ts) see exactly what a picked file gives them.
// - Only when the page has one target that is visible, enabled and not busy, and no dialog is open.
//   Otherwise a dropped file is refused, which still stops the browser opening it and leaving the page.
// - A drop that an element handles itself (it calls preventDefault, as a drop area does) is left to it.
// - A paste into a text field is left to the field. Only what the person pastes is read: nothing reads
//   the clipboard by itself, so no permission is asked, and nothing leaves the device.

export interface PageFilesTarget {
  /** Receives the files, through its own "change" event. */
  input: HTMLInputElement;
  /** Lit with the class "over" while files are dragged over the page, and scrolled into view when they arrive. */
  zone: HTMLElement;
  /**
   * Optional: shown with the class "on" while files are dragged over the page, so the whole page
   * reads as a drop area. It is moved to the end of <body> to cover everything; style it with
   * `position: fixed` and `pointer-events: none`, and hide it from screen readers (they don't drag).
   */
  overlay?: HTMLElement;
}

const targets = new Set<PageFilesTarget>();
let listening = false;
let unlightTimer = 0;
// Browsers repeat dragover at least every 350 ms (±200 ms) while a drag is over the page, so the
// light goes out by itself a moment after the drag leaves the window.
const UNLIGHT_AFTER = 700;
const NOT_TEXT = new Set(["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"]);

/** Send files dropped anywhere on the page, or pasted, to `target`. Returns a function that stops it. */
export function takePageFiles(target: PageFilesTarget): () => void {
  targets.add(target);
  if (target.overlay) document.body.append(target.overlay);
  listen();
  return () => {
    targets.delete(target);
    target.zone.classList.remove("over");
    target.overlay?.classList.remove("on");
  };
}

/** "Cmd+V" on Apple devices and "Ctrl+V" elsewhere, for text that tells people they can paste. */
export function pasteKey(): string {
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform) ? "Cmd+V" : "Ctrl+V";
}

/** The one target that may take files from the page right now, or null. */
function current(): PageFilesTarget | null {
  if (document.querySelector("dialog[open]")) return null;
  const shown = [...targets].filter((t) => t.zone.isConnected && t.zone.getClientRects().length > 0);
  if (shown.length !== 1) return null;
  const [t] = shown;
  return t.input.disabled || t.zone.hasAttribute("aria-busy") ? null : t;
}

const carriesFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes("Files");

/** A text field: a paste there is the person's text, not files for us. */
function editable(t: EventTarget | null) {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable || t instanceof HTMLTextAreaElement) return true;
  return t instanceof HTMLInputElement && !NOT_TEXT.has(t.type);
}

function unlight() {
  clearTimeout(unlightTimer);
  for (const t of targets) {
    t.zone.classList.remove("over");
    t.overlay?.classList.remove("on");
  }
}

function handOver(target: PageFilesTarget, files: File[]) {
  const box = new DataTransfer();
  for (const f of files) box.items.add(f);
  target.input.files = box.files;
  target.input.dispatchEvent(new Event("change", { bubbles: true }));
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  target.zone.scrollIntoView({ block: "nearest", behavior: still ? "auto" : "smooth" });
}

function listen() {
  if (listening) return;
  listening = true;
  document.addEventListener("dragover", (e) => {
    if (!carriesFiles(e) || !targets.size) return;
    // Restarted on every dragover, also over the drop area, so the light always goes out after the drag.
    clearTimeout(unlightTimer);
    unlightTimer = window.setTimeout(unlight, UNLIGHT_AFTER);
    const target = current();
    target?.overlay?.classList.add("on");
    if (e.defaultPrevented) return; // over an element that takes drops itself, such as the drop area
    e.preventDefault(); // otherwise the browser opens the file and leaves the page
    e.dataTransfer!.dropEffect = target ? "copy" : "none";
    target?.zone.classList.add("over");
  });
  document.addEventListener("drop", (e) => {
    if (!carriesFiles(e) || !targets.size) return;
    unlight();
    if (e.defaultPrevented) return;
    e.preventDefault();
    const target = current();
    const files = [...e.dataTransfer!.files];
    if (target && files.length) handOver(target, files);
  });
  document.addEventListener("paste", (e) => {
    const files = [...(e.clipboardData?.files ?? [])];
    if (!files.length || e.defaultPrevented || editable(e.target)) return;
    const target = current();
    if (!target) return;
    e.preventDefault();
    handOver(target, files);
  });
}
