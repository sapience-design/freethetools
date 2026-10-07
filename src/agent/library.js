// The library: a record of every job a tool did, kept only on the device that did it.
// The site keeps records in the browser (IndexedDB); the freethetools package appends them, one
// JSON object per line, to library.jsonl in its "Free the Tools" folder, with result files under
// files/<id>/. Both use this one format, so the site's library page can also open the package's
// folder. Nothing in a record is ever sent anywhere.

export const LIBRARY_VERSION = 1;

/** Name of the log file inside the package's folder. */
export const LOG_FILE = "library.jsonl";

/**
 * @typedef {{ name: string, size: number, type: string }} FileFacts
 * @typedef {{
 *   v: 1,
 *   id: string,
 *   time: string,
 *   tool: string,
 *   title: string,
 *   by: "you" | "agent",
 *   via: "site" | "webmcp" | "mcp",
 *   ok: boolean,
 *   summary: string,
 *   error?: string,
 *   settings: Record<string, unknown>,
 *   inputs: FileFacts[],
 *   outputs: (FileFacts & { path?: string })[],
 * }} LibraryEntry
 *   `path` is set by the package: the result's place on disk, relative to its folder.
 */

/** A short, sortable, unique id: time first, then randomness. */
export function newId(now = Date.now()) {
  const rand = crypto.getRandomValues(new Uint8Array(6));
  return `${now.toString(36)}-${[...rand].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/** @param {{ name: string, type: string, bytes?: Uint8Array, size?: number }} f @returns {FileFacts} */
export const factsOf = (f) => ({ name: f.name, size: f.size ?? f.bytes?.length ?? 0, type: f.type });

/**
 * Build a record.
 * @param {{
 *   tool: string, title: string, by: "you" | "agent", via: "site" | "webmcp" | "mcp",
 *   ok: boolean, summary?: string, error?: string, settings?: Record<string, unknown>,
 *   inputs?: { name: string, type: string, bytes?: Uint8Array, size?: number }[],
 *   outputs?: { name: string, type: string, bytes?: Uint8Array, size?: number, path?: string }[],
 *   now?: number, id?: string,
 * }} p
 * @returns {LibraryEntry}
 */
export function libraryEntry(p) {
  const now = p.now ?? Date.now();
  return {
    v: LIBRARY_VERSION,
    id: p.id ?? newId(now),
    time: new Date(now).toISOString(),
    tool: p.tool,
    title: p.title,
    by: p.by,
    via: p.via,
    ok: p.ok,
    summary: p.summary ?? (p.ok ? "Done" : "Failed"),
    ...(p.error ? { error: p.error } : {}),
    settings: p.settings ?? {},
    inputs: (p.inputs ?? []).map(factsOf),
    outputs: (p.outputs ?? []).map((f) => ({ ...factsOf(f), ...(f.path ? { path: f.path } : {}) })),
  };
}

/**
 * Read a library.jsonl file's text. Lines that aren't a version-1 record are skipped, so a damaged
 * line never hides the rest.
 * @param {string} text
 * @returns {LibraryEntry[]}
 */
export function parseLog(text) {
  const out = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const e = normalize(JSON.parse(line));
      if (e) out.push(e);
    } catch {}
  }
  return out;
}

const str = (v, max = 500) => (typeof v === "string" ? v.slice(0, max) : "");
const num = (v) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);

/** A clean file entry, or null. A `path` must stay inside the folder: no "..", no absolute path. */
function fileFacts(f) {
  if (!f || typeof f !== "object" || typeof f.name !== "string") return null;
  const out = { name: str(f.name, 255), size: num(f.size), type: str(f.type, 100) };
  if (typeof f.path === "string") {
    const parts = f.path.split(/[\\/]/);
    if (!/^[a-zA-Z]:/.test(f.path) && !f.path.startsWith("/") && parts.every((p) => p && p !== "." && p !== "..")) out.path = parts.join("/");
  }
  return out;
}

/**
 * Turn a parsed line into a well-formed record, or null. The file can be edited by anyone with
 * access to the folder, so every field is checked and given a safe default; one bad line must
 * never break the library page.
 */
function normalize(e) {
  if (!e || typeof e !== "object" || e.v !== LIBRARY_VERSION || typeof e.id !== "string" || typeof e.tool !== "string") return null;
  const time = typeof e.time === "string" && !Number.isNaN(Date.parse(e.time)) ? e.time : new Date(0).toISOString();
  const settings = {};
  if (e.settings && typeof e.settings === "object" && !Array.isArray(e.settings)) {
    for (const [k, v] of Object.entries(e.settings).slice(0, 30)) {
      if (["string", "number", "boolean"].includes(typeof v) || Array.isArray(v)) settings[str(k, 60)] = typeof v === "string" ? str(v, 200) : v;
    }
  }
  return {
    v: LIBRARY_VERSION,
    id: str(e.id, 100),
    time,
    tool: str(e.tool, 100),
    title: str(e.title, 100) || str(e.tool, 100),
    by: e.by === "you" ? "you" : "agent",
    via: ["site", "webmcp", "mcp"].includes(e.via) ? e.via : "mcp",
    ok: e.ok === true,
    summary: str(e.summary) || (e.ok === true ? "Done" : "Failed"),
    ...(typeof e.error === "string" ? { error: str(e.error) } : {}),
    settings,
    inputs: (Array.isArray(e.inputs) ? e.inputs : []).map(fileFacts).filter(Boolean),
    outputs: (Array.isArray(e.outputs) ? e.outputs : []).map(fileFacts).filter(Boolean),
  };
}

/** One line for library.jsonl. @param {LibraryEntry} e */
export const logLine = (e) => JSON.stringify(e) + "\n";
