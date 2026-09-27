// Scaffold a new tool from tools/_template.
//   npm run new-tool -- <category> <slug> "<Tool Name>" [section]
//   npm run new-tool -- text word-counter "Word Counter" "Count & Compare"
import { cpSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const [category, slug, name, section] = process.argv.slice(2);
const categoriesSrc = readFileSync(join(root, "src/data/categories.ts"), "utf8");
const known = [...categoriesSrc.matchAll(/slug: "([a-z0-9-]+)"/g)].map((m) => m[1]);

function fail(msg) {
  console.error(`\n${msg}\n\nUsage: npm run new-tool -- <category> <slug> "<Tool Name>" [section]\nCategories: ${known.join(", ")}\n`);
  process.exit(1);
}
if (!category || !slug || !name) fail("Give a category, a slug and a name.");
if (!known.includes(category)) fail(`Unknown category "${category}".`);
if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) fail(`The slug "${slug}" should be lowercase words joined by hyphens, like word-counter.`);

const sections = [...categoriesSrc.matchAll(new RegExp(`slug: "${category}"[^\\n]*sections: \\[([^\\]]*)\\]`, "g"))][0]?.[1].match(/"([^"]+)"/g)?.map((s) => s.slice(1, -1)) ?? [];
const sec = section ?? sections[0];
if (!sections.includes(sec)) fail(`Section "${sec}" is not one of: ${sections.join(", ")}.`);

const dest = join(root, "tools", category, slug);
if (existsSync(dest)) fail(`tools/${category}/${slug} already exists.`);
cpSync(join(root, "tools/_template"), dest, { recursive: true });

const fill = (dir) => {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) { fill(p); continue; }
    const text = readFileSync(p, "utf8")
      .replaceAll("__ID__", slug)
      .replaceAll("__NAME__", name)
      .replaceAll("__SHORT__", name.length <= 24 ? name : name.slice(0, 24))
      .replaceAll("__SECTION__", sec)
      .replaceAll("__DATE__", new Date().toISOString().slice(0, 10));
    writeFileSync(p, text);
  }
};
fill(dest);
console.log(`\nCreated tools/${category}/${slug}. Next:\n  1. Fill in the TODOs in tool.json\n  2. npm run dev and open http://localhost:4321/${category}/${slug}/\n  3. npm test\n`);
