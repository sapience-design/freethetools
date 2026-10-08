// qpdf (WebAssembly) for unlock_pdf, run in Node. The Emscripten loader tries to fetch the wasm file
// by URL, which Node cannot do for a file path, so the wasm is compiled here and handed over through
// `instantiateWasm`. A fresh instance runs each file, as on the site.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const dir = (f) => fileURLToPath(new URL(f, import.meta.url));
let compiled;

/** @type {NonNullable<import("../../../src/agent/contract.js").Context["qpdf"]>} */
export async function qpdf(args, input) {
  compiled ??= WebAssembly.compile(readFileSync(dir("./qpdf.wasm")));
  const module = await compiled;
  const lines = [];
  let bytes = [];
  const put = (c) => {
    if (c === 10) { lines.push(Buffer.from(bytes).toString("utf8")); bytes = []; }
    else if (c !== null && c !== undefined) bytes.push(c & 255);
  };
  // The loader hooks the process (uncaught errors) and sets its exit code on every run. Undo both,
  // so repeated runs neither warn about listeners nor change how the host process ends.
  const before = Object.fromEntries(["uncaughtException", "unhandledRejection"].map((e) => [e, process.listeners(e)]));
  const exitCode = process.exitCode;
  try {
    const engine = await require(dir("./qpdf.cjs"))({
      noInitialRun: true,
      stdout: put,
      stderr: put,
      instantiateWasm(imports, done) {
        WebAssembly.instantiate(module, imports).then((instance) => done(instance, module));
        return {};
      },
    });
    engine.FS.writeFile("/in.pdf", input);
    let code;
    try { code = engine.callMain(args); } catch (e) { code = typeof e?.status === "number" ? e.status : 2; }
    if (bytes.length) lines.push(Buffer.from(bytes).toString("utf8"));
    let output;
    try { output = new Uint8Array(engine.FS.readFile("/out.pdf")); } catch { /* qpdf made no output */ }
    return { code: code ?? 0, lines, output };
  } finally {
    for (const [event, keep] of Object.entries(before)) for (const l of process.listeners(event)) if (!keep.includes(l)) process.off(event, l);
    process.exitCode = exitCode;
  }
}
