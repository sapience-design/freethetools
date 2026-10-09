// Runs one tool call off the main thread, so the parent can stop it if it runs too long.
import { parentPort, workerData } from "node:worker_threads";
import { byName } from "./registry.js";

const { name, args } = workerData;
try {
  const { def } = byName.get(name);
  const ctx = {};
  if (def.needs?.includes("ghostscript")) ctx.ghostscript = (await import("./ghostscript.js")).ghostscript;
  if (def.needs?.includes("qpdf")) ctx.qpdf = (await import("./qpdf.js")).qpdf;
  const r = await def.run(args, ctx);
  const files = (r.files ?? []).map((f) => ({ name: f.name, type: f.type, bytes: f.bytes }));
  const buffers = [...new Set(files.map((f) => f.bytes.buffer))].filter((b) => b instanceof ArrayBuffer);
  parentPort.postMessage({ ok: true, result: { summary: r.summary, data: r.data, files } }, buffers);
} catch (e) {
  parentPort.postMessage({ ok: false, error: String(e?.message ?? e) });
}
