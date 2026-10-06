import { defineTools, textFile } from "../../../src/agent/contract.js";
import { makeQr, wifiPayload } from "./core.js";

export default defineTools({
  name: "make_qr_code",
  makesFiles: true,
  title: "QR Code Maker",
  description:
    "Make a QR code as an SVG file, for a link, any text, or a Wi-Fi network (phones join it by scanning). Runs on this device; nothing is uploaded.",
  input: {
    type: "object",
    properties: {
      text: { type: "string", description: "A link or text to encode. Give this or wifi." },
      wifi: {
        type: "object",
        description: "A Wi-Fi network to encode. Give this or text.",
        properties: {
          ssid: { type: "string", minLength: 1, description: "Network name." },
          password: { type: "string", description: "Network password." },
          security: { type: "string", enum: ["WPA", "WEP", "nopass"], description: "Default WPA when there is a password." },
          hidden: { type: "boolean", description: "The network is hidden." },
        },
        required: ["ssid"],
        additionalProperties: false,
      },
      level: { type: "string", enum: ["L", "M", "Q", "H"], description: "Error correction: L 7%, M 15% (default), Q 25%, H 30%." },
      fileName: { type: "string", description: "Name of the SVG file (default qr-code.svg)." },
    },
    additionalProperties: false,
  },
  example: { text: "https://freethetools.com" },
  run: ({ text, wifi, level = "M", fileName = "qr-code.svg" }) => {
    if ((text === undefined) === (wifi === undefined)) throw new Error("Give either text or wifi.");
    const payload = wifi ? wifiPayload(wifi) : text;
    const { svg, modules } = makeQr(payload, { level });
    return {
      summary: `QR code of ${modules}×${modules} modules${wifi ? ` for the Wi-Fi network "${wifi.ssid}"` : ""}.`,
      data: { modules },
      files: [textFile(/\.svg$/i.test(fileName) ? fileName : `${fileName}.svg`, "image/svg+xml", svg)],
    };
  },
});
