// What to update with this change: reads the files a branch changes and prints the parts of
// docs/reference/pr-checklist.md that apply, as a Markdown checklist to paste into the pull request.
// An item is ticked when the branch already changes that file. A reminder, not a gate: it always
// exits 0. Usage: npm run docs:check [-- --base <ref>]   (default: origin/main, else main)
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const TOOL = /^tools\/(?!_template\/)[^/]+\/[^/]+\//;
const toolDir = (path) => path.split("/").slice(0, 3).join("/");
/** Code that runs on the site, so not tests, scripts or docs, which may quote such code as data. */
const siteCode = (path) => /^(src|tools)\//.test(path) && !/\/tests?\/|\.test\.[jt]s$|\.md$/.test(path);
const unique = (list) => [...new Set(list)];

/**
 * Each rule is one section of docs/reference/pr-checklist.md, with the same heading. `hits` picks
 * the changes it is about; `items` lists [path, note] pairs to check, where a path of null is a
 * step to take rather than a file to update.
 * A change is { files: [{ path, status }], added: [{ path, line }] }: status is A, M or D, and
 * `added` holds the lines the branch adds.
 */
export const RULES = [
  {
    title: "A new tool",
    hits: (c) => c.files.filter((f) => f.status === "A" && TOOL.test(f.path) && f.path.endsWith("/tool.json")),
    items: (hits) => [
      ...hits.flatMap(({ path }) => {
        const dir = toolDir(path);
        return [
          [`${dir}/i18n/es.json`, "Spanish text, same FAQ and spec count (a missing file only warns)"],
          [`${dir}/i18n/nb.json`, "Norwegian text"],
          [`${dir}/i18n/ru.json`, "Russian text"],
          [`${dir}/tests/`, "unit tests"],
          [`${dir}/agent.js`, "for assistants and the npm package; if it can't have one, say why in TODO.md and the package README's Limits"],
        ];
      }),
      ["README.md", "generated tool list: npm run build, then commit it"],
      ["packages/freethetools/README.md", "generated tool table: npm run build, then commit it"],
      ["TODO.md", "the tool counts in its first line"],
      [null, "every TODO in tool.json replaced, search fields within the search policy's limits"],
    ],
  },
  {
    title: "A tool's text",
    hits: (c) => c.files.filter((f) => f.status === "M" && TOOL.test(f.path) && f.path.endsWith("/tool.json")),
    items: (hits) => hits.flatMap(({ path }) => {
      const dir = toolDir(path);
      return ["es", "nb", "ru"].map((l) => [`${dir}/i18n/${l}.json`, "the same change; FAQ and spec counts must match"]);
    }),
  },
  {
    title: "A tool's agent",
    hits: (c) => c.files.filter((f) => f.status !== "D" && TOOL.test(f.path) && f.path.endsWith("/agent.js")),
    items: () => [
      [null, "npm run test:package passes (npm run check skips it)"],
      ["packages/freethetools/README.md", "generated tool table; also its Limits section if a tool gains its first agent.js"],
      ["TODO.md", "if a tool gains its first agent.js: its entry and the counts"],
      ["src/data/ai.ts", "PROMPT, if this adds a new kind of job"],
      ["packages/freethetools/src/mcp.js", "INSTRUCTIONS, if this adds a new kind of job"],
      ["GEMINI.md", "the job list, if this adds a new kind of job"],
      ["plugins/freethetools/skills/free-the-tools/SKILL.md", "the same text as GEMINI.md"],
    ],
  },
  {
    title: "Interface text",
    hits: (c) => c.files.filter((f) => f.path === "src/i18n/en.json"),
    items: () => ["nb", "es", "ru"].map((l) => [`src/i18n/${l}.json`, "the same keys (tests/i18n.test.js fails otherwise)"]),
  },
  {
    title: "Shared parts",
    hits: (c) => c.files.filter((f) => /^src\/(lib|components|layouts|styles)\//.test(f.path)),
    items: () => [
      ["docs/explanation/architecture.md", "how tools look and behave"],
      ["docs/tutorial/first-tool.md", "if the way to build a tool changes"],
      ["tools/_template/", "if the way to build a tool changes"],
      ["CONTRIBUTING.md", "if it brings a rule every tool must follow"],
      ["AGENTS.md", "the same rule, for AI assistants"],
    ],
  },
  {
    title: "Browser storage",
    hits: (c) => c.added.filter((a) => siteCode(a.path) && /\b(localStorage|sessionStorage)\.setItem\(|\bindexedDB\.open\(/.test(a.line)),
    items: () => [
      ["src/pages/how-it-works.astro", "the LOCAL map: name the key so people can see and clear it"],
      ["src/pages/privacy.astro", "the list of what the browser keeps"],
      ["src/pages/at-work.astro", "for IT teams"],
      ["docs/adr/", "if it changes what the site keeps"],
    ],
  },
  {
    title: "Browser features",
    hits: (c) => c.added.filter((a) => siteCode(a.path) && /navigator\.clipboard|addEventListener\(["']paste["']|new (Shared)?Worker\(|WebAssembly\.|serviceWorker\.register/.test(a.line)),
    items: () => [["src/pages/at-work.astro", "\"Browser features it uses\""]],
  },
  {
    title: "Network and security policy",
    hits: (c) => c.files.filter((f) => /^(astro\.config\.mjs|public\/_headers|wrangler\.jsonc|worker\/|migrations\/)/.test(f.path)),
    items: () => [
      [null, "the Content Security Policy is not weakened"],
      ["docs/adr/", "a decision record"],
      ["src/pages/privacy.astro", "if anything new is counted or allowed"],
      ["src/pages/at-work.astro", "if anything new is counted or allowed"],
      ["openapi.yaml", "if the Worker's API changes"],
      ["docs/explanation/architecture.md", "the stats section"],
      ["SECURITY.md", "if the build or deploy pipeline changes"],
    ],
  },
  {
    title: "A new page",
    hits: (c) => c.files.filter((f) => f.status === "A" && /^src\/pages\/(?!\[)[^/]+\.(astro|ts)$/.test(f.path)),
    items: () => [
      ["src/pages/sitemap.xml.ts", "the static list, or mark the page noindex"],
      ["src/data/catalogue.ts", "RESERVED, so no language code takes the address"],
      ["docs/explanation/seo-policy.md", "if it is a new kind of page"],
      ["src/layouts/Base.astro", "a link to it, such as in the footer"],
    ],
  },
  {
    title: "Dependencies",
    hits: (c) => c.added.filter((a) => a.path === "package.json" && /^\s*"(?!version")@?[\w./-]+":\s*"[\^~]?\d/.test(a.line)),
    items: () => [
      [null, "an exact version and an AGPL-3.0-compatible licence"],
      ["NOTICE", "the library, its licence and version"],
      ["src/pages/licenses.astro", "the parts list, with the version"],
    ],
  },
  {
    title: "Commands",
    hits: (c) => c.added.filter((a) => a.path === "package.json" && /^\s*"[\w:-]+":\s*"(node|npm|npx|astro|wrangler|playwright)\b/.test(a.line)),
    items: () => [["docs/reference/commands.md", "the new or changed command"]],
  },
  {
    title: "The npm package",
    hits: (c) => c.files.filter((f) => f.path.startsWith("packages/freethetools/")),
    items: () => [
      [null, "npm run test:package passes"],
      ["packages/freethetools/README.md", "the hand-written parts"],
      ["docs/how-to/release.md", "if releasing: the version in every place it lists"],
    ],
  },
  {
    title: "Assistant plugins",
    hits: (c) => c.files.filter((f) => /^(GEMINI\.md|gemini-extension\.json|server\.json|\.claude-plugin\/|plugins\/)/.test(f.path)),
    items: () => [
      ["GEMINI.md", "the same text as the plugin's SKILL.md"],
      ["plugins/freethetools/skills/free-the-tools/SKILL.md", "the same text as GEMINI.md"],
      [null, "versions in gemini-extension.json, server.json and the plugin manifests match packages/freethetools/package.json"],
    ],
  },
  {
    title: "Visible changes",
    hits: (c) => c.files.filter((f) => /^src\/.*\.(astro|css)$/.test(f.path) || (TOOL.test(f.path) && f.path.endsWith("/Tool.astro"))),
    items: () => [[null, "screenshots in the pull request: desktop and phone, light and dark"]],
  },
  {
    title: "Every pull request",
    hits: (c) => c.files,
    items: (_, c) => [
      [null, "npm run check passes"],
      ["changelog.d/", "an entry, for anything people notice on the site, in the npm package or the plugins"],
      [null, "Conventional Commit messages, each commit signed off with git commit -s"],
      ...(c.dirty ?? []).map((p) => [null, `${p} was regenerated by the build but is not committed`]),
      [null, "the pull request says what was checked and left unchanged, and why"],
    ],
  },
];

/** The sections that apply to a change: [{ title, because, items: [{ path, note, done }] }]. */
export function review(change) {
  const changed = change.files.map((f) => f.path);
  const touched = (path) => path !== null && changed.some((p) => p === path || (path.endsWith("/") && p.startsWith(path)));
  const out = [];
  for (const rule of RULES) {
    const hits = rule.hits(change);
    if (!hits.length) continue;
    const seen = new Set();
    const items = rule.items(hits, change).filter(([path, note]) => !seen.has(`${path}|${note}`) && seen.add(`${path}|${note}`));
    out.push({
      title: rule.title,
      because: unique(hits.map((h) => h.path)),
      items: items.map(([path, note]) => ({ path, note, done: touched(path) })),
    });
  }
  return out;
}

/** The review as a Markdown checklist. */
export function format(sections, base) {
  const lines = [`## Docs and checks (npm run docs:check, against ${base})`, ""];
  for (const s of sections) {
    const why = s.because.length > 3 ? `${s.because.slice(0, 3).join(", ")} and ${s.because.length - 3} more` : s.because.join(", ");
    lines.push(`### ${s.title}`, "", `Because of: ${why}`, "");
    for (const i of s.items) lines.push(`- [${i.done ? "x" : " "}] ${i.path ? `\`${i.path}\`: ` : ""}${i.note}`);
    lines.push("");
  }
  lines.push("Ticked: this branch changes it. For each unticked item, update it or say why it needs no change.", "See docs/reference/pr-checklist.md.");
  return lines.join("\n");
}

const git = (args) => execFileSync("git", args, { encoding: "utf8" });

/** The branch's change against `base`: committed, staged, unstaged and new files. */
export function readChange(base) {
  const from = git(["merge-base", base, "HEAD"]).trim();
  const files = git(["diff", "--name-status", "--no-renames", from]).split("\n").filter(Boolean).map((l) => {
    const [status, path] = l.split("\t");
    return { status: status[0], path };
  });
  const fresh = git(["ls-files", "--others", "--exclude-standard"]).split("\n").filter(Boolean);
  for (const path of fresh) files.push({ status: "A", path });
  const added = [];
  let path = null;
  for (const line of git(["diff", "-U0", "--no-color", from]).split("\n")) {
    if (line.startsWith("+++ ")) path = line.slice(6);
    else if (line.startsWith("+") && path) added.push({ path, line: line.slice(1) });
  }
  for (const p of fresh) {
    try { for (const line of readFileSync(p, "utf8").split("\n")) added.push({ path: p, line }); } catch {}
  }
  const dirty = git(["status", "--porcelain", "--", "README.md", "packages/freethetools/README.md"])
    .split("\n").filter(Boolean).map((l) => l.slice(3));
  return { files, added, dirty };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const at = process.argv.indexOf("--base");
  const has = (ref) => { try { git(["rev-parse", "--verify", "--quiet", ref]); return true; } catch { return false; } };
  const base = at > 0 ? process.argv[at + 1] : has("origin/main") ? "origin/main" : "main";
  if (!existsSync(".git") && !has("HEAD")) {
    console.log("docs:check needs a git checkout.");
  } else {
    const change = readChange(base);
    console.log(change.files.length ? format(review(change), base) : `No changes against ${base}.`);
  }
}
