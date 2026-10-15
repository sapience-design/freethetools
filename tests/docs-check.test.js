// scripts/docs-check.mjs: which parts of the pull request checklist a change brings up, and that
// the script and docs/reference/pr-checklist.md stay in step.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { RULES, review, format } from "../scripts/docs-check.mjs";

const change = (files, added = [], dirty = []) => ({ files: files.map(([status, path]) => ({ status, path })), added, dirty });
const section = (sections, title) => sections.find((s) => s.title === title);
const paths = (s) => s.items.map((i) => i.path).filter(Boolean);

test("a new tool asks for its three translations, its agent and the generated lists", () => {
  const s = section(review(change([["A", "tools/text/line-sorter/tool.json"], ["A", "tools/text/line-sorter/i18n/nb.json"]])), "A new tool");
  assert.ok(s, "the new tool section appears");
  for (const p of ["tools/text/line-sorter/i18n/es.json", "tools/text/line-sorter/i18n/ru.json", "tools/text/line-sorter/agent.js", "README.md", "packages/freethetools/README.md", "TODO.md"]) {
    assert.ok(paths(s).includes(p), `lists ${p}`);
  }
  assert.equal(s.items.find((i) => i.path === "tools/text/line-sorter/i18n/nb.json").done, true, "a file the branch adds is ticked");
  assert.equal(s.items.find((i) => i.path === "tools/text/line-sorter/i18n/es.json").done, false);
});

test("a changed tool.json asks for the same change in each translation, not the new-tool list", () => {
  const sections = review(change([["M", "tools/pdf/merge/tool.json"]]));
  assert.equal(section(sections, "A new tool"), undefined);
  assert.deepEqual(paths(section(sections, "A tool's text")), ["es", "nb", "ru"].map((l) => `tools/pdf/merge/i18n/${l}.json`));
});

test("the template is not a tool", () => {
  assert.equal(section(review(change([["A", "tools/_template/tool.json"]])), "A new tool"), undefined);
});

test("an agent.js change brings up the package tests and the hand-written job lists", () => {
  const s = section(review(change([["M", "tools/pdf/merge/agent.js"]])), "A tool's agent");
  assert.ok(s.items.some((i) => i.path === null && /test:package/.test(i.note)));
  for (const p of ["src/data/ai.ts", "packages/freethetools/src/mcp.js", "GEMINI.md", "plugins/freethetools/skills/free-the-tools/SKILL.md"]) assert.ok(paths(s).includes(p), `lists ${p}`);
});

test("new interface text needs every language file", () => {
  const s = section(review(change([["M", "src/i18n/en.json"], ["M", "src/i18n/nb.json"]])), "Interface text");
  assert.deepEqual(s.items.map((i) => [i.path, i.done]), [["src/i18n/nb.json", true], ["src/i18n/es.json", false], ["src/i18n/ru.json", false]]);
});

test("new browser storage and new browser features are found in the added lines", () => {
  const sections = review(change([["M", "src/lib/x.ts"]], [
    { path: "src/lib/x.ts", line: '  try { localStorage.setItem("ftt:new", v); } catch {}' },
    { path: "src/lib/x.ts", line: '  document.addEventListener("paste", onPaste);' },
  ]));
  assert.ok(paths(section(sections, "Browser storage")).includes("src/pages/how-it-works.astro"));
  assert.ok(paths(section(sections, "Browser features")).includes("src/pages/at-work.astro"));
  assert.ok(section(sections, "Shared parts"));
});

test("storage or clipboard code quoted in tests, scripts or docs is not site code", () => {
  const titles = review(change([["A", "tests/x.test.js"]], [
    { path: "tests/x.test.js", line: 'localStorage.setItem("ftt:new", v); addEventListener("paste", f);' },
    { path: "tools/pdf/merge/tests/a.test.js", line: 'sessionStorage.setItem("k", v)' },
    { path: "docs/explanation/architecture.md", line: "`navigator.clipboard` is never read" },
  ])).map((s) => s.title);
  assert.ok(!titles.includes("Browser storage") && !titles.includes("Browser features"));
});

test("package.json: a new dependency and a new command are told apart, and a version bump is neither", () => {
  const added = (line) => review(change([["M", "package.json"]], [{ path: "package.json", line }])).map((s) => s.title);
  assert.ok(added('    "marked": "18.1.0",').includes("Dependencies"));
  assert.ok(added('    "docs:check": "node scripts/docs-check.mjs",').includes("Commands"));
  const bump = added('  "version": "1.7.0",');
  assert.ok(!bump.includes("Dependencies") && !bump.includes("Commands"));
});

test("a new top-level page, not a language route, brings up the sitemap and RESERVED", () => {
  assert.ok(paths(section(review(change([["A", "src/pages/glossary.astro"]])), "A new page")).includes("src/data/catalogue.ts"));
  assert.equal(section(review(change([["A", "src/pages/[lang]/x.astro"]])), "A new page"), undefined);
});

test("every pull request: check, changelog, commits, and generated READMEs left uncommitted", () => {
  const s = section(review(change([["M", "docs/README.md"]], [], ["README.md"])), "Every pull request");
  assert.ok(s.items.some((i) => i.path === "changelog.d/"));
  assert.ok(s.items.some((i) => /README\.md was regenerated/.test(i.note)));
});

test("the output is a Markdown checklist", () => {
  const md = format(review(change([["M", "src/i18n/en.json"], ["M", "src/i18n/nb.json"]])), "origin/main");
  assert.match(md, /^- \[x\] `src\/i18n\/nb\.json`: /m);
  assert.match(md, /^- \[ \] `src\/i18n\/es\.json`: /m);
});

test("every rule is a heading in docs/reference/pr-checklist.md", () => {
  const doc = readFileSync("docs/reference/pr-checklist.md", "utf8");
  const headings = [...doc.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
  for (const r of RULES) assert.ok(headings.includes(r.title), `pr-checklist.md needs "## ${r.title}"`);
});

test("every file the rules name exists, so the list cannot point at moved files", () => {
  const hit = [{ path: "tools/text/word-counter/tool.json", line: "" }];
  for (const r of RULES) {
    for (const [path] of r.items(hit, { dirty: [] })) {
      if (path) assert.ok(existsSync(path), `${r.title}: ${path} does not exist`);
    }
  }
});
