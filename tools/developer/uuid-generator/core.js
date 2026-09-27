// UUID Generator: random v4 and time-ordered v7 (RFC 9562), from the browser's secure random source.

const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
const format = (h) => `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;

export function uuidV4() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  return format(hex(b));
}

/** @param {number} [now] milliseconds since the Unix epoch */
export function uuidV7(now = Date.now()) {
  const b = crypto.getRandomValues(new Uint8Array(16));
  const ms = BigInt(now);
  for (let i = 0; i < 6; i++) b[i] = Number((ms >> BigInt(8 * (5 - i))) & 0xffn);
  b[6] = (b[6] & 0x0f) | 0x70;
  b[8] = (b[8] & 0x3f) | 0x80;
  return format(hex(b));
}

/** @param {"v4" | "v7"} version @param {number} count @param {{ upper?: boolean, braces?: boolean, hyphens?: boolean }} [style] */
export function generate(version, count, style = {}) {
  const n = Math.min(Math.max(1, Math.floor(count) || 1), 1000);
  return Array.from({ length: n }, () => {
    let id = version === "v7" ? uuidV7() : uuidV4();
    if (style.hyphens === false) id = id.replace(/-/g, "");
    if (style.upper) id = id.toUpperCase();
    return style.braces ? `{${id}}` : id;
  });
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
