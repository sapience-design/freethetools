// The contract every agent tool follows. One definition per tool, in tools/<group>/<slug>/agent.js,
// serves two channels:
//   - the site, through WebMCP: an AI agent in the browser calls the tool on the open page;
//   - the freethetools package, through MCP: an AI assistant on the computer calls it locally.
// A definition never touches the page, the disk or the network. It gets plain values and files as
// bytes, and returns a summary, data and files. Each channel turns those into its own form.
// See docs/adr/0008-tools-for-ai-agents.md.

/**
 * @typedef {{ name: string, type: string, bytes: Uint8Array }} FileIn a file handed to a tool
 * @typedef {{ name: string, type: string, bytes: Uint8Array }} FileOut a file a tool made
 * @typedef {{ summary: string, data?: unknown, files?: FileOut[] }} Result
 * @typedef {{ ghostscript?: (args: string[], input: Uint8Array) => Promise<Uint8Array>, qpdf?: (args: string[], input: Uint8Array) => Promise<{ code: number, lines: string[], output?: Uint8Array }> }} Context
 *   abilities a channel lends to tools that need an engine it loads in its own way
 * @typedef {{
 *   name: string,
 *   title: string,
 *   description: string,
 *   input: Record<string, any>,
 *   makesFiles?: boolean,
 *   needs?: (keyof Context)[],
 *   example?: Record<string, unknown>,
 *   run: (args: any, ctx: Context) => Promise<Result> | Result,
 * }} AgentTool
 *
 * `makesFiles` is true when a result can carry files, so a channel can offer to save them elsewhere.
 * `input` is a JSON Schema object. A string option worth keeping in the library record (a file
 * name, a page range) carries `"x-setting": true`; see settingsOf. A file is
 * `{ type: "string", format: "file", accept?: string[] }`,
 * or an array of those. Channels replace file fields with their own form (a path on disk, or a file
 * added to the page) and hand `run` a FileIn instead.
 */

const NAME = /^[a-z][a-z0-9_]{2,47}$/;

/**
 * Check definitions when a tool module loads, so a mistake fails the build and the tests rather
 * than an agent's call.
 * @param {...AgentTool} defs
 * @returns {AgentTool[]}
 */
export function defineTools(...defs) {
  for (const d of defs) {
    const where = `Agent tool "${d?.name}"`;
    if (!NAME.test(d?.name ?? "")) throw new Error(`${where}: name must be lower_snake_case, 3-48 characters.`);
    if (!d.title || d.title.length > 60) throw new Error(`${where}: title is required, at most 60 characters.`);
    if (!d.description || d.description.length < 40 || d.description.length > 1024)
      throw new Error(`${where}: description must be 40-1024 characters.`);
    if (d.input?.type !== "object" || typeof d.input.properties !== "object") throw new Error(`${where}: input must be an object schema.`);
    for (const r of d.input.required ?? []) if (!(r in d.input.properties)) throw new Error(`${where}: required "${r}" is not a property.`);
    if (typeof d.run !== "function") throw new Error(`${where}: run must be a function.`);
    if (d.makesFiles !== undefined && typeof d.makesFiles !== "boolean") throw new Error(`${where}: makesFiles must be true or false.`);
  }
  return defs;
}

/** Schema for a file input. @param {string} description @param {string[]} [accept] media types */
export const file = (description, accept) => ({ type: "string", format: "file", description, ...(accept ? { accept } : {}) });

/** Schema for a list of files. */
export const files = (description, accept, minItems = 1) => ({ type: "array", items: file(description, accept), minItems, description });

const isFile = (s) => s?.type === "string" && s.format === "file";

/**
 * The file fields of a tool's input.
 * @param {Record<string, any>} schema
 * @returns {{ key: string, multiple: boolean, accept?: string[], required: boolean }[]}
 */
export function fileFields(schema) {
  const req = new Set(schema.required ?? []);
  return Object.entries(schema.properties ?? {}).flatMap(([key, s]) => {
    if (isFile(s)) return [{ key, multiple: false, accept: s.accept, required: req.has(key) }];
    if (s.type === "array" && isFile(s.items)) return [{ key, multiple: true, accept: s.items.accept, required: req.has(key) }];
    return [];
  });
}

/**
 * The schema a channel publishes: each file field replaced by the channel's own form.
 * @param {Record<string, any>} schema
 * @param {(fileSchema: Record<string, any>) => Record<string, any>} replace
 */
export function wireSchema(schema, replace) {
  const props = {};
  for (const [key, s] of Object.entries(schema.properties ?? {})) {
    if (isFile(s)) props[key] = replace(s);
    else if (s.type === "array" && isFile(s.items)) props[key] = { ...s, items: replace(s.items) };
    else props[key] = s;
  }
  return { ...schema, properties: props };
}

/**
 * The arguments worth keeping in the library record: options, never content. Kept are booleans,
 * numbers, values from an `enum` (or arrays of them), and strings the schema marks with
 * `"x-setting": true`, such as a file name or a page range. Everything else is left out: free
 * text, secrets (a Wi-Fi password, a JWT secret), form answers, nested objects and files.
 * An allowlist, so a new tool records nothing private unless it says a field is a setting.
 */
export function settingsOf(schema, args) {
  const props = schema.properties ?? {};
  const out = {};
  for (const [k, v] of Object.entries(args ?? {})) {
    if (!Object.hasOwn(props, k)) continue;
    const s = props[k];
    const plainSetting = (x) => typeof x === "string" && x.length <= 200;
    const keep =
      s.enum ? s.enum.includes(v)
      : s.type === "boolean" ? typeof v === "boolean"
      : s.type === "number" || s.type === "integer" ? typeof v === "number" && Number.isFinite(v)
      : s.type === "array" && s.items?.enum ? Array.isArray(v) && v.every((x) => s.items.enum.includes(x))
      : s["x-setting"] === true && s.type === "array" ? Array.isArray(v) && v.length <= 50 && v.every(plainSetting)
      : s["x-setting"] === true && plainSetting(v);
    if (keep) out[k] = v;
  }
  return out;
}

