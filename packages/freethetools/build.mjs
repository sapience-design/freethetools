// Builds dist/: the command line, the MCP server and every tool, in one self-contained package.
// Every tools/<group>/<slug>/agent.js goes in through a generated module, so the published package
// needs nothing from the site's source. The MCP SDK stays an ordinary dependency.
import { build } from "esbuild";
import { copyFileSync, mkdirSync, readdirSync, readFileSync, existsSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const toolsDir = join(root, "tools");
const require = createRequire(import.meta.url);
const pkg = JSON.parse(readFileSync(join(here, "package.json"), "utf8"));

// The README's tool table comes from the same agent.js files, so the published README is complete.
await (await import(pathToFileURL(join(root, "scripts", "tool-table.mjs")).href)).writeToolTable();

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

// The code library (src/api.js) gets one named function per tool: convert_case becomes convertCase.
const defs = [];
for (const id of ids) for (const d of [(await import(pathToFileURL(join(toolsDir, id, "agent.js")).href)).default].flat()) defs.push(d);
const OWN = new Set(["run", "listTools", "FreeTheToolsError", "default"]);
const fns = defs.map((d) => {
  if (!/^[a-z][a-z0-9_]*$/.test(d.name)) throw new Error(`Unexpected tool name: ${d.name}`);
  const fn = d.name.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
  if (OWN.has(fn)) throw new Error(`The tool ${d.name} would hide the library's own ${fn}. Rename the tool.`);
  return { name: d.name, fn, description: d.description };
});
if (new Set(fns.map((f) => f.fn)).size !== fns.length) throw new Error("Two tools would get the same function name.");
const api = literal(join(here, "src/api.js").replaceAll("\\", "/"));
const indexModule = [
  `export { run, listTools, FreeTheToolsError } from ${api};`,
  `import { run } from ${api};`,
  ...fns.map((f) => `export const ${f.fn} = (args, options) => run(${literal(f.name)}, args, options);`),
].join("\n");

const toolsPlugin = {
  name: "tools",
  setup(b) {
    b.onResolve({ filter: /^freethetools:tools$/ }, () => ({ path: "tools", namespace: "tools" }));
    b.onLoad({ filter: /.*/, namespace: "tools" }, () => ({ contents: generated, loader: "js", resolveDir: root }));
    b.onResolve({ filter: /^freethetools:index$/ }, () => ({ path: "index", namespace: "index" }));
    b.onLoad({ filter: /.*/, namespace: "index" }, () => ({ contents: indexModule, loader: "js", resolveDir: here }));
  },
};

const dist = join(here, "dist");
rmSync(dist, { recursive: true, force: true });
await build({
  entryPoints: { cli: join(here, "src/cli.js"), worker: join(here, "src/worker.js"), index: "freethetools:index" },
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
// qpdf compiled to WebAssembly, for unlock_pdf and protect_pdf, shipped the same way.
const qpdfDir = dirname(require.resolve("@jspawn/qpdf-wasm/package.json"));
copyFileSync(join(qpdfDir, "qpdf.js"), join(dist, "qpdf.cjs"));
copyFileSync(join(qpdfDir, "qpdf.wasm"), join(dist, "qpdf.wasm"));
copyFileSync(join(root, "LICENSE"), join(here, "LICENSE"));

// Types for editors and TypeScript: each tool's function carries its description.
const doc = (s) => String(s).replace(/\*\//g, "*\\/");
writeFileSync(join(dist, "index.d.ts"), [
  "// Types for the freethetools code library. Generated by build.mjs.",
  "/** A file for a tool: a path on this computer, bytes, a Blob, or a name with bytes. Your bytes are copied, never changed. */",
  "export type FileInput = string | Uint8Array | ArrayBuffer | Blob | { name: string; bytes: Uint8Array | ArrayBuffer | Blob };",
  "export interface ToolFile { name: string; type: string; size: number; bytes: Uint8Array }",
  "export interface ToolResult { tool: string; summary: string; data?: unknown; files: ToolFile[] }",
  "export interface RunOptions {",
  "  /** Seconds before the call is stopped. Default 60, or 300 for tools that start an engine such as Ghostscript. */",
  "  timeout?: number;",
  "}",
  "export interface ToolInfo { name: string; title: string; description: string; makesFiles: boolean; input: Record<string, unknown> }",
  "/** Every mistake in a call, and every tool failure, with a plain message. */",
  "export declare class FreeTheToolsError extends Error {}",
  '/** Run a tool by name, such as "compress_pdf". File options take a FileInput. */',
  "export declare function run(name: string, args?: Record<string, unknown>, options?: RunOptions): Promise<ToolResult>;",
  "/** Every tool, with its options as JSON Schema. */",
  "export declare function listTools(): ToolInfo[];",
  ...fns.flatMap((f) => [`/** ${doc(f.description)} */`, `export declare function ${f.fn}(args?: Record<string, unknown>, options?: RunOptions): Promise<ToolResult>;`]),
  "",
].join("\n"));
console.log(`Built ${ids.length} tool folders into ${dist}`);
