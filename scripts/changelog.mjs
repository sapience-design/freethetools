// CHANGELOG.md helpers for releases (Keep a Changelog format). Used by scripts/release.mjs, which
// cuts a release, and by .github/workflows/release.yml, which publishes its notes:
//   node scripts/changelog.mjs notes 2.0.0
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;
const HEADING = /^## \[([^\]]+)\]/m;
const LINK_REF = /^\[[^\]]+\]: https?:\/\//m;

/** The next version: `major`, `minor` or `patch` bumps `current`; `x.y.z` must be higher than it. */
export function bump(current, arg) {
  const [maj, min, pat] = parse(current);
  if (arg === "major") return `${maj + 1}.0.0`;
  if (arg === "minor") return `${maj}.${min + 1}.0`;
  if (arg === "patch") return `${maj}.${min}.${pat + 1}`;
  if (!SEMVER.test(arg ?? "")) throw new Error(`"${arg}" is not major, minor, patch or a version like 2.1.0.`);
  const next = parse(arg);
  const higher = next[0] - maj || next[1] - min || next[2] - pat;
  if (higher <= 0) throw new Error(`${arg} is not higher than the current version, ${current}.`);
  return arg;
}

function parse(v) {
  const m = SEMVER.exec(v);
  if (!m) throw new Error(`"${v}" is not a version like 2.1.0.`);
  return m.slice(1).map(Number);
}

// Where a section ends: at the next version heading or at the link list, whichever comes first.
function sectionEnd(s) {
  const at = [s.search(/^## \[/m), s.search(LINK_REF)].filter((i) => i >= 0);
  return at.length ? Math.min(...at) : s.length;
}

/** Move everything under "Unreleased" into a new `version` section dated `date`, and add its compare link. */
export function cut(text, version, date) {
  const start = text.indexOf("## [Unreleased]");
  if (start < 0) throw new Error("CHANGELOG.md has no ## [Unreleased] heading.");
  const after = start + "## [Unreleased]".length;
  const rest = text.slice(after);
  if (!rest.slice(0, sectionEnd(rest)).trim()) throw new Error("Nothing is listed under Unreleased in CHANGELOG.md.");
  if (lineStarting(text, `## [${version}]`) >= 0) throw new Error(`CHANGELOG.md already has ${version}.`);
  const prev = HEADING.exec(rest)?.[1];

  let out = `${text.slice(0, after)}\n\n## [${version}] - ${date}${rest}`;
  const ref = /^\[Unreleased\]: (\S+)\/compare\/\S+\.\.\.HEAD$/m.exec(out);
  if (ref) {
    const repo = ref[1];
    const link = prev ? `${repo}/compare/v${prev}...v${version}` : `${repo}/releases/tag/v${version}`;
    out = out.replace(ref[0], `[Unreleased]: ${repo}/compare/v${version}...HEAD\n[${version}]: ${link}`);
  }
  return out;
}

/** The notes for one version: its section, plus its compare link when there is one. */
export function notes(text, version) {
  const head = lineStarting(text, `## [${version}]`);
  if (head < 0) throw new Error(`CHANGELOG.md has no section for ${version}.`);
  const eol = text.indexOf("\n", head);
  const rest = eol < 0 ? "" : text.slice(eol + 1);
  const body = rest.slice(0, sectionEnd(rest)).trim();
  if (!body) throw new Error(`The ${version} section of CHANGELOG.md is empty.`);
  const ref = `[${version}]: `;
  const at = lineStarting(text, ref);
  const link = at < 0 ? "" : text.slice(at + ref.length).split("\n")[0].trim();
  return link.includes("/compare/") ? `${body}\n\n**All changes:** ${link}\n` : `${body}\n`;
}

/** Every section as { version, date, body }, newest first. "Unreleased" has no date. */
export function sections(text) {
  const out = [];
  const re = /^## \[([^\]]+)\](?: - (\d{4}-\d{2}-\d{2}))?[^\n]*$/gm;
  let m;
  while ((m = re.exec(text))) {
    const rest = text.slice(m.index + m[0].length);
    out.push({ version: m[1], date: m[2] ?? null, body: rest.slice(0, sectionEnd(rest)).trim() });
  }
  return out;
}

/** The anchor id for a version heading: "1.1.0" becomes "v1-1-0". */
export function anchor(version) {
  return version === "Unreleased" ? "unreleased" : `v${version.replaceAll(".", "-")}`;
}

// Where the first line starting with `prefix` begins, or -1. Plain text, so a version never
// becomes part of a regular expression.
function lineStarting(text, prefix) {
  if (text.startsWith(prefix)) return 0;
  const at = text.indexOf(`\n${prefix}`);
  return at < 0 ? -1 : at + 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [cmd, version] = process.argv.slice(2);
  if (cmd !== "notes" || !version) {
    console.error("Usage: node scripts/changelog.mjs notes <version>");
    process.exit(2);
  }
  try {
    process.stdout.write(notes(readFileSync("CHANGELOG.md", "utf8"), version));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
