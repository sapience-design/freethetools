// Checks that `npm pack` would publish a working freethetools package: the built command line and
// the Ghostscript WebAssembly file must be in it. dist/ is not in git, so a package packed without
// a build is empty; the package's "prepack" script builds it.
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL("../packages/freethetools/", import.meta.url));
const stdout = execSync("npm pack --dry-run --json", { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"], maxBuffer: 50_000_000 });
// The build prints a line before npm's JSON, so read from the JSON's own start.
const start = stdout.search(/^\[\s*\{/m);
const listed = JSON.parse(stdout.slice(start))[0].files.map((f) => f.path.replaceAll("\\", "/"));
const missing = ["dist/cli.js", "dist/gs.wasm", "dist/qpdf.wasm", "package.json", "README.md"].filter((f) => !listed.includes(f));
if (missing.length) {
  console.error(`npm pack would leave these out: ${missing.join(", ")}. Files it lists:\n${listed.join("\n")}`);
  process.exit(1);
}
console.log(`npm pack lists ${listed.length} files, including dist/cli.js and dist/gs.wasm.`);
