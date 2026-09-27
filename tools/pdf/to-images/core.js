// PDF to Images: page selection, sizing and file names. Rendering uses pdf.js (Apache-2.0) in the page.

export const RESOLUTIONS = [
  { dpi: 72, label: "Screen" },
  { dpi: 150, label: "Standard" },
  { dpi: 300, label: "Print" },
];

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
