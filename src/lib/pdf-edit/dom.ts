// Small helpers to build the editor's markup by script. Text only ever goes in through
// textContent and attributes, never as HTML; icons are the one exception and are fixed (icons.ts).
import { ic, type IconName } from "./icons";

type Attrs = Record<string, string | number | boolean | undefined>;

/** Make an element: class names, text and attributes. `true` sets an attribute with no value. */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = "", attrs: Attrs = {}): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== false) e.setAttribute(k, v === true ? "" : String(v));
  return e;
}

/** A decorative icon in its own span. */
export function icon(name: IconName): HTMLSpanElement {
  const s = el("span", "fv-i");
  s.setAttribute("aria-hidden", "true");
  s.innerHTML = ic(name); // safe-html: a fixed icon from icons.ts, no outside text
  return s;
}

/** A button with an optional icon and a label. */
export function button(cls: string, label: string, name?: IconName, attrs: Attrs = {}): HTMLButtonElement {
  const b = el("button", cls, "", { type: "button", ...attrs });
  if (name) b.append(icon(name));
  if (label) b.append(el("span", "fv-cap", label));
  return b;
}
