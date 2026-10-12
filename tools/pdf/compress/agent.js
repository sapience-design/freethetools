import { baseName, defineTools, expectType, file } from "../../../src/agent/contract.js";
import { DPIS, JPEG_LEVELS, buildArgs } from "./core.js";

const QUALITY = { smallest: "screen", balanced: "ebook", print: "printer", prepress: "prepress" };

export default defineTools({
  name: "compress_pdf",
  makesFiles: true,
  title: "Compress PDF",
  description:
    "Make a PDF smaller with Ghostscript, at a chosen quality: smallest (screen reading), balanced (email and sharing, default), print, or prepress (keeps colour profiles). Can keep only the first page. Optional finer control: picture resolution in dpi, JPEG picture quality, grey instead of colour, and emptying the title, author and other document details. Text-only PDFs may not shrink; the result then says so. Runs on this device; nothing is uploaded.",
  input: {
    type: "object",
    properties: {
      file: file("The PDF to compress.", ["application/pdf"]),
      quality: { type: "string", enum: Object.keys(QUALITY), description: "Default balanced." },
      firstPageOnly: { type: "boolean", description: "Keep only page 1 (default false)." },
      dpi: { type: "integer", enum: DPIS, description: "Lower pictures to this resolution. Default: what the quality uses." },
      imageQuality: { type: "string", enum: Object.keys(JPEG_LEVELS), description: "JPEG picture quality. Default: what the quality uses." },
      grayscale: { type: "boolean", description: "Turn colours to grey (default false)." },
      removeDocumentInfo: { type: "boolean", description: "Empty the title, author, subject, keywords and creator (default false)." },
    },
    required: ["file"],
    additionalProperties: false,
  },
  needs: ["ghostscript"],
  run: async ({ file: f, quality = "balanced", firstPageOnly = false, dpi, imageQuality, grayscale = false, removeDocumentInfo = false }, ctx) => {
    expectType(f, ["application/pdf"], "a PDF");
    if (!ctx.ghostscript) throw new Error("The PDF compressor isn't available here.");
    let out;
    try { out = await ctx.ghostscript(buildArgs({ preset: QUALITY[quality], firstPage: firstPageOnly, dpi, jpeg: imageQuality, gray: grayscale, stripInfo: removeDocumentInfo }), f.bytes); }
    catch { throw new Error(`Could not compress ${f.name}. It may be damaged or locked. If it is locked, run unlock_pdf on it first.`); }
    const before = f.bytes.length, after = out.length;
    const pct = Math.round(100 * (1 - after / before));
    return {
      summary: pct > 0 ? `${f.name}: ${pct}% smaller (${before} → ${after} bytes).` : `${f.name} was already compact; the result is ${-pct}% larger, so keep the original.`,
      data: { before, after, percentSmaller: pct, quality, firstPageOnly, dpi: dpi ?? null, imageQuality: imageQuality ?? null, grayscale, removeDocumentInfo },
      files: [{ name: `${baseName(f.name)}${firstPageOnly ? "_p1" : ""}_small.pdf`, type: "application/pdf", bytes: out }],
    };
  },
});