const TYPES = {
  string: (v) => typeof v === "string",
  number: (v) => typeof v === "number" && Number.isFinite(v),
  integer: (v) => Number.isInteger(v),
  boolean: (v) => typeof v === "boolean",
  array: Array.isArray,
  object: (v) => v !== null && typeof v === "object" && !Array.isArray(v),
};

/**
 * Arguments ready for run(): options sent as null are dropped, so the tool's defaults apply.
 * Call it after checkArgs.
 * @param {Record<string, unknown>} args
 */
export function cleanArgs(args) {
  return Object.fromEntries(Object.entries(args ?? {}).filter(([, v]) => v !== null && v !== undefined));
}

/**
 * Check arguments against a schema: the subset of JSON Schema that tool inputs use (type,
 * required, enum, minimum, maximum, minLength, maxLength, minItems, maxItems, items, properties,
 * additionalProperties). Returns plain-language problems; an empty list means the call is fine.
 * @param {Record<string, any>} schema
 * @param {unknown} value
 * @param {string} [path]
 * @returns {string[]}
 */
export function checkArgs(schema, value, path = "") {
  const at = path || "input";
  const errs = [];
  const types = [schema.type].flat().filter(Boolean);
  if (types.length && !types.some((t) => TYPES[t]?.(value))) return [`${at} should be ${types.join(" or ")}.`];
  if (schema.enum && !schema.enum.includes(value)) errs.push(`${at} should be one of: ${schema.enum.join(", ")}.`);
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) errs.push(`${at} should be at least ${schema.minimum}.`);
    if (schema.maximum !== undefined && value > schema.maximum) errs.push(`${at} should be at most ${schema.maximum}.`);
  }
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) errs.push(schema.minLength === 1 ? `${at} should not be empty.` : `${at} should be at least ${schema.minLength} characters.`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errs.push(`${at} should be at most ${schema.maxLength} characters.`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errs.push(`${at} needs at least ${schema.minItems} item(s).`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errs.push(`${at} takes at most ${schema.maxItems} items.`);
    if (schema.items) value.forEach((v, i) => errs.push(...checkArgs(schema.items, v, `${at}[${i}]`)));
  }
  if (TYPES.object(value) && (schema.properties || schema.required)) {
    const req = new Set(schema.required ?? []);
    for (const r of req) if (value[r] === undefined || value[r] === null) errs.push(`${path ? path + "." : ""}${r} is required.`);
    for (const [k, v] of Object.entries(value)) {
      if (v === null && !req.has(k)) continue; // some clients send null for an option they leave unset
      const sub = schema.properties && Object.hasOwn(schema.properties, k) ? schema.properties[k] : undefined;
      if (sub) errs.push(...checkArgs(sub, v, path ? `${path}.${k}` : k));
      else if (schema.additionalProperties === false) errs.push(`${path ? path + "." : ""}${k} is not an option for this tool.`);
      else if (typeof schema.additionalProperties === "object") errs.push(...checkArgs(schema.additionalProperties, v, path ? `${path}.${k}` : k));
    }
  }
  return errs;
}

// ---- Small helpers shared by definitions and channels ------------------------------------------

/** "report.final.pdf" -> "report.final" */
export const baseName = (name) => String(name).replace(/\.[^.]+$/, "");

/** Media type from a file's first bytes, then its extension. */
export function detectType(bytes, name = "") {
  const b = bytes;
  const ascii = (o, n) => String.fromCharCode(...b.subarray(o, o + n));
  if (b.length >= 5 && ascii(0, 5) === "%PDF-") return "application/pdf";
  if (b[0] === 0x89 && b.length >= 4 && ascii(1, 3) === "PNG") return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") return "image/webp";
  if (b.length >= 6 && /^GIF8[79]a$/.test(ascii(0, 6))) return "image/gif";
  const ext = String(name).toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  return EXT_TYPES[ext] ?? "application/octet-stream";
}

const EXT_TYPES = {
  pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif",
  svg: "image/svg+xml", csv: "text/csv", tsv: "text/tab-separated-values", json: "application/json", txt: "text/plain",
  md: "text/markdown", html: "text/html", htm: "text/html",
};

/** Throw a plain-language error unless a file is one of the accepted media types. */
export function expectType(f, accept, what) {
  if (accept.includes(f.type)) return;
  throw new Error(`${f.name} isn't ${what}.`);
}

/** Text from a FileIn, as UTF-8. */
export const textOf = (f) => new TextDecoder().decode(f.bytes);

/** A FileOut from text. */
export const textFile = (name, type, text) => ({ name, type, bytes: new TextEncoder().encode(text) });

/**
 * For tools that take either text or a file: returns the text and the file it came from, if any.
 * Rule shared by every tool: text in gives text out, a file in gives a file out.
 * @param {{ text?: string, file?: FileIn }} args
 * @param {string} what what the input is, for the error message, e.g. "CSV"
 */
export function textOrFile({ text, file: f }, what) {
  if (f && text !== undefined) throw new Error(`Give either ${what} text or a file, not both.`);
  if (f) return { text: textOf(f), file: f };
  if (text !== undefined) return { text, file: null };
  throw new Error(`Give some ${what} text, or a file.`);
}
