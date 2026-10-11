// Colour Converter: read a colour in any common form, write it as HEX, RGB and HSL, find the nearest
// CSS name, and work out the WCAG contrast against white and black. No page code here.

// The 148 CSS named colours (CSS Color Module Level 4), as "name:rrggbb". The preferred spelling of
// a pair (gray, cyan, magenta) comes first, so that is the name the nearest-name search reports.
const NAMED = `aliceblue:f0f8ff antiquewhite:faebd7 aquamarine:7fffd4 azure:f0ffff beige:f5f5dc bisque:ffe4c4 black:000000
blanchedalmond:ffebcd blue:0000ff blueviolet:8a2be2 brown:a52a2a burlywood:deb887 cadetblue:5f9ea0 chartreuse:7fff00
chocolate:d2691e coral:ff7f50 cornflowerblue:6495ed cornsilk:fff8dc crimson:dc143c cyan:00ffff darkblue:00008b darkcyan:008b8b
darkgoldenrod:b8860b darkgray:a9a9a9 darkgreen:006400 darkgrey:a9a9a9 darkkhaki:bdb76b darkmagenta:8b008b darkolivegreen:556b2f
darkorange:ff8c00 darkorchid:9932cc darkred:8b0000 darksalmon:e9967a darkseagreen:8fbc8f darkslateblue:483d8b darkslategray:2f4f4f
darkslategrey:2f4f4f darkturquoise:00ced1 darkviolet:9400d3 deeppink:ff1493 deepskyblue:00bfff dimgray:696969 dimgrey:696969
dodgerblue:1e90ff firebrick:b22222 floralwhite:fffaf0 forestgreen:228b22 gainsboro:dcdcdc ghostwhite:f8f8ff gold:ffd700
goldenrod:daa520 gray:808080 grey:808080 green:008000 greenyellow:adff2f honeydew:f0fff0 hotpink:ff69b4 indianred:cd5c5c
indigo:4b0082 ivory:fffff0 khaki:f0e68c lavender:e6e6fa lavenderblush:fff0f5 lawngreen:7cfc00 lemonchiffon:fffacd lightblue:add8e6
lightcoral:f08080 lightcyan:e0ffff lightgoldenrodyellow:fafad2 lightgray:d3d3d3 lightgreen:90ee90 lightgrey:d3d3d3 lightpink:ffb6c1
lightsalmon:ffa07a lightseagreen:20b2aa lightskyblue:87cefa lightslategray:778899 lightslategrey:778899 lightsteelblue:b0c4de
lightyellow:ffffe0 lime:00ff00 limegreen:32cd32 linen:faf0e6 magenta:ff00ff maroon:800000 mediumaquamarine:66cdaa mediumblue:0000cd
mediumorchid:ba55d3 mediumpurple:9370db mediumseagreen:3cb371 mediumslateblue:7b68ee mediumspringgreen:00fa9a mediumturquoise:48d1cc
mediumvioletred:c71585 midnightblue:191970 mintcream:f5fffa mistyrose:ffe4e1 moccasin:ffe4b5 navajowhite:ffdead navy:000080
oldlace:fdf5e6 olive:808000 olivedrab:6b8e23 orange:ffa500 orangered:ff4500 orchid:da70d6 palegoldenrod:eee8aa palegreen:98fb98
paleturquoise:afeeee palevioletred:db7093 papayawhip:ffefd5 peachpuff:ffdab9 peru:cd853f pink:ffc0cb plum:dda0dd powderblue:b0e0e6
purple:800080 rebeccapurple:663399 red:ff0000 rosybrown:bc8f8f royalblue:4169e1 saddlebrown:8b4513 salmon:fa8072 sandybrown:f4a460
seagreen:2e8b57 seashell:fff5ee sienna:a0522d silver:c0c0c0 skyblue:87ceeb slateblue:6a5acd slategray:708090 slategrey:708090
snow:fffafa springgreen:00ff7f steelblue:4682b4 tan:d2b48c teal:008080 thistle:d8bfd8 tomato:ff6347 turquoise:40e0d0 violet:ee82ee
wheat:f5deb3 white:ffffff whitesmoke:f5f5f5 yellow:ffff00 yellowgreen:9acd32 aqua:00ffff fuchsia:ff00ff`;

