// Copies each tool's third-party runtime files (listed under "vendor" in its tool.json)
// from node_modules into public/<category>/<tool>/vendor/. They are served from our own
// origin, so the Content Security Policy can block every outside connection.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("..", import.meta.url));
const toolsDir = join(root, "tools");
const dirs = (p) => readdirSync(p).filter((n) => !n.startsWith("_") && statSync(join(p, n)).isDirectory());

for (const category of dirs(toolsDir)) {
  for (const tool of dirs(join(toolsDir, category))) {
    const manifest = join(toolsDir, category, tool, "tool.json");
    if (!existsSync(manifest)) continue;
    const { vendor = [] } = JSON.parse(readFileSync(manifest, "utf8"));
    const out = join(root, "public", category, tool, "vendor");
    rmSync(out, { recursive: true, force: true });
    if (!vendor.length) continue;
    mkdirSync(out, { recursive: true });
    for (const { from, to } of vendor) {
      cpSync(require.resolve(from), join(out, to));
      console.log(`vendor  ${category}/${tool}/vendor/${to}  <-  ${from}`);
    }
  }
}
