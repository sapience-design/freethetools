# 12. Verifiable builds

Date: 2026-10-10 · Status: accepted (decided by Sapience Design) · Extends [ADR 0003](0003-csp-enforces-no-uploads.md)

## Context

The site promises that nothing is uploaded. The code is public, but a visitor only gets the built files. Nothing so far lets a visitor check that those files come from the public code.

## Decision

**Publish the SHA-256 of every deployed file.** After `astro build`, `scripts/build-integrity.mjs` writes `dist/integrity.json`:

- `commit`: the short Git commit of the build, or `unknown` outside a Git checkout.
- `built`: the build time (ISO 8601).
- `files`: every file in `dist/` except `integrity.json`, mapped to its SHA-256, sorted by path.

**A page to check it.** `/verify/` fetches the list, downloads each file again with `cache: "no-store"` (six at a time), hashes it with `crypto.subtle.digest`, and shows "N of M files match" with any mismatch. Files over 20 MB are skipped, and the page says so. All requests go to the site's own origin, so the policy in [ADR 0003](0003-csp-enforces-no-uploads.md) still holds.

**Reproducible by anyone.** `git checkout <commit>`, `npm ci`, `npm run build` and `node scripts/build-integrity.mjs --print` give the same hashes. `built` is the only time-dependent value and is not hashed. Two builds in a row give byte-identical output, share images included (checked on 2026-10-10).

**Tests.** `tests/site.test.js` checks that `integrity.json` lists every file and that hashes are 64 hex characters and match the files. `tests/integrity.test.js` tests the hashing helper.

## Consequences

**What it proves.** The files your browser received match the hashes the site publishes, and a build of the public repository at that commit gives the same hashes. A change made after the build, or a build from code that is not in the repository, shows up as a mismatch.

**What it does not prove.**

- The hashes and the files come from the same server. A server that wants to lie can lie in both. The check is strong when you reproduce the build yourself and compare, and weaker when the page only compares the site with itself.
- Cloudflare's network, your connection and your browser are honest.
- The source code is free of mistakes or harmful code.

**Costs.** The build needs Git to name the commit. The page downloads the whole site once per check, so it is a button, not automatic. A build that depends on the clock, the network or the machine breaks reproducibility, and the byte-identical check should be kept in mind when changing the build.
