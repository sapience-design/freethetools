// Product shots. Each tool is photographed, in drawn form, on its group's seamless paper backdrop.
// Tools that exist are the finished object (with the yellow detail); planned tools are a white
// clay prototype of their own object: "made to order". Every tool gets its own composition, so a
// shelf never repeats itself.
//
// Isometric projection: a runs down-right, b runs down-left, z is up. Light comes from the upper
// left, so top faces are lightest and right-hand faces darkest.

type Faces = { top: string; left: string; right: string };
type Palette = { paper: Faces; ink: string; line: string; accent: Faces; navy: Faces; tint: string; tint2: string; clay: boolean };

const FINISHED: Palette = {
  paper: { top: "#ffffff", left: "#eef0f2", right: "#d8dce1" },
  ink: "#25303f",
  line: "#b9c0c8",
  accent: { top: "#ffd84a", left: "#f2c200", right: "#d6aa00" },
  navy: { top: "#3b4a5e", left: "#25303f", right: "#1a2230" },
  tint: "#c9d6df",
  tint2: "#8fa3a0",
  clay: false,
};
const CLAY: Palette = {
  paper: { top: "#f8f8f6", left: "#e8e8e5", right: "#d3d4d0" },
  ink: "#b3b5b0",
  line: "#cdcec9",
  accent: { top: "#f3f3f0", left: "#e3e3df", right: "#cdcec9" },
  navy: { top: "#ebebe8", left: "#dadad6", right: "#c5c6c1" },
  tint: "#dcdcd8",
  tint2: "#c9cac5",
  clay: true,
};

// Seamless paper backdrops, one per group: [wall, floor].
const BACKDROPS: Record<string, [string, string]> = {
  pdf: ["#e7eaed", "#d2d7dc"],
  images: ["#e5e9e1", "#cfd6c9"],
  text: ["#ece8e3", "#d9d2c9"],
  data: ["#e7e5ec", "#d3d0db"],
  developer: ["#353a40", "#202328"],
  everyday: ["#f0e3dd", "#dfcac1"],
};

const W = 400, H = 300, CX = 200, GY = 204;
const SCALE = 1.26;

const P = (cx: number, cy: number) => (a: number, b: number, z: number) =>
  `${(cx + (a - b) * 0.866).toFixed(1)},${(cy + (a + b) * 0.5 - z).toFixed(1)}`;

/** An isometric box standing at ground point (cx, cy), from height z0. */
function box(cx: number, cy: number, w: number, d: number, h: number, f: Faces, z0 = 0, edge = "") {
  const p = P(cx, cy);
  const [a0, a1, b0, b1, z1] = [-w / 2, w / 2, -d / 2, d / 2, z0 + h];
  const s = edge ? ` stroke="${edge}" stroke-width="0.5" stroke-linejoin="round"` : "";
  return (
    `<polygon points="${p(a0, b1, z0)} ${p(a1, b1, z0)} ${p(a1, b1, z1)} ${p(a0, b1, z1)}" fill="${f.left}"${s}/>` +
    `<polygon points="${p(a1, b0, z0)} ${p(a1, b1, z0)} ${p(a1, b1, z1)} ${p(a1, b0, z1)}" fill="${f.right}"${s}/>` +
    `<polygon points="${p(a0, b0, z1)} ${p(a1, b0, z1)} ${p(a1, b1, z1)} ${p(a0, b1, z1)}" fill="${f.top}"${s}/>`
  );
}
/** Draw in (a, b) coordinates on a horizontal plane at height z. */
const top = (cx: number, cy: number, z: number, body: string) => `<g transform="matrix(0.866 0.5 -0.866 0.5 ${cx} ${cy - z})">${body}</g>`;
/** Draw in (a, up) coordinates on the vertical plane facing lower-left, at depth b. */
const face = (cx: number, cy: number, b: number, body: string) => `<g transform="matrix(0.866 0.5 0 -1 ${cx - b * 0.866} ${cy + b * 0.5})">${body}</g>`;

// ---- Building blocks --------------------------------------------------------------------------

function stack(c: Palette, cx: number, cy: number, n = 5, w = 96, d = 124, printed = true) {
  let s = "";
  for (let i = 0; i < n; i++) s += box(cx + [0, 2, -2, 3, -1, 1][i % 6], cy, w, d, 3.2, c.paper, i * 3.6, c.line);
  if (!printed) return s;
  const z = n * 3.6 - 0.4;
  const rows = [-44, -33, -22, -11].map((b, i) => `<rect x="-36" y="${b}" width="${i === 3 ? 44 : 70}" height="4" rx="2" fill="${c.line}"/>`).join("");
  return s + top(cx + 1, cy, z, rows + `<rect x="-36" y="4" width="70" height="30" rx="2" fill="${c.line}" opacity=".55"/>`);
}

