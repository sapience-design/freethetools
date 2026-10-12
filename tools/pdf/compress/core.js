// Ghostscript arguments for PDF Shrink. No browser or Node APIs, so the page, the worker
// and the tests all share it.

/** Ghostscript's built-in -dPDFSETTINGS presets, smallest output first. */
export const PRESETS = ["screen", "ebook", "printer", "prepress"];

/** Picture resolutions (dpi) the "More options" list offers. Anything else is refused. */
export const DPIS = [72, 100, 150, 200, 300];

/**
 * JPEG quality levels. The number is Ghostscript's QFactor: lower keeps more detail and a bigger
 * file. 0.76 is what the "good quality" preset uses.
 */
export const JPEG_LEVELS = { low: 1.5, medium: 0.76, high: 0.4 };

/**
 * Black-and-white scans are stored at 300 dpi or more; below that the text turns to mush. So a
 * picture resolution lowers colour and grey pictures, but black-and-white ones never drop under this.
 */
const MONO_MIN_DPI = 300;

// The only PostScript we ever send. Every number in it comes from the fixed lists above, never from
// the person, so nothing free-form reaches Ghostscript.
const jpegPs = (q) =>
  `<< /ColorACSImageDict << /QFactor ${q} /Blend 1 >> /GrayACSImageDict << /QFactor ${q} /Blend 1 >> >> setdistillerparams`;
// Run after the file, because Ghostscript copies the PDF's own title and author when it reads the file.
const NO_INFO_PS = "[ /Title () /Author () /Subject () /Keywords () /Creator () /DOCINFO pdfmark";

/** Limits for the page-count cap used when measuring a large file. */
const MAX_LAST_PAGE = 9999;

/**
 * @typedef {object} Options Finer control than the presets. Each one left out keeps the preset's own behaviour.
 * @property {number} [dpi] Picture resolution: one of DPIS.
 * @property {"low"|"medium"|"high"} [jpeg] JPEG picture quality: a key of JPEG_LEVELS.
 * @property {boolean} [gray] Turn colours to grey.
 * @property {boolean} [stripInfo] Empty the title, author, subject, keywords and creator.
 */

/**
 * Checks the finer options against fixed lists and returns them cleaned. Throws on anything else.
 * @param {Options & Record<string, unknown>} [o]
 * @returns {Options}
 */
export function checkOptions(o = {}) {
  const { dpi, jpeg, gray, stripInfo } = o;
  if (dpi != null && !DPIS.includes(dpi)) throw new Error(`Unknown resolution '${dpi}'. Use one of: ${DPIS.join(", ")}`);
  if (jpeg != null && !Object.hasOwn(JPEG_LEVELS, jpeg)) throw new Error(`Unknown picture quality '${jpeg}'. Use one of: ${Object.keys(JPEG_LEVELS).join(", ")}`);
  for (const [k, v] of Object.entries({ gray, stripInfo })) {
    if (v != null && typeof v !== "boolean") throw new Error(`'${k}' must be true or false`);
  }
  return { ...(dpi != null && { dpi }), ...(jpeg != null && { jpeg }), ...(gray && { gray: true }), ...(stripInfo && { stripInfo: true }) };
}

/**
 * @param {{ preset?: string, firstPage?: boolean, lastPage?: number, input?: string, output?: string } & Options} [opts]
 *   lastPage keeps only pages 1 to N (used to measure a long file quickly); firstPage is the same with N = 1.
 * @returns {string[]}
 */
export function buildArgs(opts = {}) {
  const { preset = "ebook", firstPage = false, lastPage, input = "/in.pdf", output = "/out.pdf" } = opts;
  if (!PRESETS.includes(preset)) {
    throw new Error(`Unknown preset '${preset}'. Use one of: ${PRESETS.join(", ")}`);
  }
  if (lastPage != null && !(Number.isInteger(lastPage) && lastPage >= 1 && lastPage <= MAX_LAST_PAGE)) {
    throw new Error(`lastPage must be a whole number from 1 to ${MAX_LAST_PAGE}`);
  }
  const { dpi, jpeg, gray, stripInfo } = checkOptions(opts);
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
  else if (lastPage) args.push("-dFirstPage=1", `-dLastPage=${lastPage}`);
  // Set after -dPDFSETTINGS, so they win over what the preset chose.
  if (dpi) {
    args.push(
      "-dDownsampleColorImages=true", "-dDownsampleGrayImages=true", "-dDownsampleMonoImages=true",
      "-dColorImageDownsampleType=/Bicubic", "-dGrayImageDownsampleType=/Bicubic",
      `-dColorImageResolution=${dpi}`, `-dGrayImageResolution=${dpi}`, `-dMonoImageResolution=${Math.max(dpi, MONO_MIN_DPI)}`,
    );
  }
  if (gray) args.push("-sColorConversionStrategy=Gray", "-dProcessColorModel=/DeviceGray");
  args.push(`-sOutputFile=${output}`);
  if (jpeg) args.push("-c", jpegPs(JPEG_LEVELS[jpeg]), "-f");
  args.push(input);
  if (stripInfo) args.push("-c", NO_INFO_PS);
  return args;
}
