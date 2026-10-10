// Writes a review sheet for one language: a two-column Markdown table, English on the left and the
// translation on the right, for every interface string, group and section name, wanted tool and tool
// text. A reviewer edits the right-hand column; scripts/translation-apply.mjs writes the edits back.
// Both scripts use the same row list (scripts/translation-rows.mjs). See docs/adr/0014-languages.md.
//
//   node scripts/translation-sheet.mjs nb path/to/nb-review.md
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { sheetRows } from "./translation-rows.mjs";

const [lang, out] = process.argv.slice(2);
if (!lang || !out || lang === "en") {
  console.error("Usage: node scripts/translation-sheet.mjs <lang> <output.md>   (a language other than en)");
  process.exit(1);
}
const { meta, sections } = sheetRows(lang);
const cell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
const lines = [
  `# ${meta.name} (${lang}): review sheet`,
  "",
  `Status: ${meta.reviewed ? "reviewed" : "not yet reviewed"}. Change the text in the right-hand column and send the sheet back. Apply it with: node scripts/translation-apply.mjs ${lang} <sheet> --write`,
];
let n = 0;
for (const s of sections) {
  if (s.title === "data/csv-to-json") lines.push("", "# Tool texts");
  lines.push("", `## ${s.title}`, "", `| English | ${meta.name} |`, "| --- | --- |");
  for (const r of s.rows) {
    const tr = r.tr ?? "(not translated)";
    lines.push(r.bold ? `| **${cell(r.en)}** | **${cell(tr)}** |` : `| ${cell(r.en)} | ${cell(tr)} |`);
    n++;
  }
}
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, lines.join("\n") + "\n");
console.log(`${out}: ${n} rows`);
