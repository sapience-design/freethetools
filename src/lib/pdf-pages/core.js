// The PDF pages screen's engine (docs/adr/0016-shared-screens.md): a new PDF from the pages of a
// PDF, in a new order, some left out, some turned. No browser code, so the page, the AI tool and
// the npm package all use it. Nothing leaves the device.
//
// Two ways to build it, and the engine picks:
// - Only turning pages, every page kept in its place: the pages are turned in the file itself, so
//   bookmarks, form fields and document details are kept, as Rotate Pages always did.
// - Pages left out or moved: the kept pages are copied into a new PDF. A page left out is never
//   copied, so it is gone from the file, not hidden inside it.
import { PDFDocument, degrees } from "pdf-lib";
import { parseRanges } from "../../../tools/pdf/split/core.js";
import { pagesFromRanges } from "../../../tools/pdf/rotate/core.js";

const TURNS = [0, 90, 180, 270];

/** Page count of a PDF, or a readable error. */
export async function countPages(bytes) {
  return (await load(bytes)).getPageCount();
}

/**
 * Pages written like "3, 1-2, 5-" as page numbers in that order: [3, 1, 2, 5, 6] for a 6-page PDF.
 * "-3" starts at page 1 and "5-" runs to the last page.
 * @param {string} text
 * @param {number} total
 * @returns {number[]}
 */
export const pageList = (text, total) => pagesFromRanges(parseRanges(text, total));

/**
 * @param {ArrayBuffer | Uint8Array} bytes the PDF
 * @param {{ page: number, turn?: number }[]} plan the pages of the new PDF in order: 1-based page
 *   numbers of the original, each with a clockwise turn to add (0, 90, 180 or 270)
 * @returns {Promise<Uint8Array>}
 */
export async function arrangePdf(bytes, plan) {
  if (!plan.length) throw new Error("Keep at least one page.");
  const src = await load(bytes);
  const total = src.getPageCount();
  const seen = new Set();
  for (const { page, turn = 0 } of plan) {
    if (!Number.isInteger(page) || page < 1 || page > total) throw new Error(`There is no page ${page}. This PDF has pages 1 to ${total}.`);
    if (seen.has(page)) throw new Error(`Page ${page} is listed twice. Each page can be used once.`);
    if (!TURNS.includes(turn)) throw new Error("Turn pages by 90, 180 or 270 degrees.");
    seen.add(page);
  }
  const turned = (pg, turn) => { if (turn) pg.setRotation(degrees((((pg.getRotation().angle + turn) % 360) + 360) % 360)); };

  // Every page, in its own place: turn them where they are.
  if (plan.length === total && plan.every((p, i) => p.page === i + 1)) {
    src.getPages().forEach((pg, i) => turned(pg, plan[i].turn ?? 0));
    src.setProducer("Free the Tools (freethetools.com)");
    return src.save();
  }

  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, plan.map((p) => p.page - 1));
  pages.forEach((pg, i) => { turned(pg, plan[i].turn ?? 0); out.addPage(pg); });
  // Keep what the document says about itself; the pages carry everything else.
  for (const [get, set] of [["getTitle", "setTitle"], ["getAuthor", "setAuthor"], ["getSubject", "setSubject"]]) {
    try { const v = src[get](); if (v) out[set](v); } catch { /* an unreadable entry is left out */ }
  }
  out.setProducer("Free the Tools (freethetools.com)");
  return out.save();
}

async function load(bytes) {
  try {
    return await PDFDocument.load(bytes);
  } catch (e) {
    if (/encrypted/i.test(String(e?.message))) throw new Error("This PDF is password-protected. Open Unlock PDF to take the lock off first.");
    throw new Error("This file isn't a readable PDF.");
  }
}
