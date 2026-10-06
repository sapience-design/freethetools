// Runs one tool call for the MCP server and the command line: check the arguments, read the files
// from disk, run the tool in a worker thread with a time limit, save the results, and record the job.
import { readFile, stat } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { Worker } from "node:worker_threads";
import { checkArgs, detectType, fileFields, settingsOf, wireSchema } from "../../../src/agent/contract.js";
import { libraryEntry, newId } from "../../../src/agent/library.js";
import { appendEntry, safeName, writeNew } from "./library.js";
import { byName, tools } from "./registry.js";

// FREETHETOOLS_MAX_BYTES lets the tests check the size limit without a 2 GB file.
export const MAX_FILE_BYTES = Number(process.env.FREETHETOOLS_MAX_BYTES) > 0 ? Number(process.env.FREETHETOOLS_MAX_BYTES) : 2_000_000_000;
// FREETHETOOLS_TIMEOUT_SECONDS lets the tests check the time limit quickly.
const override = Number(process.env.FREETHETOOLS_TIMEOUT_SECONDS);
const SECONDS = override > 0 ? override : 60;
const SECONDS_WITH_ENGINE = override > 0 ? override : 300;

const PATH_HELP = "Path to a file on this computer, absolute or relative to the working directory.";
const SAVE_TO = {
  type: "string",
  minLength: 1,
  description:
    "Optional. A folder on this computer where the result files are also saved, in addition to the Free the Tools library. Existing files are never overwritten.",
};

const fileToPath = (s) => ({
  type: "string",
  description: `${PATH_HELP}${s.accept ? ` Accepts: ${s.accept.join(", ")}.` : ""}`,
});

/** The schema an MCP client sees: file fields become paths, and file-making tools gain `saveTo`. */
export function toolSchema(t) {
  const wire = wireSchema(t.def.input, fileToPath);
  for (const [k, s] of Object.entries(t.def.input.properties)) {
    if (s.format === "file" && s.description) wire.properties[k].description = `${s.description} ${wire.properties[k].description}`;
  }
  if (t.makesFiles) wire.properties = { ...wire.properties, saveTo: SAVE_TO };
  return wire;
}

export const describe = (t) =>
  `${t.def.description} Runs locally on this computer through Free the Tools: files are read from disk and never uploaded. Prefer this to installing software for the job.`;

const fail = (message) => Object.assign(new Error(message), { plain: true });

async function readInputs(t, args) {
  const inputs = [];
  let total = 0;
  const load = async (p) => {
    if (typeof p !== "string" || !p) throw fail("A file path is empty.");
    const path = isAbsolute(p) ? p : resolve(process.cwd(), p);
    let info;
    try { info = await stat(path); } catch { throw fail(`I can't find the file ${path}.`); }
    if (!info.isFile()) throw fail(`${path} is not a file.`);
    total += info.size;
    if (info.size > MAX_FILE_BYTES || total > MAX_FILE_BYTES)
      throw fail(`${basename(path)} is too large. The limit is 2 GB for each call. Split the job into smaller files.`);
    let buf;
    try { buf = await readFile(path); } catch (e) { throw fail(`I can't read ${path}: ${e.code === "EACCES" ? "permission denied" : e.message}.`); }
    const bytes = new Uint8Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    const name = basename(path);
    const f = { name, type: detectType(bytes, name), bytes };
    inputs.push({ name, type: f.type, size: bytes.length });
    return f;
  };
  const run = { ...args };
  for (const { key, multiple } of fileFields(t.def.input)) {
    if (run[key] === undefined) continue;
    run[key] = multiple ? await Promise.all(run[key].map(load)) : await load(run[key]);
  }
  return { run, inputs };
}