function print(c: Palette, cx: number, cy: number, w = 96, h = 110, lean = 0) {
  const pic =
    `<rect x="${-w / 2}" y="6" width="${w}" height="${h - 6}" fill="${c.paper.left}"/>` +
    `<rect x="${-w / 2 + 8}" y="${h * 0.3}" width="${w - 16}" height="${h * 0.62}" fill="${c.tint}"/>` +
    `<circle cx="${-w * 0.18}" cy="${h * 0.76}" r="${w * 0.08}" fill="${c.accent.left}"/>` +
    `<path d="M${-w / 2 + 8} ${h * 0.3} L${-w * 0.12} ${h * 0.56} L${w * 0.06} ${h * 0.44} L${w / 2 - 8} ${h * 0.7} V${h * 0.3} Z" fill="${c.tint2}"/>`;
  return box(cx, cy, w, 12, h, c.paper, 0, c.line) + face(cx + lean, cy, 6, pic);
}

function pad(c: Palette, cx: number, cy: number, w = 92, d = 118) {
  const rows = [-44, -33, -22, -11, 0, 11].map((b, i) => `<rect x="-34" y="${b}" width="${i % 3 === 2 ? 40 : 66}" height="3.5" rx="1.75" fill="${c.line}"/>`).join("");
  return box(cx, cy, w, d, 10, c.paper, 0, c.line) + top(cx, cy, 10, rows);
}

function cube(c: Palette, cx: number, cy: number, s: number, f: Faces, label = "", color = c.ink) {
  return box(cx, cy, s, s, s, f) + (label ? top(cx, cy, s, `<text x="0" y="${s * 0.16}" text-anchor="middle" font-family="Georgia, serif" font-size="${s * 0.46}" fill="${color}">${label}</text>`) : "");
}

function cylinder(c: Palette, cx: number, cy: number, r: number, h: number, f: Faces) {
  const ry = r * 0.5;
  return (
    `<path d="M${cx - r} ${cy} V${cy - h} A${r} ${ry} 0 0 0 ${cx + r} ${cy - h} V${cy} A${r} ${ry} 0 0 1 ${cx - r} ${cy} Z" fill="${f.right}"/>` +
    `<path d="M${cx - r} ${cy} V${cy - h} A${r} ${ry} 0 0 0 ${cx} ${cy - h + ry} V${cy + ry} A${r} ${ry} 0 0 1 ${cx - r} ${cy} Z" fill="${f.left}"/>` +
    `<ellipse cx="${cx}" cy="${cy - h}" rx="${r}" ry="${ry}" fill="${f.top}"/>`
  );
}

function dial(c: Palette, cx: number, cy: number, r: number, h: number, angle = 38) {
  const ticks = Array.from({ length: 12 }, (_, i) => `<rect x="-1.5" y="${-r * 0.86}" width="3" height="${i % 3 ? 6 : 10}" rx="1.5" fill="${c.line}" transform="rotate(${i * 30})"/>`).join("");
  return cylinder(c, cx, cy, r, h, c.paper) + top(cx, cy, h, ticks + `<rect x="-3.5" y="${-r * 0.6}" width="7" height="${r * 0.6}" rx="3.5" fill="${c.accent.left}" transform="rotate(${angle})"/><circle r="7" fill="${c.navy.left}"/>`);
}

function key(c: Palette, cx: number, cy: number, s: number, glyph: string) {
  const k: Faces = c.clay ? c.paper : { top: "#f4f5f7", left: "#d9dde3", right: "#b6bcc5" };
  return box(cx, cy, s, s, s * 0.28, k) + box(cx, cy, s * 0.8, s * 0.8, s * 0.09, k, s * 0.28) +
    top(cx, cy, s * 0.37, `<text x="0" y="${s * 0.1}" text-anchor="middle" font-family="ui-monospace, monospace" font-size="${s * 0.26}" font-weight="600" fill="${c.clay ? c.line : c.accent.left}">${glyph}</text>`);
}

// ---- Compositions, one per tool ---------------------------------------------------------------

type Draw = (c: Palette) => string;
const at = (dx: number, dy = 0) => [CX + dx, GY + dy] as const;

