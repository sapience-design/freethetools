// Security checks on every tool's own code (not its vendored libraries or tests). A tool runs in
// the browser under the Content Security Policy, and its core.js and agent.js also run inside the
// freethetools npm package on people's computers, where no policy applies. So:
//   - nowhere: code built from text (eval, new Function, string timers) or raw HTML writes, except
//     innerHTML with a "safe-html:" comment on the line or the line above that says why it is safe;
//   - core.js and agent.js: no network, no Node built-ins, no process, no dynamic import of anything
//     but a relative path. A tool gets files as bytes and hands back bytes (src/agent/contract.js).
// A reviewer still reads every new tool: see "Security review" in CONTRIBUTING.md.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SKIP = new Set(["vendor", "tests", "node_modules", "i18n"]);
const files = [];
(function walk(dir) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) {
      if (!SKIP.has(n)) walk(p);
    } else if (/\.(js|mjs|ts|astro)$/.test(n)) files.push(p.split("\\").join("/"));
  }
})("tools");

const EVERYWHERE = [
  [/\beval\s*\(/, "eval runs text as code"],
  [/\bnew\s+Function\s*\(/, "new Function runs text as code"],
  [/\bset(Timeout|Interval)\s*\(\s*["'`]/, "a timer given text runs it as code"],
  [/\bdocument\.write(ln)?\s*\(/, "document.write writes raw HTML"],
  [/\binsertAdjacentHTML\s*\(/, "insertAdjacentHTML writes raw HTML"],
  [/\bouterHTML\s*=/, "outerHTML writes raw HTML"],
];
const AGENT_SIDE = [
  [/\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|\bEventSource\b|\bsendBeacon\b/, "network access"],
  [/from\s+["']node:|from\s+["'](fs|child_process|net|http|https|os|path|worker_threads)["']|\brequire\s*\(/, "a Node built-in"],
  [/\bprocess\./, "process (environment, exit, files)"],
  [/\bimport\s*\(\s*(?!["'`]\.{1,2}\/)/, "a dynamic import of something other than a relative path"],
];

const isComment = (line) => /^\s*(\/\/|\/\*|\*)/.test(line);

test("tool code has no eval, string timers or unchecked raw HTML", () => {
  const bad = [];
  for (const f of files) {
    const lines = readFileSync(f, "utf8").split(/\r?\n/);
    lines.forEach((line, i) => {
      if (isComment(line)) return;
      for (const [re, why] of EVERYWHERE) if (re.test(line)) bad.push(`${f}:${i + 1}: ${why}`);
      if (/\binnerHTML\s*\+?=/.test(line) && !/safe-html:/.test(line + (lines[i - 1] ?? ""))) {
        bad.push(`${f}:${i + 1}: innerHTML needs a "safe-html:" comment saying why no outside text reaches it`);
      }
    });
  }
  assert.deepEqual(bad, []);
});

test("core.js and agent.js use no network, no Node built-ins and no process", () => {
  const bad = [];
  for (const f of files.filter((f) => /\/(core|agent)\.js$/.test(f))) {
    readFileSync(f, "utf8").split(/\r?\n/).forEach((line, i) => {
      if (isComment(line)) return;
      for (const [re, why] of AGENT_SIDE) if (re.test(line)) bad.push(`${f}:${i + 1}: ${why}`);
    });
  }
  assert.deepEqual(bad, []);
});

test("the checks see every tool", () => {
  const tools = readdirSync("tools")
    .filter((g) => !g.startsWith("_") && statSync(join("tools", g)).isDirectory())
    .flatMap((g) => readdirSync(join("tools", g)).map((s) => `tools/${g}/${s}/`));
  for (const t of tools) assert.ok(files.some((f) => f.startsWith(t)), `${t} has no code the checks read`);
});
