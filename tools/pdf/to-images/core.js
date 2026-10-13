// PDF to Images: page selection, sizing and file names. Rendering uses pdf.js (Apache-2.0) in the page.

export const RESOLUTIONS = [
  { dpi: 72, label: "Screen" },
  { dpi: 150, label: "Standard" },
  { dpi: 300, label: "Print" },
];

/** The picture types, in the order shown. WebP is offered only where the browser can write it. */
export const FORMATS = [
  { ext: "png", type: "image/png", label: "PNG", note: "Sharp, good for text" },
  { ext: "jpg", type: "image/jpeg", label: "JPG", note: "Smaller files, good for photos" },
  { ext: "webp", type: "image/webp", label: "WebP", note: "Smallest, for websites" },
  { ext: "svg", type: "image/svg+xml", label: "SVG", note: "Sharp at any size; a 10 MB engine loads once" },
];

/** The picture type for a file extension; PNG when it is unknown. */
export const formatFor = (ext) => FORMATS.find((f) => f.ext === ext) ?? FORMATS[0];

/** PNG is lossless; JPG and WebP are saved at quality 0.9. */
export const qualityFor = (type) => (type === "image/png" ? undefined : 0.9);

/** PDF units are points (1/72 inch), so the render scale for a DPI is dpi / 72. */
export const scaleFor = (dpi) => dpi / 72;

/** Keep canvases inside what browsers can draw. */
export function safeScale(widthPt, heightPt, dpi) {
  const s = scaleFor(dpi);
  const max = Math.max(widthPt, heightPt) * s;
  return max > 8000 ? (s * 8000) / max : s;
}

/** "report.pdf", page 3 of 12, png -> "report_page-03.png" */
export function pageFileName(pdfName, page, total, ext) {
  const pad = String(total).length;
  return `${pdfName.replace(/\.pdf$/i, "")}_page-${String(page).padStart(Math.max(2, pad), "0")}.${ext}`;
}
