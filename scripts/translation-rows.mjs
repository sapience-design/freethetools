// The rows of a translation review sheet, in sheet order, each with the English text, the current
// translation and a way to change it. scripts/translation-sheet.mjs writes these rows to a sheet;
// scripts/translation-apply.mjs reads a reviewed sheet back. Keeping both on this one list means a
// row in the sheet always maps to the same place in the files. See docs/adr/0014-languages.md.
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { flatten } from "../src/i18n/core.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));

/** JSON with two-space indents and lists of plain values on one line, as src/i18n/<lang>.json is written. */
export function compactJson(value, indent = "", limit = Number(process.env.FTT_JSON_LIMIT ?? 100)) {
  const inner = indent + "  ";
  // A short record of plain values stays on one line: { "one": "{n} tool", "other": "{n} tools" }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const vals = Object.values(value);
    if (vals.length && vals.every((x) => x === null || typeof x !== "object")) {
      const flat = `{ ${Object.entries(value).map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(", ")} }`;
      if (flat.length <= limit) return flat;
    }
  }
  if (Array.isArray(value)) {
    if (value.every((x) => x === null || typeof x !== "object")) return `[${value.map((x) => JSON.stringify(x)).join(", ")}]`;
    return `[\n${value.map((x) => inner + compactJson(x, inner)).join(",\n")}\n${indent}]`;
  }
  if (value && typeof value === "object") {
    const keys = Object.keys(value);
    if (!keys.length) return "{}";
    return `{\n${keys.map((k) => `${inner}${JSON.stringify(k)}: ${compactJson(value[k], inner, limit)}`).join(",\n")}\n${indent}}`;
  }
  return JSON.stringify(value);
}

/** Set a dotted key ("js.donate.title") inside a nested object, creating objects on the way. */
function setPath(obj, dotted, value) {
  const keys = dotted.split(".");
  let o = obj;
  for (const k of keys.slice(0, -1)) o = o[k] ??= {};
  o[keys.at(-1)] = value;
}

/**
 * @param {string} lang
 * @returns {{ meta: any, sections: { title: string, rows: { en: string, tr: string | undefined, bold?: boolean, set: (v: string) => void }[] }[], save: () => string[] }}
 */
