// Lends Ghostscript to compress_pdf on the page: the same worker the Compress PDF tool uses
// (tools/pdf/compress/worker.js). Loaded only when an agent calls a tool that needs it.
let worker;
let nextId = 1;
const waiting = new Map();

function start() {
  worker = new Worker(new URL("../../tools/pdf/compress/worker.js", import.meta.url));
  worker.onmessage = ({ data }) => {
    const w = waiting.get(data.id);
    if (!w) return;
    waiting.delete(data.id);
    data.ok ? w.resolve(new Uint8Array(data.out)) : w.reject(new Error(data.error));
  };
  worker.onerror = () => {
    for (const w of waiting.values()) w.reject(new Error("The PDF compressor could not load."));
    waiting.clear();
    worker = undefined;
  };
}

/** @type {NonNullable<import("./contract.js").Context["ghostscript"]>} */
export function ghostscript(args, input) {
  if (!worker) start();
  const id = nextId++;
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    const copy = input.slice().buffer; // the worker takes ownership; keep the caller's bytes
    worker.postMessage({ id, bytes: copy, args }, [copy]);
  });
}
