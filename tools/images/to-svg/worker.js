// Traces a picture into an SVG off the main thread, so a big picture does not freeze the page.
// The tracer (imagetracerjs, public domain) is served from this site (public/images/to-svg/vendor/,
// copied by scripts/sync-tool-assets.mjs), so nothing leaves the browser. A classic worker with no
// imports, so it runs the same in `npm run dev` and in the built site (like the Compress PDF worker).
// The page sends the pixels and the options (core.js); the worker builds the SVG text itself from
// the tracer's numbers and colours, never from any text in the picture's file.

let missing = "";
try {
  importScripts("/images/to-svg/vendor/imagetracer.js");
} catch (e) {
  missing = String(e?.message ?? e);
}

// Colours this transparent are left out, so a transparent background stays transparent.
const MIN_ALPHA = 26;

self.onmessage = ({ data }) => {
  const { id, width, height, buffer, options, outWidth, outHeight } = data;
  if (missing) {
    self.postMessage({ id, ok: false, load: true, error: missing });
    return;
  }
  try {
    if (!(width > 0 && height > 0) || buffer.byteLength !== width * height * 4) throw new Error("The pixels do not match the size.");
    const tracer = self.ImageTracer;
    const opts = tracer.checkoptions(options);
    const td = tracer.imagedataToTracedata({ width, height, data: new Uint8ClampedArray(buffer) }, opts);
    let body = "";
    let colours = 0;
    for (let l = 0; l < td.layers.length; l++) {
      if (td.palette[l].a < MIN_ALPHA) continue;
      let used = false;
      for (let p = 0; p < td.layers[l].length; p++) {
        if (td.layers[l][p].isholepath) continue; // holes are drawn inside their parent shape
        body += tracer.svgpathstring(td, l, p, opts);
        used = true;
      }
      if (used) colours++;
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${outWidth}" height="${outHeight}" viewBox="0 0 ${td.width} ${td.height}">${body}</svg>`;
    self.postMessage({ id, ok: true, svg, colours });
  } catch (e) {
    self.postMessage({ id, ok: false, error: String(e?.message ?? e) });
  }
};
