import { defineTools, expectType, files } from "../../../src/agent/contract.js";
import { mergePdfs, pageCount } from "./core.js";

export default defineTools({
  name: "merge_pdfs",
  makesFiles: true,
  title: "Merge PDFs",
  description:
    "Combine PDFs into one, keeping every page, in the order given. Password-protected PDFs must be unlocked first. Runs on this device; nothing is uploaded.",
  input: {
    type: "object",
    properties: {
      files: files("PDFs in the order they should appear.", ["application/pdf"], 2),
      fileName: { type: "string", description: "Name of the merged PDF (default merged.pdf)." },
    },
    required: ["files"],
    additionalProperties: false,
  },
  run: async ({ files: pdfs, fileName = "merged.pdf" }) => {
    for (const f of pdfs) expectType(f, ["application/pdf"], "a PDF");
    const out = await mergePdfs(pdfs.map((f) => f.bytes));
    const pages = await pageCount(out);
    return {
      summary: `Merged ${pdfs.length} PDFs into ${pages} pages.`,
      data: { pages },
      files: [{ name: /\.pdf$/i.test(fileName) ? fileName : `${fileName}.pdf`, type: "application/pdf", bytes: out }],
    };
  },
});
