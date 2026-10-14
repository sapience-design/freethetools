// Image to SVG: trace a picture into coloured shapes. The tracing itself runs in worker.js; this
// file holds the choices (presets, colours, detail), the size limit, and the check that the SVG
// we hand back holds nothing but shapes.

/** Pictures with a longer side than this are shrunk before tracing. */
export const MAX_SIDE = 1200;
export const MIN_COLOURS = 2;
export const MAX_COLOURS = 32;

/** The three presets. Each one sets the starting number of colours and level of detail. */
export const PRESETS = {
  logo: { label: "Logo or icon", note: "Few colours, smooth curves", colours: 8, detail: "medium" },
  illustration: { label: "Illustration", note: "More colours, more detail", colours: 24, detail: "high" },
  bw: { label: "Black and white", note: "Two colours, like a stencil", colours: 2, detail: "medium" },
};

/**
 * What each detail level means for the tracer. "ltres" and "qtres" are how far a line or curve may
 * stray from the picture's edge, in pixels; "pathomit" drops shapes with fewer edge points than this.
 */
export const DETAIL = {
  low: { ltres: 2, qtres: 2, pathomit: 24 },
  medium: { ltres: 1, qtres: 1, pathomit: 10 },
  high: { ltres: 0.5, qtres: 0.5, pathomit: 3 },
};

/** A whole number from 2 to 32; anything else becomes the fallback. */
export function clampColours(value, fallback = PRESETS.logo.colours) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(MAX_COLOURS, Math.max(MIN_COLOURS, n));
}

/** The size a picture is traced at: never larger than MAX_SIDE on its long side. */
export function traceSize(width, height, max = MAX_SIDE) {
  const k = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)), shrunk: k < 1 };
}

/**
 * The options handed to the tracer for a choice. Black and white fixes the palette to black and
 * white; the other presets let the tracer pick `colours` colours from the picture.
 */
export function traceOptions({ preset = "logo", colours, detail } = {}) {
  const p = PRESETS[preset] ?? PRESETS.logo;
  const d = DETAIL[detail] ?? DETAIL[p.detail];
  const base = { ...d, rightangleenhance: true, colorsampling: 2, colorquantcycles: 3, mincolorratio: 0, layering: 0, strokewidth: 1, roundcoords: 1, blurradius: 0, desc: false };
  if (preset === "bw") {
    // One cycle only: later cycles would replace the palette with the average colour of each group.
    return { ...base, colorquantcycles: 1, numberofcolors: 2, pal: [{ r: 0, g: 0, b: 0, a: 255 }, { r: 255, g: 255, b: 255, a: 255 }] };
  }
  return { ...base, numberofcolors: clampColours(colours, p.colours) };
}

/** "logo.PNG" -> "logo.svg" */
export function svgName(name) {
  return `${name.replace(/\.(jpe?g|png|webp|avif|gif|bmp|tiff?|ico|svg)$/i, "")}.svg`;
}

const SVG_NS = "http://www.w3.org/2000/svg";
// Each element we write, with the attributes it may have and the shape each value must take.
const NUMBER = /^\d+(\.\d+)?$/;
const ALLOWED = {
  svg: {
    xmlns: (v) => v === SVG_NS,
    width: (v) => NUMBER.test(v),
    height: (v) => NUMBER.test(v),
    viewBox: (v) => /^0 0 \d+(\.\d+)? \d+(\.\d+)?$/.test(v),
  },
  path: {
    fill: (v) => /^rgb\(\d{1,3},\d{1,3},\d{1,3}\)$/.test(v),
    stroke: (v) => /^rgb\(\d{1,3},\d{1,3},\d{1,3}\)$/.test(v),
    "stroke-width": (v) => NUMBER.test(v),
    opacity: (v) => /^[01](\.\d+)?$/.test(v),
    d: (v) => /^[MLQZ0-9 .\-]*$/.test(v),
  },
};

/**
 * Is this SVG nothing but one <svg> holding <path> shapes? It allows no text, no scripts, no links,
 * no styles and no other attributes, and the only web address it may hold is the SVG namespace.
 * Used on every file before it is offered for download.
 */
export function isSafeSvg(svg) {
  if (typeof svg !== "string" || !svg.startsWith("<svg ")) return false;
  const tag = /<(\/?)([A-Za-z][\w:-]*)((?:\s+[\w:-]+="[^"<>&]*")*)\s*(\/?)>/y;
  let pos = 0, depth = 0, roots = 0;
  while (pos < svg.length) {
    if (svg[pos] !== "<") return false; // text, or anything else between tags
    tag.lastIndex = pos;
    const m = tag.exec(svg);
    if (!m) return false;
    const [whole, closing, name, attrs, selfClose] = m;
    const rules = ALLOWED[name];
    if (!rules) return false;
    if (closing) {
      if (attrs.trim() || selfClose || name !== "svg" || depth !== 1) return false;
      depth--;
    } else {
      if (name === "svg" ? depth !== 0 || roots++ : depth !== 1 || !selfClose) return false;
      const seen = new Set();
      for (const [, key, value] of attrs.matchAll(/([\w:-]+)="([^"]*)"/g)) {
        if (seen.has(key) || !rules[key]?.(value)) return false;
        seen.add(key);
      }
      if (name === "svg") depth++;
    }
    pos += whole.length;
  }
  return depth === 0 && roots === 1;
}
