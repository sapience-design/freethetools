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
      const e = JSON.parse(line);
      if (e?.v === LIBRARY_VERSION && typeof e.id === "string" && typeof e.tool === "string") out.push(e);
    } catch {}
  }
  return out;
}

/** One line for library.jsonl. @param {LibraryEntry} e */
export const logLine = (e) => JSON.stringify(e) + "\n";
