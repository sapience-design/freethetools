// Builds dist/: the command line, the MCP server and every tool, in one self-contained package.
// Every tools/<group>/<slug>/agent.js goes in through a generated module, so the published package
// needs nothing from the site's source. The MCP SDK stays an ordinary dependency.
import { build } from "esbuild";
import { copyFileSync, mkdirSync, readdirSync, readFileSync, existsSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const toolsDir = join(root, "tools");
const require = createRequire(import.meta.url);
const pkg = JSON.parse(readFileSync(join(here, "package.json"), "utf8"));

const ids = readdirSync(toolsDir)
  .filter((g) => !g.startsWith("_") && statSync(join(toolsDir, g)).isDirectory())
  .flatMap((g) => readdirSync(join(toolsDir, g)).map((s) => `${g}/${s}`))
  .filter((id) => existsSync(join(toolsDir, id, "agent.js")))
  .sort();
if (!ids.length) throw new Error("No tools/*/*/agent.js found. Run this from inside the repository.");


// Generated code embeds paths and ids as string literals. Ids must be plain "group/slug", and each
// literal is escaped beyond JSON.stringify, so no value can end the string or the script.
for (const id of ids) if (!/^[a-z0-9-]+\/[a-z0-9-]+$/.test(id)) throw new Error(`Unexpected tool folder name: ${id}`);
// The line and paragraph separators are built from their codes, so this file holds no raw ones.
const UNSAFE = new RegExp("[<>/" + String.fromCharCode(0x2028, 0x2029) + "]", "g");
const literal = (v) => JSON.stringify(String(v)).replace(UNSAFE, (c) => "\\" + "u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
const generated = [
  ...ids.map((id, i) => `import * as m${i} from ${literal(join(toolsDir, id, "agent.js").replaceAll("\\", "/"))};`),
  `export const tools = [`,
  ...ids.map((id, i) => `  ...[m${i}.default].flat().map((def) => ({ id: ${literal(id)}, def, makesFiles: def.makesFiles === true })),`),
  `];`,
].join("\n");

const toolsPlugin = {
  name: "tools",
  setup(b) {
    b.onResolve({ filter: /^freethetools:tools$/ }, () => ({ path: "tools", namespace: "tools" }));
    b.onLoad({ filter: /.*/, namespace: "tools" }, () => ({ contents: generated, loader: "js", resolveDir: root }));
  },
};

const dist = join(here, "dist");
rmSync(dist, { recursive: true, force: true });
await build({
  entryPoints: { cli: join(here, "src/cli.js"), worker: join(here, "src/worker.js") },
  outdir: dist,
  bundle: true,
  splitting: true,
  format: "esm",
  platform: "node",
  target: "node22",
  external: ["@modelcontextprotocol/sdk/*", "@jspawn/ghostscript-wasm", "@jspawn/qpdf-wasm"],
  plugins: [toolsPlugin],
  define: { __VERSION__: JSON.stringify(pkg.version) },
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  legalComments: "none",
  logLevel: "warning",
});

// Ghostscript compiled to WebAssembly, shipped next to the code. gs.js is the Emscripten loader
// (CommonJS), so it gets a .cjs name inside this ES module package.
const gsDir = dirname(require.resolve("@jspawn/ghostscript-wasm/package.json"));
copyFileSync(join(gsDir, "gs.js"), join(dist, "gs.cjs"));
copyFileSync(join(gsDir, "gs.wasm"), join(dist, "gs.wasm"));
// qpdf compiled to WebAssembly, for unlock_pdf, shipped the same way.
const qpdfDir = dirname(require.resolve("@jspawn/qpdf-wasm/package.json"));
copyFileSync(join(qpdfDir, "qpdf.js"), join(dist, "qpdf.cjs"));
copyFileSync(join(qpdfDir, "qpdf.wasm"), join(dist, "qpdf.wasm"));
copyFileSync(join(root, "LICENSE"), join(here, "LICENSE"));
console.log(`Built ${ids.length} tool folders into ${dist}`);