/** @type {Record<string, [number, number, number]>} */
export const CSS_COLOURS = Object.fromEntries(
  NAMED.split(/\s+/).map((entry) => {
    const [name, hex] = entry.split(":");
    return [name, [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)]];
  }),
);

export const ACCEPTED = "HEX (#f80, #ff8800 or #ff880080), rgb(255 136 0), hsl(32 100% 50%) or a CSS colour name such as rebeccapurple";

const bad = () => new Error(`I can't read that as a colour. Use ${ACCEPTED}.`);
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const NUM = "[+-]?(?:\\d+\\.?\\d*|\\.\\d+)(?:e[+-]?\\d+)?";

/** A number, or a percentage of `full`. Returns null when it is neither. */
function channel(text, full) {
  const m = new RegExp(`^(${NUM})(%?)$`, "i").exec(text);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return m[2] ? (n / 100) * full : n;
}

function alphaOf(text) {
  if (text === undefined) return 1;
  const a = channel(text, 1);
  if (a === null) throw bad();
  return clamp(a, 0, 1);
}

/** A percentage written with its % sign, as a number. Returns null otherwise. */
function percent(text) {
  return text.endsWith("%") ? channel(text, 100) : null;
}

/** Split the inside of rgb(...) or hsl(...) into parts, in the comma form or the space and slash form. */
function parts(inside) {
  const s = inside.trim();
  let list;
  if (s.includes(",")) {
    if (s.includes("/")) throw bad();
    list = s.split(",").map((p) => p.trim());
  } else {
    const [main, slash, ...extra] = s.split("/");
    if (extra.length) throw bad();
    list = main.trim().split(/\s+/);
    if (slash !== undefined) list.push(slash.trim());
  }
  if (list.length < 3 || list.length > 4 || list.some((p) => p === "")) throw bad();
  return list;
}

/**
 * Read a colour written in a common form.
 * @param {string} input
 * @returns {{r: number, g: number, b: number, a: number}} r, g and b from 0 to 255, a from 0 to 1
 */
export function parseColour(input) {
  if (typeof input !== "string") throw new TypeError("Expected text");
  const s = input.trim().toLowerCase();
  if (!s) throw bad();

  if (s === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  if (Object.hasOwn(CSS_COLOURS, s)) {
    const [r, g, b] = CSS_COLOURS[s];
    return { r, g, b, a: 1 };
  }

  const hex = /^#?([0-9a-f]+)$/.exec(s)?.[1];
  if (hex && [3, 4, 6, 8].includes(hex.length)) {
    const full = hex.length <= 4 ? [...hex].map((c) => c + c).join("") : hex;
    const v = (i) => parseInt(full.slice(i, i + 2), 16);
    return { r: v(0), g: v(2), b: v(4), a: full.length === 8 ? v(6) / 255 : 1 };
  }

  const fn = /^(rgba?|hsla?)\(([^()]*)\)$/.exec(s);
  if (!fn) throw bad();
  const p = parts(fn[2]);
  const a = alphaOf(p[3]);
  if (fn[1].startsWith("rgb")) {
    const rgb = p.slice(0, 3).map((x) => channel(x, 255));
    if (rgb.includes(null)) throw bad();
    const [r, g, b] = rgb.map((n) => clamp(n, 0, 255));
    return { r, g, b, a };
  }
  const h = new RegExp(`^(${NUM})(deg|grad|rad|turn)?$`, "i").exec(p[0]);
  const sat = percent(p[1]);
  const lig = percent(p[2]);
  if (!h || sat === null || lig === null) throw bad();
  const unit = { deg: 1, grad: 0.9, rad: 180 / Math.PI, turn: 360 }[h[2] || "deg"];
  return hslToRgb(parseFloat(h[1]) * unit, clamp(sat, 0, 100), clamp(lig, 0, 100), a);
}

function hslToRgb(h, s, l, a) {
  const hue = ((h % 360) + 360) % 360;
  const sat = s / 100;
  const lig = l / 100;
  const k = (n) => (n + hue / 30) % 12;
  const f = (n) => lig - sat * Math.min(lig, 1 - lig) * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return { r: f(0) * 255, g: f(8) * 255, b: f(4) * 255, a };
}

function rgbToHsl({ r, g, b }) {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const d = max - min;
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    if (max === R) h = ((G - B) / d + 6) % 6;
    else if (max === G) h = (B - R) / d + 2;
    else h = (R - G) / d + 4;
  }
  return { h: h * 60, s: s * 100, l: l * 100 };
}

