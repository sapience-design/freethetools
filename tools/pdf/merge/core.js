// Merge PDFs: copy every page of each input, in order, into one new document.
import { PDFDocument } from "pdf-lib";

/** Page count of a PDF, or a readable error. */
export async function pageCount(bytes) {
  return (await load(bytes)).getPageCount();
}

/**
 * @param {ArrayBuffer[] | Uint8Array[]} inputs PDFs in the order they should appear
 * @returns {Promise<Uint8Array>}
 */
export async function mergePdfs(inputs) {
  if (!inputs.length) throw new Error("Add at least one PDF.");
  const out = await PDFDocument.create();
  for (const bytes of inputs) {
    const src = await load(bytes);
    const pages = await out.copyPages(src, src.getPageIndices());
    for (const p of pages) out.addPage(p);
  }
  out.setProducer("Free the Tools (freethetools.com)");
  return out.save();
}

async function load(bytes) {
  try {
    return await PDFDocument.load(bytes);
  } catch (e) {
    if (/encrypted/i.test(String(e?.message))) throw new Error("This PDF is password-protected. Remove the password in your PDF reader first.");
    throw new Error("This file isn't a readable PDF.");
  }
}
