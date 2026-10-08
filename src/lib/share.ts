// Share a result through the device's own share menu (email, messages, AirDrop, Nearby Share,
// save to Files). The Web Share API hands the file to the operating system; the page sends
// nothing anywhere. Where the browser can't share a given file, no button is shown.
import "./share.css";
import { blobOfUrl } from "../agent/blob-capture.js";
import { detectType } from "../agent/contract.js";

const SVG = "http://www.w3.org/2000/svg";
const FAILED = "Sharing didn't work. Download still does.";

type Nav = Navigator & { canShare?: (data: ShareData) => boolean; share?: (data: ShareData) => Promise<void> };

/** Can this browser share a file of this name and type? Asked per file: browsers allow only some types. */
export function canShareFile(name: string, type: string): boolean {
  try {
    const nav = navigator as Nav;
    if (typeof nav.share !== "function" || typeof nav.canShare !== "function") return false;
    return nav.canShare({ files: [new File([], name, { type })] }) === true;
  } catch {
    return false;
  }
}

const typeOf = (blob: Blob | undefined, name: string) => blob?.type || detectType(new Uint8Array(0), name);

function icon() {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const path = document.createElementNS(SVG, "path");
  // Three joined nodes: the common "share" mark.
  path.setAttribute("d", "M11.5 5.2a1.9 1.9 0 1 0 0-3.8 1.9 1.9 0 0 0 0 3.8ZM4.5 9.9a1.9 1.9 0 1 0 0-3.8 1.9 1.9 0 0 0 0 3.8ZM11.5 14.6a1.9 1.9 0 1 0 0-3.8 1.9 1.9 0 0 0 0 3.8ZM6.2 7.1l3.6-2M6.2 8.9l3.6 2");
  svg.append(path);
  return svg;
}

export type ShareHooks = {
  /** Tell the person, in a live region. */
  say?: (message: string) => void;
  /** Called after the file was handed to the share menu. */
  onShared?: () => void;
};

export type ShareButton = HTMLButtonElement & { note?: HTMLElement };

/**
 * A Share button for one file. `get` returns the bytes when the button is pressed. Returns null
 * where the browser can't share this file. navigator.share must run inside the click, so the only
 * thing awaited before it is `get`.
 */
export function shareButton(
  name: string,
  type: string,
  get: () => Promise<Blob | undefined> | Blob | undefined,
  hooks: ShareHooks = {},
): ShareButton | null {
  if (!canShareFile(name, type)) return null;
  const b = document.createElement("button") as ShareButton;
  b.type = "button";
  b.className = "btn line share-btn";
  b.setAttribute("aria-label", `Share ${name}`);
  const label = document.createElement("span");
  label.textContent = "Share";
  b.append(icon(), label);
  b.addEventListener("click", async () => {
    b.note?.remove();
    b.note = undefined;
    const fail = (message: string) => {
      hooks.say?.(message);
      const note = document.createElement("span");
      note.className = "muted share-note";
      note.textContent = message;
      b.after(note);
      b.note = note;
    };
    let file: File;
    try {
      const blob = await get();
      if (!blob) { fail(`${name} is no longer available. ${FAILED}`); return; }
      file = new File([blob], name, { type: type || blob.type });
    } catch {
      fail(FAILED);
      return;
    }
    try {
      await (navigator as Nav).share!({ files: [file], title: name });
    } catch (e) {
      if ((e as DOMException)?.name === "AbortError") return; // the person closed the menu
      fail(FAILED);
      return;
    }
    hooks.onShared?.();
  });
  return b;
}

/** The first live region on the page, for messages. */
export function liveRegion(preferred?: string): ((message: string) => void) {
  return (message) => {
    const el = (preferred && document.getElementById(preferred)) || document.querySelector<HTMLElement>('[role="status"]');
    if (el) { el.textContent = ""; setTimeout(() => { el.textContent = message; }, 50); }
  };
}

/**
 * Put one Share button after every a[download] under `root` whose link is a blob: URL the page
 * made. Follows links as they are added, changed and removed, so tool code needs no changes.
 * `onShared` gets the link whose file was shared.
 */
export function watchShare(root: Element, hooks: { say?: (m: string) => void; onShared?: (link: HTMLAnchorElement) => void } = {}) {
  if (typeof (navigator as Nav).share !== "function" || typeof (navigator as Nav).canShare !== "function") return;
  const buttons = new Map<HTMLAnchorElement, { btn: ShareButton; href: string; name: string }>();

  const drop = (a: HTMLAnchorElement) => {
    const had = buttons.get(a);
    if (!had) return;
    had.btn.note?.remove();
    had.btn.remove();
    buttons.delete(a);
  };

  const sync = (a: HTMLAnchorElement) => {
    const href = a.getAttribute("href") || "";
    const name = a.getAttribute("download") || "download";
    const had = buttons.get(a);
    if (had && had.href === href && had.name === name && had.btn.isConnected) return;
    drop(a);
    if (!href.startsWith("blob:")) return;
    const blob = blobOfUrl(href);
    if (!blob) return;
    const btn = shareButton(name, typeOf(blob, name), () => blobOfUrl(a.getAttribute("href") || "") ?? blob, {
      say: hooks.say,
      onShared: () => hooks.onShared?.(a),
    });
    if (!btn) return;
    a.after(btn);
    buttons.set(a, { btn, href, name });
  };

  const sweep = () => {
    for (const a of [...buttons.keys()]) if (!a.isConnected) drop(a);
    root.querySelectorAll<HTMLAnchorElement>("a[download]").forEach(sync);
  };
  new MutationObserver(sweep).observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["href", "download"] });
  sweep();
}
