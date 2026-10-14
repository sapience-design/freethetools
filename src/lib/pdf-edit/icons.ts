// The Phosphor icons (MIT) the editor draws by script. The pages inline their icons at build time
// (src/lib/icons.ts); the editor loads late, so it brings its own few, as text, with its code.
import cursor from "@phosphor-icons/core/assets/bold/cursor-bold.svg?raw";
import textT from "@phosphor-icons/core/assets/bold/text-t-bold.svg?raw";
import rectangle from "@phosphor-icons/core/assets/bold/rectangle-bold.svg?raw";
import highlighter from "@phosphor-icons/core/assets/bold/highlighter-circle-bold.svg?raw";
import scribble from "@phosphor-icons/core/assets/bold/scribble-bold.svg?raw";
import signature from "@phosphor-icons/core/assets/bold/signature-bold.svg?raw";
import undo from "@phosphor-icons/core/assets/bold/arrow-counter-clockwise-bold.svg?raw";
import redo from "@phosphor-icons/core/assets/bold/arrow-clockwise-bold.svg?raw";
import trash from "@phosphor-icons/core/assets/bold/trash-bold.svg?raw";
import floppy from "@phosphor-icons/core/assets/bold/floppy-disk-bold.svg?raw";
import pencil from "@phosphor-icons/core/assets/bold/pencil-simple-bold.svg?raw";
import minus from "@phosphor-icons/core/assets/bold/minus-bold.svg?raw";
import plus from "@phosphor-icons/core/assets/bold/plus-bold.svg?raw";
import sliders from "@phosphor-icons/core/assets/bold/sliders-horizontal-bold.svg?raw";
import image from "@phosphor-icons/core/assets/bold/image-bold.svg?raw";

const ICONS = { cursor, textT, rectangle, highlighter, scribble, signature, undo, redo, trash, floppy, pencil, minus, plus, sliders, image };
export type IconName = keyof typeof ICONS;

/** An icon as an SVG string, decorative. Only fixed icons from this file, never outside text. */
export function ic(name: IconName): string {
  const inner = ICONS[name].replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
  return `<svg class="ic" viewBox="0 0 256 256" fill="currentColor" focusable="false" aria-hidden="true">${inner}</svg>`;
}
