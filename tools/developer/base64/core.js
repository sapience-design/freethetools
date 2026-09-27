// Base64: encode and decode text (as UTF-8) and raw bytes, in standard or URL-safe form.

/** @param {Uint8Array} bytes @param {boolean} [urlSafe] */
export function bytesToBase64(bytes, urlSafe = false) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const b64 = btoa(bin);
  return urlSafe ? b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") : b64;
}

/** @param {string} b64 accepts standard or URL-safe, with or without padding and whitespace */
export function base64ToBytes(b64) {
  const clean = b64.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) throw new Error("That isn't valid Base64: it contains characters Base64 doesn't use.");
  const padded = clean + "=".repeat((4 - (clean.length % 4)) % 4);
  let bin;
  try { bin = atob(padded); } catch { throw new Error("That isn't valid Base64."); }
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export const encodeText = (text, urlSafe = false) => bytesToBase64(new TextEncoder().encode(text), urlSafe);

export function decodeText(b64) {
  const bytes = base64ToBytes(b64);
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw new Error("This decodes to binary data, not text. Use the file option to save it."); }
}
