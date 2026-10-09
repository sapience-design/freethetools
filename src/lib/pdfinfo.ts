// What matters about a PDF before a tool works on it: how many pages, what paper, and whether it is
// locked with a password. Read with pdf-lib in the page; nothing is uploaded.
import { PDFDocument } from "pdf-lib";
import { paperOf } from "./paper.js";
import { fmtBytes } from "./files";

export type PdfFacts = { pages: number; paper: string; locked: boolean };

const cache = new WeakMap<Blob, Promise<PdfFacts | null>>();

/** Facts about a PDF file, read once per file. Null when it can't be read at all. */
export function pdfFacts(file: Blob): Promise<PdfFacts | null> {
  let p = cache.get(file);
  if (!p) {
    p = file.arrayBuffer()
      .then((b) => PDFDocument.load(b, { ignoreEncryption: true, updateMetadata: false }))
      .then((doc) => {
        const sizes = doc.getPages().map((pg) => {
          const { width, height } = pg.getSize();
          return pg.getRotation().angle % 180 ? { width: height, height: width } : { width, height };
        });
        return { pages: sizes.length, paper: paperOf(sizes), locked: doc.isEncrypted };
      })
      .catch(() => null);
    cache.set(file, p);
  }
  return p;
}

/** "6 pages · A4 · 1.9 MB" */
export const pdfMeta = (f: PdfFacts | null, bytes: number) =>
  f ? [`${f.pages} ${f.pages === 1 ? "page" : "pages"}`, f.paper, fmtBytes(bytes)].filter(Boolean).join(" · ") : `${fmtBytes(bytes)} · can't read this PDF`;
