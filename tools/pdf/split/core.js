// Split PDF: parse page ranges and copy each range into its own document.
import { PDFDocument } from "pdf-lib";

/**
 * Parse "1-3, 5, 8-" into [[1,3],[5,5],[8,total]] (1-based, inclusive).
 * @param {string} text
 * @param {number} total
 * @returns {[number, number][]}
 */
export function parseRanges(text, total) {
  const parts = text.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  if (!parts.length) throw new Error("Enter pages, for example 1-3, 5, 8-.");
  return parts.map((part) => {
    const m = part.match(/^(\d*)\s*[-–]\s*(\d*)$|^(\d+)$/);
    if (!m) throw new Error(`"${part}" isn't a page or range. Use numbers like 2 or 4-7.`);
    const start = m[3] ? +m[3] : m[1] ? +m[1] : 1;
    const end = m[3] ? +m[3] : m[2] ? +m[2] : total;
    if (start < 1 || end > total || start > end) throw new Error(`"${part}" is outside pages 1 to ${total}.`);
    return [start, end];
  });
}

/** One range per page: [[1,1],[2,2],...]. */
export const everyPage = (total) => Array.from({ length: total }, (_, i) => [i + 1, i + 1]);

/**
 * @param {ArrayBuffer | Uint8Array} bytes
 * @param {[number, number][]} ranges
 * @param {(done: number, total: number) => unknown} [onPart] called after each new file, so a page can show progress
 * @returns {Promise<{ range: [number, number], bytes: Uint8Array }[]>}
 */
export async function splitPdf(bytes, ranges, onPart) {
  let src;
  try {
    src = await PDFDocument.load(bytes);
  } catch (e) {
    if (/encrypted/i.test(String(e?.message))) throw new Error("This PDF is password-protected. Remove the password in your PDF reader first.");
    throw new Error("This file isn't a readable PDF.");
  }
  const out = [];
  for (const [start, end] of ranges) {
    const doc = await PDFDocument.create();
    const indices = Array.from({ length: end - start + 1 }, (_, i) => start - 1 + i);
    for (const p of await doc.copyPages(src, indices)) doc.addPage(p);
    doc.setProducer("Free the Tools (freethetools.com)");
    out.push({ range: [start, end], bytes: await doc.save() });
    await onPart?.(out.length, ranges.length);
  }
  return out;
}
