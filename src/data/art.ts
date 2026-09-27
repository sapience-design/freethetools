// "Product shots": each tool group is drawn as an object on a studio backdrop with a floor shadow.
// A tool can ship its own art.svg (same 400x500 frame) to replace its group's object.
// `id` keeps gradient ids unique when several shots share a page.

const shadow = (id: string, cx = 200, cy = 392, rx = 120) =>
  `<radialGradient id="${id}s" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#000" stop-opacity=".22"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>` +
  `</defs><ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="14" fill="url(#${id}s)"/>`;

const frame = (defs: string, body: string) =>
  `<svg viewBox="0 0 400 500" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs>${defs}${body}</svg>`;

const paper = (id: string) =>
  `<linearGradient id="${id}p" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e4e5e7"/></linearGradient>`;

export const ART: Record<string, (id: string) => string> = {
  pdf: (id) =>
    frame(
      paper(id) + shadow(id),
      `<g transform="translate(200 250) rotate(-8)"><rect x="-82" y="-118" width="164" height="226" rx="4" fill="#d9dbde"/></g>` +
        `<g transform="translate(200 240) rotate(3)"><path d="M-80 -120h118l42 42v186h-160z" fill="url(#${id}p)"/><path d="M38 -120v42h42z" fill="#cfd2d6"/>` +
        `<g fill="#c3c7cc"><rect x="-56" y="-60" width="112" height="7" rx="3"/><rect x="-56" y="-40" width="112" height="7" rx="3"/><rect x="-56" y="-20" width="80" height="7" rx="3"/><rect x="-56" y="10" width="112" height="44" rx="3" fill="#dde0e3"/></g>` +
        `<text x="-56" y="92" font-family="IBM Plex Mono,monospace" font-size="16" font-weight="500" fill="#8a929e">.PDF</text></g>`,
    ),
  images: (id) =>
    frame(
      paper(id) + shadow(id),
      `<g transform="translate(200 250) rotate(-5)"><rect x="-100" y="-120" width="200" height="236" rx="3" fill="url(#${id}p)"/>` +
        `<rect x="-84" y="-104" width="168" height="168" fill="#cfd4d9"/><circle cx="-40" cy="-60" r="16" fill="#f2c200"/>` +
        `<path d="M-84 64l58-62 38 36 26-22 52 48z" fill="#a9b0b8"/></g>`,
    ),
  text: (id) =>
    frame(
      paper(id) + shadow(id, 200, 392, 130),
      `<g transform="translate(200 260) rotate(-3)"><rect x="-120" y="-80" width="240" height="160" rx="4" fill="url(#${id}p)"/>` +
        `<rect x="-120" y="-80" width="240" height="30" fill="#e9ebed"/><g stroke="#c3c7cc" stroke-width="7" stroke-linecap="round">` +
        `<path d="M-92 -20h184M-92 8h184M-92 36h120"/></g><path d="M44 36h2" stroke="#25303f" stroke-width="3"/></g>`,
    ),
  data: (id) =>
    frame(
      paper(id) + shadow(id),
      `<g transform="translate(200 250) rotate(4)"><rect x="-100" y="-120" width="200" height="230" rx="4" fill="url(#${id}p)"/>` +
        `<g stroke="#cfd2d6" stroke-width="3"><path d="M-100 -76h200M-100 -32h200M-100 12h200M-100 56h200M-34 -120v230M32 -120v230"/></g>` +
        `<rect x="-100" y="-120" width="200" height="44" fill="#e2e5e8"/><rect x="-34" y="-32" width="66" height="44" fill="#f2c200" opacity=".85"/></g>`,
    ),
  developer: (id) =>
    frame(
      `<linearGradient id="${id}k" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a4556"/><stop offset="1" stop-color="#25303f"/></linearGradient>` + shadow(id, 200, 380, 110),
      `<g transform="translate(200 270)"><rect x="-96" y="-70" width="192" height="130" rx="22" fill="#1b2330"/><rect x="-96" y="-84" width="192" height="130" rx="22" fill="url(#${id}k)"/>` +
        `<text x="0" y="-4" text-anchor="middle" font-family="IBM Plex Mono,monospace" font-size="44" font-weight="500" fill="#e8ebf0">&lt;/&gt;</text></g>`,
    ),
  everyday: (id) =>
    frame(
      paper(id) + shadow(id, 200, 392, 100),
      `<g transform="translate(200 250)"><circle r="104" fill="#d4d7db"/><circle r="96" fill="url(#${id}p)"/>` +
        `<g stroke="#c3c7cc" stroke-width="4" stroke-linecap="round"><path d="M0 -80v12M0 80v-12M-80 0h12M80 0h-12"/></g>` +
        `<path d="M0 0V-58M0 0l40 22" stroke="#25303f" stroke-width="6" stroke-linecap="round"/><circle r="7" fill="#f2c200"/></g>`,
    ),
};

// PDF compress: the same sheet, squeezed by a yellow clamp.
export const TOOL_ART: Record<string, (id: string) => string> = {
  "pdf/compress": (id) =>
    frame(
      paper(id) + shadow(id, 200, 392, 110),
      `<g transform="translate(200 300)">` +
        `<rect x="-86" y="-40" width="172" height="12" rx="2" fill="#d9dbde"/><rect x="-86" y="-26" width="172" height="12" rx="2" fill="url(#${id}p)"/>` +
        `<rect x="-86" y="-12" width="172" height="12" rx="2" fill="#dfe1e4"/><rect x="-86" y="2" width="172" height="12" rx="2" fill="url(#${id}p)"/>` +
        `<rect x="-86" y="16" width="172" height="12" rx="2" fill="#d9dbde"/><rect x="-86" y="30" width="172" height="12" rx="2" fill="url(#${id}p)"/>` +
        `<path d="M-110 -70h220v18h-202v108h202v18h-220z" fill="#f2c200"/><rect x="-6" y="-130" width="12" height="60" fill="#25303f"/>` +
        `<rect x="-40" y="-142" width="80" height="16" rx="8" fill="#25303f"/>` +
        `<text x="0" y="112" text-anchor="middle" font-family="IBM Plex Mono,monospace" font-size="15" font-weight="500" fill="#8a929e">12 MB → 2 MB</text></g>`,
    ),
};

export const artFor = (toolId: string | null, category: string, id: string) => (toolId && TOOL_ART[toolId] ? TOOL_ART[toolId] : ART[category])(id);
