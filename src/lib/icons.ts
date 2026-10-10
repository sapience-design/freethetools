// Phosphor icons (MIT, phosphoricons.com), read from @phosphor-icons/core at build time and
// inlined, so pages load no icon files. Bold for interface marks; duotone for tool glyphs.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

export type Weight = "bold" | "duotone" | "fill";
const require = createRequire(import.meta.url);
const cache = new Map<string, string>();

/** The inner markup of a Phosphor icon (its paths), for a 256×256 viewBox. */
function body(name: string, weight: Weight) {
  const key = `${weight}/${name}`;
  let inner = cache.get(key);
  if (inner === undefined) {
    let svg: string;
    try {
      svg = readFileSync(require.resolve(`@phosphor-icons/core/assets/${weight}/${name}-${weight}.svg`), "utf8");
    } catch {
      throw new Error(`Icon "${name}" (${weight}) is not in Phosphor. Pick a name from phosphoricons.com.`);
    }
    inner = svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
    cache.set(key, inner);
  }
  return inner;
}

/** An icon as an SVG string. Decorative unless a label is given. */
export function icon(name: string, weight: Weight = "bold", cls = "ic", label = "") {
  const a11y = label ? `role="img" aria-label="${label.replace(/"/g, "&quot;")}"` : `aria-hidden="true"`;
  return `<svg class="${cls}" viewBox="0 0 256 256" fill="currentColor" focusable="false" ${a11y}>${body(name, weight)}</svg>`;
}
