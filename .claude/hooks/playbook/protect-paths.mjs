// PreToolUse hook: blocks edits to the paths a project lists in .claude/protected-paths
// (one glob per line, # for comments). Exit 2 blocks the edit and tells Claude why.
// People edit those files by hand; the agent proposes the change instead.
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

const input = JSON.parse(readFileSync(0, "utf8") || "{}");
const file = input.tool_input?.file_path ?? input.tool_input?.path;
const root = process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd();
if (!file) process.exit(0);

let lines;
try { lines = readFileSync(join(root, ".claude/protected-paths"), "utf8").split("\n"); }
catch { process.exit(0); }

const rel = relative(root, file).split("\\").join("/");
const toRegex = (g) => new RegExp("^" + g.replace(/[.+^${}()|[\]\\]/g, "\\$&")
  .replace(/\*\*\/?/g, "\u0000").replace(/\*/g, "[^/]*").replace(/\u0000/g, ".*") + "$");

for (const raw of lines) {
  const glob = raw.trim();
  if (!glob || glob.startsWith("#")) continue;
  const re = toRegex(glob.endsWith("/") ? glob + "**" : glob);
  if (re.test(rel)) {
    process.stderr.write(`${rel} is protected (.claude/protected-paths: ${glob}). Do not edit it. ` +
      "Explain the change you need and let a maintainer make it.\n");
    process.exit(2);
  }
}