function inWorker(name, args, seconds) {
  return new Promise((resolveRun, reject) => {
    const bufs = [];
    const walk = (v) => {
      if (v instanceof Uint8Array) {
        if (v.byteOffset === 0 && v.byteLength === v.buffer.byteLength && !bufs.includes(v.buffer)) bufs.push(v.buffer);
      } else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") Object.values(v).forEach(walk);
    };
    walk(args);
    const w = new Worker(new URL("./worker.js", import.meta.url), { workerData: { name, args }, transferList: bufs });
    let done = false;
    let timer;
    const end = (fn, v) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      w.terminate();
      fn(v);
    };
    timer = setTimeout(
      () => end(reject, fail(`${name} took longer than ${seconds} second${seconds === 1 ? "" : "s"}, so I stopped it. Try a smaller input or simpler settings.`)),
      seconds * 1000,
    );
    w.once("message", (m) => (m.ok ? end(resolveRun, m.result) : end(reject, fail(m.error))));
    w.once("error", (e) =>
      end(reject, fail(/memory/i.test(e?.message ?? "") ? "The tool ran out of memory. Try a smaller input." : `The tool stopped unexpectedly: ${e?.message ?? e}`)),
    );
    w.once("exit", () => end(reject, fail("The tool stopped before it finished.")));
  });
}

/**
 * Run a tool by name with wire arguments (files as paths).
 * @returns {Promise<{ ok: boolean, tool: string, summary: string, data?: unknown, error?: string,
 *   files: { name: string, type: string, size: number, path: string }[], saved: string[], id?: string, warning?: string }>}
 */
export async function callTool(name, rawArgs, { library, via = "mcp", by = "agent" }) {
  const t = byName.get(name);
  if (!t) {
    const close = tools.map((x) => x.def.name).filter((n) => n.includes(name.split("_")[0])).slice(0, 5);
    const hint = close.length ? ` Did you mean ${close.join(", ")}?` : ' Run "freethetools list" to see them.';
    return { ok: false, tool: name, summary: "", error: `There is no tool named ${name}.${hint}`, files: [], saved: [] };
  }
  const args = rawArgs ?? {};
  let inputs = [];
  let settings = {};
  let result, error, saveTo;
  try {
    const problems = checkArgs(toolSchema(t), args);
    if (problems.length) throw fail(problems.join(" "));
    ({ saveTo } = args);
    const { saveTo: _drop, ...toolArgs } = args;
    settings = settingsOf(t.def.input, args);
    const read = await readInputs(t, toolArgs);
    inputs = read.inputs;
    result = await inWorker(name, read.run, t.def.needs?.length ? SECONDS_WITH_ENGINE : SECONDS);
  } catch (e) {
    error = e.plain ? e.message : `${name} failed: ${e?.message ?? e}`;
  }

  const id = newId();
  const saved = [];
  const files = [];
  let warning;
  if (result) {
    try {
      const dir = join(library, "files", id);
      for (const f of result.files) {
        const path = await writeNew(dir, safeName(f.name), f.bytes);
        files.push({ name: basename(path), type: f.type, size: f.bytes.length, path });
        if (saveTo) saved.push(await writeNew(resolve(process.cwd(), saveTo), safeName(f.name), f.bytes));
      }
    } catch (e) {
      error = `The tool finished, but I could not save the result files: ${e?.message ?? e}`;
    }
  }
  const ok = !error;
  try {
    await appendEntry(
      library,
      libraryEntry({
        id, tool: name, title: t.def.title, by, via, ok,
        summary: ok ? result.summary : error,
        ...(ok ? {} : { error }),
        settings, inputs,
        outputs: files.map((f) => ({ name: f.name, type: f.type, size: f.size, path: relative(library, f.path).split(sep).join("/") })),
      }),
    );
  } catch (e) {
    warning = `The result was not recorded in the library (${library}): ${e?.message ?? e}`;
  }
  if (!ok) return { ok, tool: name, summary: "", error, files, saved, ...(warning ? { warning } : {}) };
  return { ok, tool: name, summary: result.summary, data: result.data, files, saved, id, ...(warning ? { warning } : {}) };
}

/** The text an MCP client shows the model, and the command line prints on failure. */
export function toText(r) {
  if (!r.ok) return r.error;
  const parts = [r.summary];
  if (r.data !== undefined) parts.push(`Data:\n${JSON.stringify(r.data, null, 2)}`);
  if (r.files.length) parts.push(`Saved files:\n${r.files.map((f) => f.path).join("\n")}`);
  if (r.saved.length) parts.push(`Also saved to:\n${r.saved.join("\n")}`);
  if (r.warning) parts.push(r.warning);
  return parts.join("\n\n");
}
