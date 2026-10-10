// Copies each tool's third-party runtime files (listed under "vendor" in its tool.json)
// from node_modules into public/<category>/<tool>/vendor/. They are served from our own
// origin, so the Content Security Policy can block every outside connection.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("..", import.meta.url));
const toolsDir = join(root, "tools");
// "extract" turns a package file into a file we can serve. heic-to builds its decoder worker from a
// string and starts it from a blob: URL, which our Content Security Policy blocks. We pull the string
// out at build time and serve it as a normal worker file instead.
const extractors = {
  "heic-to-worker"(src) {
    const start = src.indexOf("let r='(()=>{");
    const end = src.indexOf("',t=new Blob([r]", start);
    if (start < 0 || end < 0) throw new Error("heic-to: worker source not found; check the pinned version");
    const code = vm.runInNewContext(src.slice(start + 6, end + 1)); // a JS string literal
    if (/new Function\(|\beval\(/.test(code)) throw new Error("heic-to: worker uses eval, which our policy blocks");
    return code;
  },
};

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
    for (const { from, to, extract } of vendor) {
      if (extract) writeFileSync(join(out, to), extractors[extract](readFileSync(require.resolve(from), "utf8")));
      else cpSync(require.resolve(from), join(out, to));
      console.log(`vendor  ${category}/${tool}/vendor/${to}  <-  ${from}`);
    }
  }
}
