import { defineTools, files } from "../../../src/agent/contract.js";
import { imagesToPdf } from "./core.js";

const ACCEPT = ["image/jpeg", "image/png"];

export default defineTools({
  name: "images_to_pdf",
  title: "Images to PDF",
  description:
    "Put JPEG and PNG images into one PDF, one page per image, in the order given. Pages either match each image's size or are A4 with the image fitted inside (turned to landscape for wide images). Runs on this device; nothing is uploaded.",
  input: {
    type: "object",
    properties: {
      files: files("Images in page order: JPEG or PNG.", ACCEPT),
      page: { type: "string", enum: ["fit", "a4"], description: "fit: page matches the image (default); a4: A4 pages." },
      margin: { type: "string", enum: ["none", "small", "large"], description: "White space around each image (default none)." },
      fileName: { type: "string", description: "Name of the PDF (default images.pdf)." },
    },
    required: ["files"],
    additionalProperties: false,
  },
  run: async ({ files: images, page = "fit", margin = "none", fileName = "images.pdf" }) => {
    const bad = images.find((f) => !ACCEPT.includes(f.type));
    if (bad) throw new Error(`${bad.name} isn't a JPEG or PNG. Convert it first, for example with the File Converter.`);
    const out = await imagesToPdf(images.map((f) => ({ bytes: f.bytes, type: f.type })), { page, margin });
    return {
      summary: `${images.length} image${images.length > 1 ? "s" : ""} on ${images.length} page${images.length > 1 ? "s" : ""}.`,
      data: { pages: images.length },
      files: [{ name: /\.pdf$/i.test(fileName) ? fileName : `${fileName}.pdf`, type: "application/pdf", bytes: out }],
    };
  },
});