const PIECES: Record<string, Draw> = {
  // PDF
  "pdf/compress": (c) => {
    const [x, y] = at(0);
    const z = 6 * 3.6;
    return box(x + 54, y, 12, 48, z + 30, c.accent) + stack(c, x, y, 6) + box(x + 16, y, 88, 48, 10, c.accent, z) +
      box(x + 18, y, 7, 7, 24, c.navy, z + 10) + box(x + 18, y, 46, 7, 6, c.navy, z + 34);
  },
  "merge-pdfs": (c) => { const [x, y] = at(0); return stack(c, x - 34, y - 20, 3, 80, 104, false) + stack(c, x + 34, y + 20, 3, 80, 104, false) + stack(c, x, y, 7, 88, 112); },
  "split-pdf": (c) => { const [x, y] = at(0); return stack(c, x - 44, y - 6, 4, 80, 104) + stack(c, x + 44, y + 6, 3, 80, 104, false); },
  "rotate-pages": (c) => { const [x, y] = at(0); return stack(c, x - 20, y, 3, 88, 112) + box(x + 44, y - 10, 112, 4, 88, c.paper, 0, c.line); },
  "images-to-pdf": (c) => { const [x, y] = at(0); return stack(c, x + 26, y + 10, 5, 88, 112) + print(c, x - 44, y - 30, 70, 92); },
  "pdf-to-images": (c) => { const [x, y] = at(0); return print(c, x + 40, y - 34, 64, 82) + print(c, x + 62, y - 6, 64, 82) + stack(c, x - 30, y + 14, 5, 88, 112); },
  "fill-pdf-form": (c) => { const [x, y] = at(0); return stack(c, x, y, 4) + box(x + 10, y - 6, 140, 8, 8, c.accent, 16) + box(x + 10 - 70 * 0.866 - 4, y - 6 - 70 * 0.5 - 2, 10, 8, 8, c.navy, 16); },
  // Images
  "compress-images": (c) => { const [x, y] = at(0); return print(c, x, y, 120, 70) + box(x, y, 124, 16, 8, c.accent, 70); },
  "resize-images": (c) => { const [x, y] = at(0); return print(c, x - 30, y - 12, 96, 112) + print(c, x + 56, y + 28, 56, 66); },
  "convert-image-format": (c) => { const [x, y] = at(0); return print(c, x - 24, y - 12, 88, 104) + print(c, x + 30, y + 16, 88, 104); },
  "heic-to-jpg": (c) => { const [x, y] = at(0); return box(x - 46, y - 6, 54, 10, 104, c.navy) + face(x - 46, y - 6, 5, `<rect x="-23" y="8" width="46" height="88" rx="6" fill="${c.clay ? c.paper.top : "#1f2733"}"/>`) + print(c, x + 40, y + 16, 84, 100); },
  "remove-photo-location": (c) => { const [x, y] = at(0); return print(c, x - 10, y, 96, 112) + cylinder(c, x + 58, y + 30, 12, 34, c.accent) + cylinder(c, x + 58, y + 30 - 34, 20, 20, c.accent); },
  // Text
  "word-counter": (c) => { const [x, y] = at(0); return pad(c, x, y) + box(x + 34, y - 20, 132, 8, 8, c.accent, 10) + box(x + 34 - 66 * 0.866 - 3, y - 20 - 66 * 0.5 - 2, 9, 8, 8, c.navy, 10); },
  "text-diff": (c) => { const [x, y] = at(0); return pad(c, x - 40, y - 16, 80, 104) + pad(c, x + 44, y + 18, 80, 104); },
  "case-converter": (c) => { const [x, y] = at(0); return cube(c, x - 40, y - 8, 54, c.paper, "A") + cube(c, x + 34, y + 20, 42, c.accent, "a", c.ink); },
  "markdown-to-html": (c) => { const [x, y] = at(0); return pad(c, x - 38, y - 12, 82, 106) + cube(c, x + 46, y + 22, 52, c.accent, "&lt;/&gt;", c.ink); },
  // Data
  "csv-to-json": (c) => { const [x, y] = at(0); return box(x - 30, y - 10, 104, 128, 6, c.paper, 0, c.line) + top(x - 30, y - 10, 6, [-44, -26, -8, 10, 28].map((b) => `<rect x="-44" y="${b}" width="88" height="2" fill="${c.line}"/>`).join("") + `<rect x="-14" y="-52" width="2" height="104" fill="${c.line}"/>`) + cube(c, x + 60, y + 30, 48, c.accent, "{ }", c.ink); },
  "json-formatter": (c) => { const [x, y] = at(0); return cube(c, x - 36, y + 6, 58, c.paper, "{", c.ink) + cube(c, x + 40, y + 6, 58, c.accent, "}", c.ink); },
  // Developer
  base64: (c) => { const [x, y] = at(0); return key(c, x, y, 118, "b64"); },
  "hash-generator": (c) => { const [x, y] = at(0); return key(c, x, y, 118, "#"); },
  "qr-code-maker": (c) => {
    const [x, y] = at(0);
    const cells = [[0, 0], [1, 0], [0, 1], [3, 0], [4, 1], [2, 2], [1, 3], [3, 3], [4, 4], [0, 4], [2, 4], [4, 2]].map(([i, j]) => `<rect x="${-40 + i * 16}" y="${-40 + j * 16}" width="14" height="14" fill="${c.clay ? c.line : "#1f2733"}"/>`).join("");
    return box(x, y, 112, 112, 12, c.paper, 0, c.line) + top(x, y, 12, cells + `<rect x="-40" y="-40" width="30" height="30" fill="none" stroke="${c.clay ? c.line : c.accent.left}" stroke-width="5"/>`);
  },
  "password-generator": (c) => { const [x, y] = at(0); return key(c, x, y, 118, "•••"); },
  "jwt-decoder": (c) => { const [x, y] = at(0); return key(c, x, y, 118, "JWT"); },
  "regex-tester": (c) => { const [x, y] = at(0); return key(c, x, y, 118, ".*"); },
  "uuid-generator": (c) => { const [x, y] = at(0); return cylinder(c, x - 40, y - 12, 30, 16, c.paper) + cylinder(c, x - 40, y - 28, 30, 16, c.paper) + cylinder(c, x + 30, y + 16, 30, 16, c.accent) + cylinder(c, x + 30, y, 30, 16, c.paper); },
  // Everyday
  "unit-converter": (c) => { const [x, y] = at(0); return box(x, y, 176, 34, 8, c.accent) + top(x, y, 8, Array.from({ length: 17 }, (_, i) => `<rect x="${-84 + i * 10.5}" y="-17" width="2" height="${i % 4 ? 8 : 14}" fill="${c.ink}"/>`).join("")) + cube(c, x + 10, y - 44, 40, c.paper); },
  "time-zone-converter": (c) => { const [x, y] = at(0); return dial(c, x - 46, y - 10, 46, 30, -40) + dial(c, x + 46, y + 18, 46, 30, 70); },
  "file-converter": (c) => { const [x, y] = at(0); return stack(c, x - 64, y - 14, 3, 64, 84, false) + box(x, y, 56, 70, 52, c.navy) + box(x, y, 62, 76, 8, c.accent, 52) + print(c, x + 62, y + 24, 62, 76); },
};

