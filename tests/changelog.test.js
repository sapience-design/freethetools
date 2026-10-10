// Release helpers (scripts/changelog.mjs): version bumps, cutting "Unreleased" into a version,
// and the release notes the workflow publishes. Also checks the real CHANGELOG.md stays usable.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { anchor, bump, cut, notes, sections } from "../scripts/changelog.mjs";

const REPO = "https://github.com/example/repo";
const LOG = `# Changelog

Intro.

## [Unreleased]

### Added

- A new tool.

## [1.0.0] - 2026-09-27

### Added

- The site.

[Unreleased]: ${REPO}/compare/v1.0.0...HEAD
[1.0.0]: ${REPO}/releases/tag/v1.0.0
`;

test("bump: major, minor, patch and an exact higher version", () => {
  assert.equal(bump("1.4.2", "major"), "2.0.0");
  assert.equal(bump("1.4.2", "minor"), "1.5.0");
  assert.equal(bump("1.4.2", "patch"), "1.4.3");
  assert.equal(bump("1.4.2", "1.10.0"), "1.10.0");
  assert.throws(() => bump("1.4.2", "1.4.2"), /not higher/);
  assert.throws(() => bump("1.4.2", "1.3.9"), /not higher/);
  assert.throws(() => bump("1.4.2", "v2"), /not major, minor, patch/);
});

test("cut: Unreleased becomes the new version, with an empty Unreleased above and compare links", () => {
  const out = cut(LOG, "1.1.0", "2026-10-09");
  assert.match(out, /## \[Unreleased\]\n\n## \[1\.1\.0\] - 2026-10-09\n\n### Added\n\n- A new tool\.\n\n## \[1\.0\.0\]/);
  assert.match(out, new RegExp(`^\\[Unreleased\\]: ${REPO}/compare/v1\\.1\\.0\\.\\.\\.HEAD$`, "m"));
  assert.match(out, new RegExp(`^\\[1\\.1\\.0\\]: ${REPO}/compare/v1\\.0\\.0\\.\\.\\.v1\\.1\\.0$`, "m"));
  assert.match(out, new RegExp(`^\\[1\\.0\\.0\\]: ${REPO}/releases/tag/v1\\.0\\.0$`, "m"));
});

test("cut: refuses an empty Unreleased and a version that exists", () => {
  assert.throws(() => cut(cut(LOG, "1.1.0", "2026-10-09"), "1.2.0", "2026-10-10"), /Nothing is listed under Unreleased/);
  assert.throws(() => cut(LOG, "1.0.0", "2026-10-09"), /already has 1\.0\.0/);
});

test("notes: one version's section, with its compare link", () => {
  const out = cut(LOG, "1.1.0", "2026-10-09");
  assert.equal(notes(out, "1.1.0"), `### Added\n\n- A new tool.\n\n**All changes:** ${REPO}/compare/v1.0.0...v1.1.0\n`);
  assert.equal(notes(out, "1.0.0"), "### Added\n\n- The site.\n");
  assert.throws(() => notes(out, "9.9.9"), /no section for 9\.9\.9/);
});

test("the real CHANGELOG.md has notes for the current version", () => {
  const { version } = JSON.parse(readFileSync("package.json", "utf8"));
  assert.ok(notes(readFileSync("CHANGELOG.md", "utf8"), version).length > 20);
});

test("sections: lists each version with date and body, and stops before the link list", () => {
  const all = sections(LOG);
  assert.deepEqual(all.map((s) => [s.version, s.date]), [["Unreleased", null], ["1.0.0", "2026-09-27"]]);
  assert.equal(all[0].body, "### Added\n\n- A new tool.");
  assert.equal(all[1].body, "### Added\n\n- The site.");
});

test("anchor: versions become v1-1-0, Unreleased stays plain", () => {
  assert.equal(anchor("1.1.0"), "v1-1-0");
  assert.equal(anchor("Unreleased"), "unreleased");
});
