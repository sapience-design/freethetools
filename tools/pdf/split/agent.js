import { baseName, defineTools, expectType, file } from "../../../src/agent/contract.js";
import { pageCount } from "../merge/core.js";
import { everyPage, parseRanges, splitPdf } from "./core.js";

export default defineTools({
  name: "split_pdf",
  makesFiles: true,
  title: "Split PDF",
  description:
    "Split a PDF into separate files: one per page, or one per range such as \"1-3, 5, 8-\" (8- means page 8 to the end). Runs on this device; nothing is uploaded.",
  input: {
    type: "object",
    properties: {
      file: file("The PDF to split.", ["application/pdf"]),
      ranges: { type: "string", "x-setting": true, description: "Ranges, one file each, e.g. \"1-3, 5, 8-\". Default one file per page." },
    },
    required: ["file"],
    additionalProperties: false,
  },
  run: async ({ file: f, ranges }) => {
    expectType(f, ["application/pdf"], "a PDF");
    const total = await pageCount(f.bytes);
    const parts = await splitPdf(f.bytes, ranges ? parseRanges(ranges, total) : everyPage(total));
    const base = baseName(f.name);
    return {
      summary: `Split ${total} pages into ${parts.length} file${parts.length > 1 ? "s" : ""}.`,
      data: { total, ranges: parts.map((p) => p.range) },
      files: parts.map((p) => ({
        name: `${base}_${p.range[0] === p.range[1] ? `page-${p.range[0]}` : `pages-${p.range[0]}-${p.range[1]}`}.pdf`,
        type: "application/pdf",
        bytes: p.bytes,
      })),
    };
  },
});
