// Runs qpdf (WebAssembly) off the main thread. The engine is served from this site
// (public/pdf/unlock/vendor/, copied by scripts/sync-tool-assets.mjs), so nothing leaves the browser.
// A classic worker with no imports, like tools/pdf/compress/worker.js. The page sends qpdf's
// arguments (core.js); a password travels in them and is never stored or logged here.

const VENDOR = "/pdf/unlock/vendor/";
importScripts(VENDOR + "qpdf.js"); // defines global `Module`, an Emscripten factory

/** Collects what qpdf prints, one entry per line. Emscripten hands over one character code at a time. */
function lineSink(lines) {
  let bytes = [];
  const flush = () => { lines.push(new TextDecoder().decode(new Uint8Array(bytes))); bytes = []; };
  const put = (c) => { if (c === 10) flush(); else if (c !== null && c !== undefined) bytes.push(c & 255); };
  return { put, end: () => { if (bytes.length) flush(); } };
}

self.onmessage = async ({ data }) => {
  const { id, bytes, args } = data;
  const lines = [];
  const sink = lineSink(lines);
  try {
    // A fresh instance per run: Emscripten's callMain runs once per instance.
    const qpdf = await self.Module({
      noInitialRun: true,
      locateFile: (f) => VENDOR + f,
      stdout: sink.put,
      stderr: sink.put,
    });
    qpdf.FS.writeFile("/in.pdf", new Uint8Array(bytes));
    let code;
    try { code = qpdf.callMain(args); } catch (e) { code = typeof e?.status === "number" ? e.status : 2; }
    sink.end();
    let output;
    try { output = qpdf.FS.readFile("/out.pdf"); } catch { /* qpdf made no output */ }
    self.postMessage({ id, ok: true, code: code ?? 0, lines, output: output?.buffer }, output ? [output.buffer] : []);
  } catch (e) {
    self.postMessage({ id, ok: false, error: String(e?.message ?? e) });
  }
};
