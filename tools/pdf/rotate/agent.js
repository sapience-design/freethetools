import { baseName, defineTools, expectType, file } from "../../../src/agent/contract.js";
import { pageCount } from "../merge/core.js";
import { parseRanges } from "../split/core.js";
import { pagesFromRanges, rotatePdf } from "./core.js";

export default defineTools({
  name: "rotate_pdf",
  title: "Rotate Pages",
  description:
    "Turn pages of a PDF clockwise by 90, 180 or 270 degrees: every page, or chosen pages such as \"1-3, 5\". Runs on this device; nothing is uploaded.",
  input: {
    type: "object",
    properties: {
      file: file("The PDF.", ["application/pdf"]),
      degrees: { type: "integer", enum: [90, 180, 270], description: "Clockwise turn." },
      pages: { type: "string", description: "Pages to turn, e.g. \"1-3, 5, 8-\". Default every page." },
    },
    required: ["file", "degrees"],
    additionalProperties: false,
  },
  run: async ({ file: f, degrees, pages }) => {
    expectType(f, ["application/pdf"], "a PDF");
    const total = await pageCount(f.bytes);
    const chosen = pages ? pagesFromRanges(parseRanges(pages, total)) : null;
    const out = await rotatePdf(f.bytes, degrees, chosen);
    return {
      summary: `Turned ${chosen ? chosen.length : total} of ${total} pages by ${degrees}°.`,
      data: { pages: chosen ?? "all", total },
      files: [{ name: `${baseName(f.name)}_rotated.pdf`, type: "application/pdf", bytes: out }],
    };
  },
});
