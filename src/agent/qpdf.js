// Lends qpdf to unlock_pdf on the page: the same worker the Unlock PDF tool uses
// (tools/pdf/unlock/worker.js). Loaded when an agent calls a tool that needs it, and by the tool page.
let worker;
let nextId = 1;
const waiting = new Map();

function start() {
  worker = new Worker(new URL("../../tools/pdf/unlock/worker.js", import.meta.url));
  worker.onmessage = ({ data }) => {
    const w = waiting.get(data.id);
    if (!w) return;
    waiting.delete(data.id);
    data.ok
      ? w.resolve({ code: data.code, lines: data.lines, output: data.output ? new Uint8Array(data.output) : undefined })
      : w.reject(new Error(data.error));
  };
  worker.onerror = () => {
    for (const w of waiting.values()) w.reject(new Error("The PDF unlocker could not load."));
    waiting.clear();
    worker = undefined;
  };
}

/** @type {NonNullable<import("./contract.js").Context["qpdf"]>} */
export function qpdf(args, input) {
  if (!worker) start();
  const id = nextId++;
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    const copy = input.slice().buffer; // the worker takes ownership; keep the caller's bytes
    worker.postMessage({ id, bytes: copy, args }, [copy]);
  });
}
