// Test helpers: run qpdf in Node and make encrypted fixtures from the shared sample PDF, so no
// binary fixtures need to be committed. Same engine and arguments as the site, just in Node.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const SAMPLE = new Uint8Array(readFileSync(new URL("../../compress/tests/fixtures/sample.pdf", import.meta.url)));
const modulePath = require.resolve("@jspawn/qpdf-wasm/qpdf.js");
const wasm = await WebAssembly.compile(readFileSync(require.resolve("@jspawn/qpdf-wasm/qpdf.wasm")));

/** @type {(args: string[], input: Uint8Array) => Promise<{ code: number, lines: string[], output?: Uint8Array }>} */
export async function qpdf(args, input) {
  const lines = [];
  let bytes = [];
  const put = (c) => {
    if (c === 10) { lines.push(Buffer.from(bytes).toString("utf8")); bytes = []; }
    else if (c !== null && c !== undefined) bytes.push(c & 255);
  };
  // The loader hooks the process and sets its exit code; undo both after each run.
  const listeners = ["uncaughtException", "unhandledRejection"].map((e) => [e, process.listeners(e)]);
  const exitCode = process.exitCode;
  try {
    const engine = await require(modulePath)({
      noInitialRun: true, stdout: put, stderr: put,
      instantiateWasm(imports, done) { WebAssembly.instantiate(wasm, imports).then((i) => done(i, wasm)); return {}; },
    });
    engine.FS.writeFile("/in.pdf", input);
    let code;
    try { code = engine.callMain(args); } catch (e) { code = typeof e?.status === "number" ? e.status : 2; }
    if (bytes.length) lines.push(Buffer.from(bytes).toString("utf8"));
    let output;
    try { output = new Uint8Array(engine.FS.readFile("/out.pdf")); } catch { /* no output */ }
    return { code: code ?? 0, lines, output };
  } finally {
    for (const [e, keep] of listeners) for (const l of process.listeners(e)) if (!keep.includes(l)) process.off(e, l);
    process.exitCode = exitCode;
  }
}

export const OPEN_PASSWORD = "open-sesame";
export const OWNER_PASSWORD = "owner-secret";

async function encrypt(input, ...encryptArgs) {
  const weak = encryptArgs.includes("--allow-weak-crypto") ? ["--allow-weak-crypto"] : []; // a top-level option, before --encrypt
  const r = await qpdf([...weak, "--encrypt", ...encryptArgs.filter((a) => a !== "--allow-weak-crypto"), "--", "/in.pdf", "/out.pdf"], input);
  if (!r.output?.length || (r.code !== 0 && r.code !== 3)) throw new Error(`qpdf could not make the fixture: ${r.lines.join(" ")}`);
  return r.output;
}

export const plain = SAMPLE;
/** Needs OPEN_PASSWORD (or the owner password) to open. 256-bit AES. */
export const withPassword = await encrypt(SAMPLE, OPEN_PASSWORD, OWNER_PASSWORD, "256");
/** Opens without a password, but forbids printing, copying and editing. */
export const withRestrictions = await encrypt(SAMPLE, "", OWNER_PASSWORD, "256", "--print=none", "--extract=n", "--modify=none");
/** Old 40-bit RC4 encryption, to check the other format. */
export const withPasswordRc4 = await encrypt(SAMPLE, OPEN_PASSWORD, OWNER_PASSWORD, "40", "--allow-weak-crypto");
export { encrypt };
