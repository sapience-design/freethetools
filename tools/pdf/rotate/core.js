// Rotate Pages: add a rotation to chosen pages (or all of them).
import { PDFDocument, degrees } from "pdf-lib";

/**
 * @param {ArrayBuffer | Uint8Array} bytes
 * @param {90 | 180 | 270} turn clockwise degrees to add
 * @param {number[] | null} pages 1-based page numbers, or null for every page
 * @returns {Promise<Uint8Array>}
 */
export async function rotatePdf(bytes, turn, pages = null) {
  if (![90, 180, 270].includes(turn)) throw new Error("Rotate by 90, 180 or 270 degrees.");
  let doc;
  try {
    doc = await PDFDocument.load(bytes);
  } catch (e) {
    if (/encrypted/i.test(String(e?.message))) throw new Error("This PDF is password-protected. Remove the password in your PDF reader first.");
    throw new Error("This file isn't a readable PDF.");
  }
  const all = doc.getPages();
  const chosen = pages ? new Set(pages) : null;
  all.forEach((page, i) => {
    if (chosen && !chosen.has(i + 1)) return;
    page.setRotation(degrees((page.getRotation().angle + turn) % 360));
  });
  doc.setProducer("Free the Tools (freethetools.com)");
  return doc.save();
}

/** Expand ranges [[1,3],[5,5]] to page numbers [1,2,3,5]. */
export const pagesFromRanges = (ranges) => ranges.flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => a + i));
