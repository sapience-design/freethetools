// Writes PDF pages as SVG with MuPDF (AGPL-3.0, like this site), off the main thread. The engine is
// served from this site (public/vendor/mupdf/, copied by scripts/sync-tool-assets.mjs) and loaded
// only when someone picks SVG, so nothing leaves the browser and other visitors never download it.
// Text is written as shapes ("text=path"), so the drawing looks the same without the PDF's fonts.

const ENGINE = "/vendor/mupdf/mupdf.js";
let mupdf = null;
let doc = null;

self.onmessage = async ({ data }) => {
  const { id, type } = data;
  try {
    mupdf ??= await import(/* @vite-ignore */ ENGINE);
    if (type === "open") {
      doc?.destroy();
      doc = mupdf.Document.openDocument(new Uint8Array(data.bytes), "application/pdf");
      self.postMessage({ id, ok: true });
    } else if (type === "page") {
      const page = doc.loadPage(data.n - 1);
      const buf = new mupdf.Buffer();
      const writer = new mupdf.DocumentWriter(buf, "svg", "text=path");
      const dev = writer.beginPage(page.getBounds());
      page.run(dev, mupdf.Matrix.identity);
      writer.endPage();
      writer.close();
      const svg = buf.asString();
      dev.destroy(); writer.destroy(); buf.destroy(); page.destroy();
      self.postMessage({ id, ok: true, svg });
    }
  } catch (e) {
    self.postMessage({ id, ok: false, error: String(e?.message ?? e) });
  }
};