export function sheetRows(lang) {
  const file = `src/i18n/${lang}.json`;
  if (!existsSync(join(root, file))) throw new Error(`${file} does not exist.`);
  const en = read("src/i18n/en.json");
  const tr = read(file);
  const dirty = new Map(); // files changed, to write back: path -> object
  const markMain = () => dirty.set(file, tr);
  const sections = [];
  const section = (title) => { const s = { title, rows: [] }; sections.push(s); return s.rows; };

  // Interface strings: plain ones first, then the ones scripts build (keys under "js.").
  const fe = flatten(en.ui), ft = flatten(tr.ui ?? {});
  const ui = (k) => ({ en: fe[k], tr: ft[k], set: (v) => { setPath(tr.ui ??= {}, k, v); markMain(); } });
  let rows = section("Interface: top bar, footer, notes");
  for (const k of Object.keys(fe)) if (!k.startsWith("js.")) rows.push(ui(k));
  rows = section("Interface: text built by scripts (counts, search, donation card)");
  for (const k of Object.keys(fe)) if (k.startsWith("js.")) rows.push(ui(k));

  // Groups and section names, from src/data/categories.ts.
  const cats = readFileSync(join(root, "src/data/categories.ts"), "utf8").split("\n").filter((l) => l.trimStart().startsWith("{ slug: "));
  rows = section("Groups");
  for (const l of cats) {
    const g = (k) => new RegExp(`\\b${k}: "([^"]*)"`).exec(l)?.[1] ?? "";
    const slug = g("slug");
    for (const k of ["name", "label", "title", "blurb", "sub"]) rows.push({ en: g(k), tr: tr.groups?.[slug]?.[k], set: (v) => { setPath(tr, `groups.${slug}.${k}`, v); markMain(); } });
  }
  rows = section("Section names");
  const secs = new Set(cats.flatMap((l) => [.../sections: \[([^\]]*)\]/.exec(l)?.[1].matchAll(/"([^"]+)"/g) ?? []].map((m) => m[1])));
  for (const s of secs) rows.push({ en: s, tr: tr.sections?.[s], set: (v) => { (tr.sections ??= {})[s] = v; markMain(); } });

  rows = section("Home page: most people come for");
  for (const m of readFileSync(join(root, "src/data/popular.ts"), "utf8").matchAll(/\["([^"]+)", "([^"]+)"\]/g)) {
    const id = m[1];
    rows.push({ en: m[2], tr: tr.popular?.[id], set: (v) => { (tr.popular ??= {})[id] = v; markMain(); } });
  }

  rows = section("Tools not built yet");
  for (const w of read("src/data/wanted.json")) {
    const id = `${w.category}/${w.slug}`;
    const t = () => { markMain(); return ((tr.wanted ??= {})[id] ??= {}); };
    rows.push({ en: w.name, tr: tr.wanted?.[id]?.name, bold: true, set: (v) => { t().name = v; } });
    rows.push({ en: w.task, tr: tr.wanted?.[id]?.task, set: (v) => { t().task = v; } });
    rows.push({ en: w.blurb, tr: tr.wanted?.[id]?.blurb, set: (v) => { t().blurb = v; } });
    rows.push({ en: w.concept.in, tr: tr.wanted?.[id]?.concept?.in, set: (v) => { (t().concept ??= {}).in = v; } });
    rows.push({ en: w.concept.out, tr: tr.wanted?.[id]?.concept?.out, set: (v) => { (t().concept ??= {}).out = v; } });
    w.concept.options.forEach((o, i) => rows.push({ en: o, tr: tr.wanted?.[id]?.concept?.options?.[i], set: (v) => { ((t().concept ??= {}).options ??= [])[i] = v; } }));
  }

  // Tool texts, one file per tool.
  const tools = join(root, "tools");
  for (const g of readdirSync(tools).sort()) {
    if (g.startsWith("_") || !statSync(join(tools, g)).isDirectory()) continue;
    for (const s of readdirSync(join(tools, g)).sort()) {
      const base = join("tools", g, s).replace(/\\/g, "/");
      if (!existsSync(join(root, base, "tool.json"))) continue;
      const d = read(`${base}/tool.json`);
      const p = `${base}/i18n/${lang}.json`;
      const t = existsSync(join(root, p)) ? read(p) : {};
      const mark = () => dirty.set(p, t);
      rows = section(`${g}/${s}`);
      for (const k of ["name", "task", "tagline", "seoTitle", "description"]) rows.push({ en: d[k], tr: t[k], set: (v) => { t[k] = v; mark(); } });
      rows.push({ en: d.keywords.join(", "), tr: (t.keywords ?? []).join(", "), set: (v) => { t.keywords = v.split(",").map((x) => x.trim()).filter(Boolean); mark(); } });
      Object.entries(d.specs).forEach(([k, v], i) => {
        const e = Object.entries(t.specs ?? {})[i];
        rows.push({
          en: `${k}: ${v}`, tr: e ? `${e[0]}: ${e[1]}` : undefined,
          // "Label: value": the label is the text up to the first ": ". Rebuild specs in order.
          set: (val) => {
            const cut = val.indexOf(": ");
            const entries = Object.entries(t.specs ?? {});
            entries[i] = cut > 0 ? [val.slice(0, cut), val.slice(cut + 2)] : [val, ""];
            t.specs = Object.fromEntries(entries);
            mark();
          },
        });
      });
      d.faq.forEach((f, i) => {
        const q = () => ((t.faq ??= [])[i] ??= {});
        rows.push({ en: f.q, tr: t.faq?.[i]?.q, bold: true, set: (v) => { q().q = v; mark(); } });
        rows.push({ en: f.a, tr: t.faq?.[i]?.a, set: (v) => { q().a = v; mark(); } });
      });
    }
  }

  const save = () => {
    for (const [p, obj] of dirty) writeFileSync(join(root, p), JSON.stringify(obj, null, 2) + "\n");
    return [...dirty.keys()];
  };
  return { meta: tr.meta, sections, save };
}
