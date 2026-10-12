// Free the Tools as a code library: the same tools as the MCP server and the command line, called
// from your own code on your own computer. Files go in as paths or bytes and come back as bytes.
// Nothing is written to disk, recorded in the library folder or sent anywhere.
//
//   import { compressPdf, run, listTools } from "freethetools";
//   const { files } = await compressPdf({ file: "report.pdf", quality: "smallest" });
import { checkArgs, cleanArgs, fileFields, wireSchema } from "../../../src/agent/contract.js";
import { inWorker, readInputs, secondsFor } from "./engine.js";
import { byName, tools } from "./registry.js";
import { foldersFor } from "./safety.js";

/** Every mistake in a call, and every tool failure, with a plain message. */
export class FreeTheToolsError extends Error {
  constructor(message) {
    super(message);
    this.name = "FreeTheToolsError";
  }
}

// File fields take a path or bytes, so their type is left open here and run() checks them itself.
const inputOf = (t) => wireSchema(t.def.input, (s) => ({ description: s.description, ...(s.accept ? { accept: s.accept } : {}) }));

/** Every tool: its name, title, description, whether it makes files, and its options as JSON Schema. */
export function listTools() {
  return tools.map((t) => ({ name: t.def.name, title: t.def.title, description: t.def.description, makesFiles: t.makesFiles, input: inputOf(t) }));
}

// A path stays a path: it is read and checked as the command line reads it (hidden files are refused).
// Bytes are copied, because the engine hands its buffers to a worker thread, which would empty yours.
async function toFile(v, key) {
  if (typeof v === "string") return v;
  if (v instanceof ArrayBuffer) return { name: key, bytes: new Uint8Array(v.slice(0)) };
  if (ArrayBuffer.isView(v)) return { name: key, bytes: new Uint8Array(v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength)) };
  if (typeof Blob !== "undefined" && v instanceof Blob) return { name: typeof v.name === "string" && v.name ? v.name : key, bytes: new Uint8Array(await v.arrayBuffer()) };
  if (v && typeof v === "object" && typeof v.name === "string" && v.name && v.bytes !== undefined && typeof v.bytes !== "string") {
    const f = await toFile(v.bytes, key);
    return { name: v.name, bytes: f.bytes };
  }
  throw new FreeTheToolsError(`${key} should be a file path, bytes (a Uint8Array or Buffer), a Blob, or { name, bytes }.`);
}

/**
 * Run one tool.
 * @param {string} name a tool name from listTools(), such as "compress_pdf"
 * @param {Record<string, unknown>} [args] the tool's options; file fields take paths or bytes
 * @param {{ timeout?: number }} [options] seconds before the call is stopped (default 60, or 300 for engine tools)
 * @returns {Promise<{ tool: string, summary: string, data?: unknown, files: { name: string, type: string, size: number, bytes: Uint8Array }[] }>}
 */
export async function run(name, args = {}, { timeout } = {}) {
  const t = byName.get(name);
  if (!t) throw new FreeTheToolsError(`There is no tool named ${name}. listTools() gives every name.`);
  if (!args || typeof args !== "object" || Array.isArray(args)) throw new FreeTheToolsError(`The options for ${name} should be an object.`);
  const given = { ...args };
  for (const { key, multiple } of fileFields(t.def.input)) {
    const v = given[key];
    if (v === undefined || v === null) continue;
    if (multiple && !Array.isArray(v)) continue; // checkArgs below says it should be a list
    given[key] = multiple ? await Promise.all(v.map((x) => toFile(x, key))) : await toFile(v, key);
  }
  const problems = checkArgs(inputOf(t), given);
  if (problems.length) throw new FreeTheToolsError(problems.join(" "));
  try {
    const folders = await foldersFor({ library: process.cwd() });
    const { run: ready } = await readInputs(t, cleanArgs(given), folders);
    const seconds = typeof timeout === "number" && timeout > 0 ? timeout : secondsFor(t);
    const r = await inWorker(name, ready, seconds);
    return {
      tool: name,
      summary: r.summary,
      ...(r.data === undefined ? {} : { data: r.data }),
      files: r.files.map((f) => ({ name: f.name, type: f.type, size: f.bytes.length, bytes: f.bytes })),
    };
  } catch (e) {
    throw new FreeTheToolsError(e?.plain ? e.message : `${name} failed: ${e?.message ?? e}`);
  }
}
