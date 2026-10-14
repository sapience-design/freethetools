// The small "view full screen" button on every preview, and the description of what the viewer
// shows. The viewer itself (src/lib/viewer.ts) loads only when someone presses a button, so pages
// that never open it do not carry it. Everything stays in the browser.
import { txt } from "./ui";

/** What the full-screen viewer can show. A list of items is browsed with Previous and Next. */
export type ViewItem =
  | { kind: "image"; blob: Blob; name: string }
  | { kind: "compare"; before: Blob; after: Blob; name: string; beforeLabel?: string; afterLabel?: string }
  | { kind: "media"; blob: Blob; name: string }
  | {
      kind: "pdf";
      name: string;
      pages: number;
      /** First page to show (1-based). */
      page?: number;
      /**
       * Draw one page to fit inside boxW x boxH device pixels (never more than 4096 on a side).
       * Called for pages on screen only. `signal` stops a drawing that is no longer needed.
       */
      render: (page: number, boxW: number, boxH: number, signal?: AbortSignal) => Promise<HTMLCanvasElement | null>;
      /**
       * The PDF itself. With it the viewer shows an Edit button (text, boxes, highlights, drawing, a
       * signature). Give the unlocked bytes when a tool unlocked the file.
       */
      file?: Blob;
      /**
       * Where a saved copy goes. Without it the viewer downloads "<name>-edited.pdf". With it the
       * host decides (the View and edit PDF page shows the copy and offers its download).
       */
      onSave?: (blob: Blob, name: string) => void;
    };

// Words come from the viewer's own block (see ViewerDialog.astro); English is the fallback.
export const V = (key: string, fallback: string, vars: Record<string, string | number> = {}) => txt(key, fallback, vars, "ftt-viewer");

// Phosphor "arrows-out" (MIT).
const ARROWS_OUT = '<svg class="ic" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true" focusable="false"><path d="M220,48V96a12,12,0,0,1-24,0V77l-35.51,35.52a12,12,0,0,1-17-17L179,60H160a12,12,0,0,1,0-24h48A12,12,0,0,1,220,48ZM95.51,143.51,60,179V160a12,12,0,0,0-24,0v48a12,12,0,0,0,12,12H96a12,12,0,0,0,0-24H77l35.52-35.51a12,12,0,0,0-17-17ZM208,148a12,12,0,0,0-12,12v19l-35.51-35.52a12,12,0,0,0-17,17L179,196H160a12,12,0,0,0,0,24h48a12,12,0,0,0,12-12V160A12,12,0,0,0,208,148ZM77,60H96a12,12,0,0,0,0-24H48A12,12,0,0,0,36,48V96a12,12,0,0,0,24,0V77l35.51,35.52a12,12,0,0,0,17-17Z"/></svg>'; // safe-html: a fixed icon, no outside text

/** Open the viewer on `items`, starting at `index`. `opener` gets focus back when it closes. `edit` opens a PDF that carries its file straight in edit mode. */
export async function openViewer(items: ViewItem[], index = 0, opener?: HTMLElement | null, opts: { edit?: boolean } = {}) {
  const { show } = await import("./viewer");
  show(items, index, opener ?? (document.activeElement as HTMLElement | null), opts);
}

/** The button text for what is being shown: "View page 3 full screen", "View photo full screen". */
export const viewLabel = (what: "page" | "photo" | "video" | "sound" | "comparison" | "code", n?: number) =>
  what === "page" ? V("viewPage", "View page {n} full screen", { n: n ?? 1 })
  : what === "video" ? V("viewVideo", "View video full screen")
  : what === "sound" ? V("viewSound", "Open the player full screen")
  : what === "comparison" ? V("viewCompare", "View the comparison full screen")
  : what === "code" ? V("viewCode", "Show the code full screen")
  : V("viewPhoto", "View photo full screen");

/** A round expand button. It looks like part of the preview and is at least 44 px square to press. */
export function viewButton(label: string, items: () => ViewItem[] | ViewItem | Promise<ViewItem[] | ViewItem>, index = 0) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "fv-open";
  b.setAttribute("aria-label", label);
  b.innerHTML = ARROWS_OUT; // safe-html: a fixed icon, no outside text
  b.addEventListener("click", async (e) => {
    e.stopPropagation();
    const got = await items();
    openViewer(Array.isArray(got) ? got : [got], index, b);
  });
  return b;
}

/**
 * Wrap a preview (a thumbnail, a picture, a player) so it carries the expand button. The button
 * shows on hover and focus on a mouse screen, and always on a touch screen.
 */
export function viewable(el: HTMLElement, label: string, items: () => ViewItem[] | ViewItem | Promise<ViewItem[] | ViewItem>, index = 0) {
  const wrap = document.createElement("span");
  wrap.className = "pv";
  const btn = viewButton(label, items, index);
  wrap.append(el, btn);
  return Object.assign(wrap, { button: btn });
}

/** A labelled "Full screen" button for places that have room for text, such as a result row's buttons. */
export function viewTextButton(label: string, items: () => ViewItem[] | ViewItem | Promise<ViewItem[] | ViewItem>) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "btn quiet small fv-text";
  b.setAttribute("aria-label", label);
  b.innerHTML = ARROWS_OUT + "<span></span>"; // safe-html: a fixed icon, no outside text
  b.lastElementChild!.textContent = V("fullscreen", "Full screen");
  b.addEventListener("click", async () => {
    const got = await items();
    openViewer(Array.isArray(got) ? got : [got], 0, b);
  });
  return b;
}
