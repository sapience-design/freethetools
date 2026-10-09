// Ghostscript (WebAssembly) for compress_pdf, run in Node. The Emscripten loader tries to fetch the
// wasm file by URL, which Node cannot do for a file path, so the wasm is compiled here and handed
// over through `instantiateWasm`. A fresh instance runs each file, as on the site.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const dir = (f) => fileURLToPath(new URL(f, import.meta.url));
let compiled;

/** @type {NonNullable<import("../../../src/agent/contract.js").Context["ghostscript"]>} */
export async function ghostscript(args, input) {
  compiled ??= WebAssembly.compile(readFileSync(dir("./gs.wasm")));
  const module = await compiled;
  const log = [];
  const factory = require(dir("./gs.cjs"));
  const gs = await factory({
    noInitialRun: true,
    print: () => {},
    printErr: (s) => log.push(s),
    instantiateWasm(imports, done) {
      WebAssembly.instantiate(module, imports).then((instance) => done(instance, module));
      return {};
    },
  });
  gs.FS.writeFile("/in.pdf", input);
  const code = gs.callMain(args);
  if (code !== 0) throw new Error(`Ghostscript exited with code ${code}. ${log.slice(-3).join(" ")}`);
  return new Uint8Array(gs.FS.readFile("/out.pdf"));
}
