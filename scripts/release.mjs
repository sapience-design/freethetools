// Cut a release: `npm run release -- <major|minor|patch|x.y.z>`.
// On an up-to-date main, this moves "Unreleased" in CHANGELOG.md under the new version, sets the
// version in package.json and package-lock.json, and commits that on a release/vX.Y.Z branch.
// Merging that branch's pull request publishes the release (.github/workflows/release.yml).
// See docs/how-to/release.md.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { bump, cut, fragmentsIn, gather } from "./changelog.mjs";

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const fail = (msg) => { console.error(msg); process.exit(1); };

const arg = process.argv[2];
if (!arg) fail("Usage: npm run release -- <major|minor|patch|x.y.z>");
if (git("status", "--porcelain")) fail("Commit or stash your changes first.");
if (git("branch", "--show-current") !== "main") fail("Switch to main first: git switch main");
git("fetch", "--quiet", "origin", "main");
if (git("rev-parse", "HEAD") !== git("rev-parse", "origin/main")) fail("Bring main up to date first: git pull --ff-only");

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
let version, log, fragments = [];
try {
  version = bump(pkg.version, arg);
  // Entries waiting in changelog.d/ join "Unreleased" first, then become the release.
  fragments = fragmentsIn("changelog.d");
  log = cut(gather(readFileSync("CHANGELOG.md", "utf8"), fragments), version, new Date().toLocaleDateString("sv-SE"));
} catch (e) {
  fail(e.message);
}

const branch = `release/v${version}`;
git("switch", "--quiet", "-c", branch);
writeFileSync("CHANGELOG.md", log);
for (const file of ["package.json", "package-lock.json"]) {
  const json = JSON.parse(readFileSync(file, "utf8"));
  json.version = version;
  if (json.packages?.[""]) json.packages[""].version = version;
  writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
}
for (const f of fragments) git("rm", "--quiet", `changelog.d/${f.file}`);
git("add", "CHANGELOG.md", "package.json", "package-lock.json");
git("commit", "--quiet", "--signoff", "-m", `chore(release): v${version}`);

console.log(`Release v${version} is ready on ${branch} (was ${pkg.version}).
Check CHANGELOG.md, then:
  git push -u origin ${branch}
  gh pr create --fill
Merging the pull request tags the commit and publishes the release.`);