const byte = (n) => clamp(Math.round(n), 0, 255);
const hex2 = (n) => byte(n).toString(16).padStart(2, "0");
/** Alpha with at most two decimals and no trailing zeros: 0.5, 0.25, 1. */
const alphaText = (a) => String(+a.toFixed(2));

export function toHex({ r, g, b, a }) {
  return `#${hex2(r)}${hex2(g)}${hex2(b)}${a < 1 ? hex2(a * 255) : ""}`;
}

export function toRgb({ r, g, b, a }) {
  const [R, G, B] = [r, g, b].map(byte);
  return a < 1 ? `rgba(${R}, ${G}, ${B}, ${alphaText(a)})` : `rgb(${R}, ${G}, ${B})`;
}

export function toHsl(c) {
  const { h, s, l } = rgbToHsl({ r: byte(c.r), g: byte(c.g), b: byte(c.b) });
  const text = `${Math.round(h) % 360}, ${Math.round(s)}%, ${Math.round(l)}%`;
  return c.a < 1 ? `hsla(${text}, ${alphaText(c.a)})` : `hsl(${text})`;
}

/** The nearest CSS name by "redmean" distance in RGB, which tracks how the eye sees colour better than plain RGB distance. */
export function nearestName({ r, g, b }) {
  let best = { name: "", dist: Infinity, rgb: [0, 0, 0] };
  for (const [name, rgb] of Object.entries(CSS_COLOURS)) {
    const rm = (r + rgb[0]) / 2;
    const dr = r - rgb[0];
    const dg = g - rgb[1];
    const db = b - rgb[2];
    const dist = (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;
    if (dist < best.dist) best = { name, dist, rgb };
  }
  const exact = best.rgb[0] === byte(r) && best.rgb[1] === byte(g) && best.rgb[2] === byte(b);
  return { name: best.name, exact, hex: toHex({ r: best.rgb[0], g: best.rgb[1], b: best.rgb[2], a: 1 }) };
}

const linear = (v) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = ({ r, g, b }) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);

/**
 * WCAG 2 contrast ratio of a colour against an opaque background. A see-through colour is first laid
 * over that background. The ratio is cut (not rounded) to two decimals, so 4.499 never shows as 4.5.
 */
export function contrast(c, background) {
  const over = { r: c.r * c.a + background.r * (1 - c.a), g: c.g * c.a + background.g * (1 - c.a), b: c.b * c.a + background.b * (1 - c.a) };
  const [hi, lo] = [luminance(over), luminance(background)].sort((x, y) => y - x);
  const ratio = (hi + 0.05) / (lo + 0.05);
  return { ratio: Math.floor(ratio * 100 + 1e-9) / 100, normalText: ratio >= 4.5, largeText: ratio >= 3 };
}

/**
 * Everything the page and the agent show for one colour.
 * @param {string} input
 */
export function convertColour(input) {
  const c = parseColour(input);
  const near = nearestName(c);
  return {
    hex: toHex(c),
    rgb: toRgb(c),
    hsl: toHsl(c),
    alpha: +c.a.toFixed(4),
    name: near.name,
    nameIsExact: near.exact,
    nameHex: near.hex,
    contrastWithWhite: contrast(c, { r: 255, g: 255, b: 255 }),
    contrastWithBlack: contrast(c, { r: 0, g: 0, b: 0 }),
  };
}
