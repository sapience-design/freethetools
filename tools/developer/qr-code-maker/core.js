// QR Code Maker: text, links and Wi-Fi as a QR code, drawn as SVG. Uses qrcode-generator (MIT).
import qrcode from "qrcode-generator";

/** Escape a value for the Wi-Fi QR format (backslash, ;, ,, : and "). */
const wifiEscape = (s) => s.replace(/([\\;,:"])/g, "\\$1");

/** @param {{ ssid: string, password?: string, security?: "WPA" | "WEP" | "nopass", hidden?: boolean }} w */
export function wifiPayload(w) {
  if (!w.ssid) throw new Error("Enter the network name.");
  const sec = w.security ?? (w.password ? "WPA" : "nopass");
  return `WIFI:T:${sec};S:${wifiEscape(w.ssid)};${sec !== "nopass" ? `P:${wifiEscape(w.password ?? "")};` : ""}${w.hidden ? "H:true;" : ""};`;
}

/**
 * @param {string} text
 * @param {{ level?: "L" | "M" | "Q" | "H", margin?: number, dark?: string, light?: string }} [opts]
 * @returns {{ svg: string, modules: number }}
 */
export function makeQr(text, opts = {}) {
  const { level = "M", margin = 4, dark = "#111418", light = "#ffffff" } = opts;
  if (!text) throw new Error("Enter something to encode.");
  const qr = qrcode(0, level);
  qr.addData(unescape(encodeURIComponent(text)), "Byte"); // UTF-8 bytes
  try { qr.make(); } catch { throw new Error("That's too long for a QR code. Try a shorter link or less text."); }
  const n = qr.getModuleCount();
  const size = n + margin * 2;
  let path = "";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) path += `M${c + margin} ${r + margin}h1v1h-1z`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="${light}"/><path d="${path}" fill="${dark}"/></svg>`;
  return { svg, modules: n };
}
