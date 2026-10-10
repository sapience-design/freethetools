// Reads a reviewed translation sheet (made by scripts/translation-sheet.mjs, edited by a reviewer)
// and writes every changed right-hand cell back into the translation files. Rows are matched by
// position, and each row's English text is checked so a reshuffled sheet is caught, not applied.
//
//   node scripts/translation-apply.mjs nb path/to/reviewed.md            (shows what would change)
//   node scripts/translation-apply.mjs nb path/to/reviewed.md --write    (writes the files)
import { readFileSync } from "node:fs";
import { sheetRows } from "./translation-rows.mjs";

const [lang, sheet, flag] = process.argv.slice(2);
if (!lang || !sheet) {
  console.error("Usage: node scripts/translation-apply.mjs <lang> <reviewed.md> [--write]");
  process.exit(1);
}
const write = flag === "--write";

/** The cells of every data row in a sheet, in order. Header and separator rows are skipped. */
export function parseSheet(text) {
  const lines = text.split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l.startsWith("| ")) continue;
    if (/^\|\s*-+\s*\|\s*-+\s*\|\s*$/.test(l)) continue; // separator
    if (/^\|\s*-+\s*\|\s*-+\s*\|\s*$/.test(lines[i + 1] ?? "")) continue; // header row above a separator
    // Split on unescaped pipes; "\|" is a pipe inside a cell.
    const cells = l.slice(1, l.trimEnd().length - 1).split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
    if (cells.length === 2) out.push(cells);
  }
  return out;
}

const unbold = (s) => s.replace(/^\*\*(.*)\*\*$/s, "$1");
const norm = (s) => String(s ?? "").replace(/\r?\n/g, " ").trim();

const reviewed = parseSheet(readFileSync(sheet, "utf8"));
const { sections, save } = sheetRows(lang);
const rows = sections.flatMap((s) => s.rows.map((r) => ({ ...r, section: s.title })));
if (reviewed.length !== rows.length) {
  console.error(`The sheet has ${reviewed.length} rows, but ${lang} has ${rows.length}. Make a fresh sheet and copy the edits into it.`);
  process.exit(1);
}

let changes = 0, mismatched = 0;
rows.forEach((r, i) => {
  const [enCell, trCell] = reviewed[i];
  if (norm(unbold(enCell)) !== norm(r.en)) {
    mismatched++;
    console.warn(`row ${i + 1} (${r.section}): English differs, applied by position.\n  sheet: ${enCell}\n  files: ${r.en}`);
  }
  const next = norm(unbold(trCell));
  if (!next || next === "(not translated)" || next === norm(r.tr)) return;
  changes++;
  console.log(`${r.section}\n  ${norm(r.tr)}\n→ ${next}`);
  r.set(next);
});

if (write) {
  const files = save();
  console.log(`\n${changes} changes written to ${files.length} files.${mismatched ? ` ${mismatched} rows had different English; check them above.` : ""}`);
} else {
  console.log(`\n${changes} changes found. Run again with --write to apply them.`);
}