// Group fallbacks for tools that don't have their own composition yet.
const GROUP: Record<string, Draw> = {
  pdf: (c) => stack(c, ...at(0)),
  images: (c) => print(c, ...at(0)),
  text: (c) => pad(c, ...at(0)),
  data: (c) => { const [x, y] = at(0); return box(x - 44, y + 22, 38, 38, 52, c.paper, 0, c.line) + box(x, y, 38, 38, 92, c.accent) + box(x + 44, y - 22, 38, 38, 70, c.paper, 0, c.line); },
  developer: (c) => key(c, ...at(0), 118, "&lt;/&gt;"),
  everyday: (c) => dial(c, ...at(0), 62, 40),
};

export const slugOf = (name: string) => name.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function frame(id: string, group: string, body: string) {
  const [wall, floor] = BACKDROPS[group] ?? BACKDROPS.pdf;
  const dark = group === "developer";
  return (
    `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" preserveAspectRatio="xMidYMid slice"><defs>` +
    `<linearGradient id="${id}bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${wall}"/><stop offset=".55" stop-color="${wall}"/><stop offset="1" stop-color="${floor}"/></linearGradient>` +
    `<radialGradient id="${id}glow" cx=".3" cy=".2" r=".85"><stop offset="0" stop-color="#fff" stop-opacity="${dark ? 0.07 : 0.5}"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>` +
    `<radialGradient id="${id}sh" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#000" stop-opacity="${dark ? 0.5 : 0.26}"/><stop offset=".55" stop-color="#000" stop-opacity="${dark ? 0.18 : 0.09}"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>` +
    `</defs>` +
    `<rect width="${W}" height="${H}" fill="url(#${id}bg)"/><rect width="${W}" height="${H}" fill="url(#${id}glow)"/>` +
    `<ellipse cx="${CX + 40}" cy="${GY + 58}" rx="170" ry="40" fill="url(#${id}sh)" opacity=".75"/>` +
    `<ellipse cx="${CX + 6}" cy="${GY + 46}" rx="120" ry="30" fill="url(#${id}sh)"/>` +
    `<g class="obj"><g transform="translate(${CX} ${GY}) scale(${SCALE}) translate(${-CX} ${-GY})">${body}</g></g>` +
    `</svg>`
  );
}

/** A finished tool's product shot. */
export function artFor(toolId: string, category: string, id: string, name = "") {
  const draw = PIECES[toolId] ?? (name ? PIECES[slugOf(name)] : undefined) ?? PIECES[toolId.split("/")[1] ?? ""] ?? GROUP[category] ?? GROUP.pdf;
  return frame(id, category, draw(FINISHED));
}

/** A planned tool, as a clay prototype of its own object. */
export function prototypeFor(name: string, category: string, id: string) {
  const draw = PIECES[slugOf(name)] ?? GROUP[category] ?? GROUP.pdf;
  return frame(id, category, draw(CLAY));
}
