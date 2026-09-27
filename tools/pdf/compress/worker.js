// Runs Ghostscript (WebAssembly) off the main thread. The engine is served from this site
// (public/pdf/compress/vendor/, copied by scripts/sync-tool-assets.mjs), so nothing leaves the browser.
import { buildArgs } from "./core.js";

const VENDOR = "/pdf/compress/vendor/";
importScripts(VENDOR + "gs.js"); // defines global `Module`, an Emscripten factory

self.onmessage = async ({ data }) => {
  const { id, bytes, preset, firstPage } = data;
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
    const rc = gs.callMain(buildArgs({ preset, firstPage }));
    if (rc !== 0) throw new Error(`Ghostscript exited with code ${rc}`);
    const out = gs.FS.readFile("/out.pdf");
    self.postMessage({ id, ok: true, out: out.buffer }, [out.buffer]);
  } catch (e) {
    self.postMessage({ id, ok: false, error: String(e?.message ?? e), log: log.slice(-5) });
  }
};
