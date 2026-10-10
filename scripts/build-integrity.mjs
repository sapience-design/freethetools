// Writes dist/integrity.json after the build: the SHA-256 of every deployed file, so anyone can
// check that the live site equals a build of the repository (see /verify/ and ADR 0012).
//   node scripts/build-integrity.mjs          write dist/integrity.json
//   node scripts/build-integrity.mjs --print  print the hashes of an existing dist/ and write nothing
// The "built" time is the only time-dependent field. It is not part of any hash.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const INTEGRITY_FILE = "integrity.json";

export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/**
 * Files at the top of dist/ that are instructions to the host, not files it serves: Cloudflare reads
 * them at deploy time, and asking for one gives the 404 page. Listing them would make every check
 * report a mismatch. Their effect is visible in the response headers instead.
 */
export const HOST_FILES = new Set(["_headers", "_redirects", "_routes.json"]);

/** Every served file under `dir` (not integrity.json or the host's own files) mapped to its SHA-256, sorted by path. */
export function hashTree(dir) {
  const out = [];
  (function walk(d) {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else {
        const rel = relative(dir, p).split(sep).join("/");
        if (rel !== INTEGRITY_FILE && !HOST_FILES.has(rel)) out.push([rel, sha256(readFileSync(p))]);
      }
    }
  })(dir);
  out.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return Object.fromEntries(out);
}

export function gitCommit() {
  try {
    return execFileSync("git", ["rev-parse", "--short=12", "HEAD"], { stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || "unknown";
  } catch {
    return "unknown";
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dist = fileURLToPath(new URL("../dist", import.meta.url));
  const files = hashTree(dist);
  const doc = { commit: gitCommit(), built: new Date().toISOString(), files };
  if (process.argv.includes("--print")) {
    console.log(JSON.stringify({ commit: doc.commit, files }, null, 2));
  } else {
    writeFileSync(join(dist, INTEGRITY_FILE), JSON.stringify(doc, null, 2) + "\n");
    console.log(`integrity  ${Object.keys(files).length} files hashed (commit ${doc.commit})`);
  }
}
