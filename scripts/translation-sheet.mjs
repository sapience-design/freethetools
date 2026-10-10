// Writes a review sheet for one language: a two-column Markdown table, English on the left and the
// translation on the right, for every interface string, group and section name, wanted tool and tool
// text. A reviewer reads it and marks what to change. See docs/adr/0014-languages.md.
//
//   node scripts/translation-sheet.mjs nb path/to/nb-review.md
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { flatten } from "../src/i18n/core.js";

const [lang, out] = process.argv.slice(2);
if (!lang || !out || lang === "en") {
  console.error("Usage: node scripts/translation-sheet.mjs <lang> <output.md>   (a language other than en)");
  process.exit(1);
}
const root = fileURLToPath(new URL("..", import.meta.url));
const json = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));
const file = `src/i18n/${lang}.json`;
if (!existsSync(join(root, file))) { console.error(`${file} does not exist.`); process.exit(1); }
const en = json("src/i18n/en.json"), tr = json(file);

const cell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
const lines = [];
const section = (title) => lines.push("", `## ${title}`, "", "| English | " + tr.meta.name + " |", "| --- | --- |");
const row = (a, b) => lines.push(`| ${cell(a)} | ${cell(b)} |`);

lines.push(`# ${tr.meta.name} (${lang}): review sheet`, "", `Status: ${tr.meta.reviewed ? "reviewed" : "not yet reviewed"}. Change the text in the right-hand column; send the sheet back with your edits.`);

// Interface
const fe = flatten(en.ui), ft = flatten(tr.ui);
for (const [name, prefix] of [["Interface: top bar, footer, notes", ""]]) {
  section(name);
  for (const k of Object.keys(fe)) if (!k.startsWith("js.")) row(fe[k], ft[k] ?? "(not translated)");
}
section("Interface: text built by scripts (counts, search, donation card)");
for (const k of Object.keys(fe)) if (k.startsWith("js.")) row(fe[k], ft[k] ?? "(not translated)");

// Groups and sections, from src/data/categories.ts
const cats = readFileSync(join(root, "src/data/categories.ts"), "utf8").split("\n").filter((l) => l.trimStart().startsWith("{ slug: "));
section("Groups");
for (const l of cats) {
  const g = (k) => new RegExp(`\\b${k}: "([^"]*)"`).exec(l)?.[1] ?? "";
  const slug = g("slug");
  for (const k of ["name", "label", "title", "blurb", "sub"]) row(g(k), tr.groups?.[slug]?.[k] ?? "(not translated)");
}
section("Section names");
const secs = new Set(cats.flatMap((l) => [.../sections: \[([^\]]*)\]/.exec(l)?.[1].matchAll(/"([^"]+)"/g) ?? []].map((m) => m[1])));
for (const s of secs) row(s, tr.sections?.[s] ?? "(not translated)");

// "Most people come for"
section("Home page: most people come for");
for (const m of readFileSync(join(root, "src/data/popular.ts"), "utf8").matchAll(/\["([^"]+)", "([^"]+)"\]/g)) row(m[2], tr.popular?.[m[1]] ?? "(not translated)");

// Wanted tools
section("Tools not built yet");
for (const w of json("src/data/wanted.json")) {
  const t = tr.wanted?.[`${w.category}/${w.slug}`];
  row(`**${w.name}**`, `**${t?.name ?? "(not translated)"}**`);
  row(w.task, t?.task); row(w.blurb, t?.blurb); row(w.concept.in, t?.concept?.in); row(w.concept.out, t?.concept?.out);
  w.concept.options.forEach((o, i) => row(o, t?.concept?.options?.[i]));
}

// Tools
lines.push("", "# Tool texts");
const tools = join(root, "tools");
for (const g of readdirSync(tools).sort()) {
  if (g.startsWith("_") || !statSync(join(tools, g)).isDirectory()) continue;
  for (const s of readdirSync(join(tools, g)).sort()) {
    const base = join("tools", g, s);
    if (!existsSync(join(root, base, "tool.json"))) continue;
    const d = json(`${base}/tool.json`);
    const p = `${base}/i18n/${lang}.json`;
    const t = existsSync(join(root, p)) ? json(p) : {};
    section(`${g}/${s}`);
    for (const k of ["name", "task", "tagline", "seoTitle", "description"]) row(d[k], t[k] ?? "(not translated)");
    row(d.keywords.join(", "), (t.keywords ?? []).join(", "));
    Object.entries(d.specs).forEach(([k, v], i) => { const e = Object.entries(t.specs ?? {})[i]; row(`${k}: ${v}`, e ? `${e[0]}: ${e[1]}` : "(not translated)"); });
    d.faq.forEach((f, i) => { row(`**${f.q}**`, `**${t.faq?.[i]?.q ?? "(not translated)"}**`); row(f.a, t.faq?.[i]?.a); });
  }
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, lines.join("\n") + "\n");
console.log(`${out}: ${lines.filter((l) => l.startsWith("| ") && !l.startsWith("| English") && !l.startsWith("| ---")).length} rows`);
