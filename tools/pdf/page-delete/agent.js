import { baseName, defineTools, expectType, file, withUnlockHint } from "../../../src/agent/contract.js";
import { arrangePdf, countPages, pageList } from "../../../src/lib/pdf-pages/core.js";

export default defineTools({
  name: "arrange_pdf_pages",
  makesFiles: true,
  title: "Delete or Reorder Pages",
  description:
    "Delete pages from a PDF, or put its pages in a new order. Give pages as the new order, such as \"3, 1-2, 5-\" (pages left out are deleted), or give delete with the pages to remove, such as \"2, 7-9\". A deleted page is not copied into the new PDF, so it is gone from the file. To turn pages, use rotate_pdf. Runs on this device; nothing is uploaded.",
  input: {
    type: "object",
    properties: {
      file: file("The PDF.", ["application/pdf"]),
      pages: { type: "string", "x-setting": true, description: "The pages to keep, in their new order, e.g. \"3, 1-2, 5-\". Pages left out are deleted." },
      delete: { type: "string", "x-setting": true, description: "Pages to delete, e.g. \"2, 7-9\". The other pages keep their order." },
    },
    required: ["file"],
    additionalProperties: false,
  },
  run: withUnlockHint(async ({ file: f, pages, delete: drop }) => {
    expectType(f, ["application/pdf"], "a PDF");
    if (!pages && !drop) throw new Error("Give pages (the new order) or delete (the pages to remove).");
    const total = await countPages(f.bytes);
    let order = pages ? pageList(pages, total) : Array.from({ length: total }, (_, i) => i + 1);
    if (drop) {
      const gone = new Set(pageList(drop, total));
      order = order.filter((n) => !gone.has(n));
    }
    const out = await arrangePdf(f.bytes, order.map((page) => ({ page })));
    const deleted = total - order.length;
    return {
      summary: `Made a ${order.length}-page PDF from ${total} pages${deleted ? `; ${deleted} deleted` : ""}.`,
      data: { pages: order, deleted, total },
      files: [{ name: `${baseName(f.name)}-edited.pdf`, type: "application/pdf", bytes: out }],
    };
  }),
});
