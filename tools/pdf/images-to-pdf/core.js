// Images to PDF: place each image on its own page, either at its own size or fitted to A4.
import { PDFDocument } from "pdf-lib";

const A4 = [595.28, 841.89];
const MARGINS = { none: 0, small: 24, large: 48 };

/**
 * @param {{ bytes: ArrayBuffer | Uint8Array, type: "image/jpeg" | "image/png" }[]} images
 * @param {{ page?: "fit" | "a4", margin?: "none" | "small" | "large" }} [opts]
 * @returns {Promise<Uint8Array>}
 */
export async function imagesToPdf(images, opts = {}) {
  const { page = "fit", margin = "none" } = opts;
  if (!images.length) throw new Error("Add at least one image.");
  const pad = MARGINS[margin] ?? 0;
  const doc = await PDFDocument.create();
  for (const img of images) {
    const embedded = img.type === "image/png" ? await doc.embedPng(img.bytes) : await doc.embedJpg(img.bytes);
    const { width, height } = embedded;
    if (page === "fit") {
      const p = doc.addPage([width + pad * 2, height + pad * 2]);
      p.drawImage(embedded, { x: pad, y: pad, width, height });
    } else {
      // A4, turned to landscape for wide images, image scaled to fit inside the margins.
      const [pw, ph] = width > height ? [A4[1], A4[0]] : A4;
      const scale = Math.min((pw - pad * 2) / width, (ph - pad * 2) / height, 1);
      const w = width * scale, h = height * scale;
      const p = doc.addPage([pw, ph]);
      p.drawImage(embedded, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
    }
  }
  doc.setProducer("Free the Tools (freethetools.com)");
  return doc.save();
}
