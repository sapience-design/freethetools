// Ghostscript arguments for PDF Shrink. No browser or Node APIs, so the page, the worker
// and the tests all share it.

/** Ghostscript's built-in -dPDFSETTINGS presets, smallest output first. */
export const PRESETS = ["screen", "ebook", "printer", "prepress"];

/**
 * @param {{ preset?: string, firstPage?: boolean, input?: string, output?: string }} [opts]
 * @returns {string[]}
 */
export function buildArgs(opts = {}) {
  const { preset = "ebook", firstPage = false, input = "/in.pdf", output = "/out.pdf" } = opts;
  if (!PRESETS.includes(preset)) {
    throw new Error(`Unknown preset '${preset}'. Use one of: ${PRESETS.join(", ")}`);
  }
  const args = [
    "-sDEVICE=pdfwrite",
    "-dCompatibilityLevel=1.5",
    `-dPDFSETTINGS=/${preset}`,
    "-dDetectDuplicateImages=true",
    "-dNOPAUSE",
    "-dQUIET",
    "-dBATCH",
  ];
  if (firstPage) args.push("-dFirstPage=1", "-dLastPage=1");
  args.push(`-sOutputFile=${output}`, input);
  return args;
}
