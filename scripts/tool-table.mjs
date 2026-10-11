// Writes the tool table in packages/freethetools/README.md from every tools/<group>/<slug>/agent.js,
// grouped as on the site, so nobody edits that list by hand. Runs before every site build and every
// package build (packages/freethetools/build.mjs), so the published README is always complete.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const README = join(root, "packages", "freethetools", "README.md");
const START = "<!-- tools:start: written by scripts/tool-table.mjs -->";
const END = "<!-- tools:end -->";

/** The Markdown table: one row per group, in the site's order, with each agent tool's name. */
export async function toolTable() {
  const groups = [...readFileSync(join(root, "src", "data", "categories.ts"), "utf8").matchAll(/slug: "([^"]+)", name: "([^"]+)"/g)];
  const rows = [];
  for (const [, slug, name] of groups) {
    const dir = join(root, "tools", slug);
    if (!existsSync(dir)) continue;
    const names = [];
    for (const tool of readdirSync(dir).sort()) {
      const file = join(dir, tool, "agent.js");
      if (existsSync(file)) for (const d of [(await import(pathToFileURL(file).href)).default].flat()) names.push(`\`${d.name}\``);
    }
    if (names.length) rows.push(`| ${name} | ${names.join(", ")} |`);
  }
  return ["| Group | Tools |", "|---|---|", ...rows].join("\n");
}

/** Replaces the table between the markers. Returns true when the file changed. */
export async function writeToolTable() {
  const text = readFileSync(README, "utf8");
  const a = text.indexOf(START);
  const b = text.indexOf(END);
  if (a < 0 || b < a) throw new Error(`${README} needs the markers ${START} and ${END} around the tool table.`);
  const next = `${text.slice(0, a + START.length)}\n${await toolTable()}\n${text.slice(b)}`;
  if (next !== text) writeFileSync(README, next);
  return next !== text;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log((await writeToolTable()) ? "Tool table updated in packages/freethetools/README.md" : "Tool table is up to date");
}
