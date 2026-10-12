// Runs Ghostscript (WebAssembly) off the main thread. The engine is served from this site
// (public/pdf/compress/vendor/, copied by scripts/sync-tool-assets.mjs), so nothing leaves the browser.
// A classic worker with no imports, so it runs the same in `npm run dev` and in the built site;
// the page builds the Ghostscript arguments (core.js) and sends them.

const VENDOR = "/pdf/compress/vendor/";
// Defines global `Module`, an Emscripten factory. Offline, the engine is there only if it was kept
// for offline use: when it is missing, each file is answered with that, instead of the worker failing.
let missing = "";
try {
  importScripts(VENDOR + "gs.js");
} catch (e) {
  missing = String(e?.message ?? e);
}

self.onmessage = async ({ data }) => {
  const { id, bytes, args } = data;
  if (missing) {
    self.postMessage({ id, ok: false, load: true, error: missing });
    return;
  }
  const log = [];
  try {
    // A fresh instance per file: Emscripten's callMain runs once per instance.
    const gs = await self.Module({
      noInitialRun: true,
      locateFile: (f) => VENDOR + f,
      print: () => {},
      printErr: (s) => log.push(s),
    });
    gs.FS.writeFile("/in.pdf", new Uint8Array(bytes));
    const rc = gs.callMain(args);
    if (rc !== 0) throw new Error(`Ghostscript exited with code ${rc}`);
    const out = gs.FS.readFile("/out.pdf");
    self.postMessage({ id, ok: true, out: out.buffer }, [out.buffer]);
  } catch (e) {
    self.postMessage({ id, ok: false, error: String(e?.message ?? e), log: log.slice(-5) });
  }
};
