// Pure helpers for the browser side of the agent tools and the library: settings snapshots,
// grouping downloads into jobs, and turning an agent's file arguments into files. No DOM, no
// storage, so `npm test` can run them in Node.
import { detectType, fileFields } from "./contract.js";

/** Largest file an agent may pass inline as base64. Bigger files should be added to the page. */
export const MAX_INLINE_BYTES = 10 * 1024 * 1024;

/**
 * @typedef {{ type: string, label: string, group?: string, value?: string, checked?: boolean }} Control
 * A form control as the page sees it: `type` is "checkbox", "radio", "select" or an input type;
 * for a select `value` is the chosen option's text; for a radio `label` is its own label and
 * `group` the question it answers.
 */

const TEXTY = new Set(["text", "search", "number", "range", "url", "email", "tel", "date", "time", "datetime-local", "month", "week", "color"]);

/**
 * The settings of a tool's form, keyed by label text. Checkboxes give true or false, radios the
 * label of the chosen option, selects the chosen option's text, numbers a number and short text
 * inputs their text. Long text and passwords are left out.
 * @param {Control[]} controls
 * @returns {Record<string, string | number | boolean>}
 */
export function snapshotSettings(controls) {
  const out = {};
  const put = (key, v) => {
    const base = key.trim().replace(/\s+/g, " ").slice(0, 56);
    if (!base) return;
    let k = base;
    for (let n = 2; k in out; n++) k = `${base} ${n}`;
    out[k] = v;
  };
  for (const c of controls) {
    if (c.type === "checkbox") put(c.label, !!c.checked);
    else if (c.type === "radio") {
      if (c.checked) put(c.group || c.label, c.label.trim());
    } else if (c.type === "select") {
      if (c.value) put(c.label, c.value.trim());
    } else if (c.type === "number" || c.type === "range") {
      const n = Number(c.value);
      if (c.value !== "" && Number.isFinite(n)) put(c.label, n);
    } else if (TEXTY.has(c.type)) {
      const v = (c.value ?? "").trim();
      if (v && v.length <= 80) put(c.label, v);
    }
  }
  return out;
}

/**
 * Group items made in a burst into one job: a new group starts when more than `gap` ms passed
 * since the previous item. Items must be sorted by `t`.
 * @template {{ t: number }} T
 * @param {T[]} items
 * @param {number} [gap]
 * @returns {T[][]}
 */
export function groupBursts(items, gap = 600) {
  const groups = [];
  for (const it of items) {
    const last = groups[groups.length - 1];
    if (last && it.t - last[last.length - 1].t <= gap) last.push(it);
    else groups.push([it]);
  }
  return groups;
}

/** Identity of a File the person added, so adding it twice lists it once. */
export const fileKey = (f) => `${f.name}|${f.size}|${f.lastModified ?? 0}`;

const decodeBase64 = (s) => {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

/**
 * Turn one file argument from an agent into a FileIn. The argument is either the name of a file
 * on the page, or `{ name, base64 }` for a small file.
 * @param {unknown} arg
 * @param {{ name: string, size: number, read: () => Promise<Uint8Array> }[]} onPage newest last
 * @param {number} [max]
 * @returns {Promise<{ name: string, type: string, bytes: Uint8Array }>}
 */
export async function resolveFileArg(arg, onPage, max = MAX_INLINE_BYTES) {
  if (typeof arg === "string") {
    const newest = [...onPage].reverse();
    const hit = newest.find((f) => f.name === arg) ?? newest.find((f) => f.name.toLowerCase() === arg.toLowerCase());
    if (!hit) {
      const names = [...new Set(onPage.map((f) => f.name))];
      throw new Error(
        names.length
          ? `There is no file named "${arg}" on this page. Files here: ${names.join(", ")}. Ask the person to add it, or pass { name, base64 }.`
          : `There is no file named "${arg}" on this page. Ask the person to drop the file on the page, then call list_page_files.`,
      );
    }
    const bytes = await hit.read();
    return { name: hit.name, type: detectType(bytes, hit.name), bytes };
  }
  if (arg && typeof arg === "object" && typeof arg.name === "string" && typeof arg.base64 === "string") {
    const clean = arg.base64.replace(/\s+/g, "");
    const approx = Math.floor((clean.length * 3) / 4);
    if (approx > max) {
      throw new Error(`${arg.name} is too big to pass inline (limit ${Math.round(max / 1048576)} MB). Ask the person to add it to the page, then use its name.`);
    }
    let bytes;
    try {
      bytes = decodeBase64(clean);
    } catch {
      throw new Error(`The base64 for ${arg.name} isn't valid.`);
    }
    return { name: arg.name, type: detectType(bytes, arg.name), bytes };
  }
  throw new Error("A file is given as the name of a file on the page, or as { name, base64 }.");
}

/** The schema an agent sees for a file field. */
export const wireFile = (s) => ({
  type: ["string", "object"],
  description: `${s.description ?? "A file."} Give the name of a file the person added to this page (see list_page_files), or { name, base64 } for a file up to ${MAX_INLINE_BYTES / 1048576} MB.${s.accept ? ` Accepts: ${s.accept.join(", ")}.` : ""}`,
  properties: { name: { type: "string", minLength: 1 }, base64: { type: "string", minLength: 1 } },
  required: ["name", "base64"],
});

/**
 * Resolve every file field of a tool's arguments; other arguments pass through.
 * @param {Record<string, any>} schema the tool's own input schema
 * @param {Record<string, any>} args wire arguments
 * @param {Parameters<typeof resolveFileArg>[1]} onPage
 */
export async function resolveArgs(schema, args, onPage, max = MAX_INLINE_BYTES) {
  const out = { ...args };
  const inputs = [];
  for (const f of fileFields(schema)) {
    if (out[f.key] === undefined) continue;
    if (f.multiple) {
      out[f.key] = await Promise.all([out[f.key]].flat().map((a) => resolveFileArg(a, onPage, max)));
      inputs.push(...out[f.key]);
    } else {
      out[f.key] = await resolveFileArg(out[f.key], onPage, max);
      inputs.push(out[f.key]);
    }
  }
  return { args: out, inputs };
}

const kb = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(2)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`);

/** Text for the agent after a successful call. */
export function successText(result, outputs) {
  const lines = [result.summary];
  if (outputs.length) {
    lines.push(
      `Result files (shown on this page and saved in the library on this device; nothing was uploaded): ${outputs.map((f) => `${f.name} (${f.type}, ${kb(f.size)})`).join(", ")}.`,
    );
  }
  if (result.data !== undefined) lines.push(`Data: ${JSON.stringify(result.data)}`);
  return lines.join("\n");
}
