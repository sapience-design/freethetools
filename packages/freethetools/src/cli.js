#!/usr/bin/env node
// freethetools: an MCP server and a small command-line runner for Free the Tools on this computer.
import { readFileSync } from "node:fs";
import { callTool, describe, toolSchema } from "./engine.js";
import { libraryDir } from "./library.js";
import { serveMcp } from "./mcp.js";
import { tools } from "./registry.js";

const VERSION = __VERSION__;

const HELP = `Free the Tools ${VERSION}: free tools for AI assistants, on your own computer.
Your files are read from disk and never uploaded.

Use it
  freethetools mcp                      Start the MCP server (for Claude Code, Claude Desktop, Cursor and other MCP clients).
  freethetools list                     List the ${tools.length} tools. Add --json for the full details.
  freethetools run <tool> '<json>'      Run one tool and print the result as JSON.
                                        Files are paths on this computer.
                                        Example: freethetools run merge_pdfs '{"files":["a.pdf","b.pdf"]}'
                                        To read the JSON from a file, write @args.json instead of the JSON.
  freethetools --help                   Show this help.
  freethetools --version                Show the version.

Options
  --library <folder>                    Where results and the record of jobs are kept.
                                        Default: the "Free the Tools" folder in your home folder.
                                        You can also set the FREETHETOOLS_LIBRARY environment variable.

Where results go
  Every result file is saved under <library>/files/<id>/, and every job (including failed ones) is
  added to <library>/library.jsonl. In Chrome or Edge, the library page on https://freethetools.com
  can open that folder. For file-making tools, add "saveTo":"<folder>" to also save results elsewhere.
  Existing files are never overwritten.

Limits
  Each call stops after 60 seconds (5 minutes for compress_pdf). Input files may total up to 2 GB.
`;

function parse(argv) {
  const rest = [];
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--library") opts.library = argv[++i];
    else if (a.startsWith("--library=")) opts.library = a.slice(10);
    else if (a === "--json") opts.json = true;
    else if (a === "--help" || a === "-h") opts.help = true;
    else if (a === "--version" || a === "-v") opts.version = true;
    else rest.push(a);
  }
  return { rest, opts };
}

const out = (s) => process.stdout.write(s + "\n");
const die = (s, code = 1) => { process.stderr.write(s + "\n"); process.exit(code); };

async function main() {
  const { rest, opts } = parse(process.argv.slice(2));
  if (opts.version) return out(VERSION);
  const [cmd, ...args] = rest;
  if (opts.help || !cmd || cmd === "help") return out(HELP);
  if (opts.library === "" || (opts.library === undefined && process.argv.includes("--library"))) die("--library needs a folder.");
  const library = libraryDir(opts.library);

  if (cmd === "mcp") return serveMcp({ library, version: VERSION });

  if (cmd === "list") {
    if (opts.json) {
      return out(JSON.stringify(tools.map((t) => ({ name: t.def.name, title: t.def.title, description: describe(t), input: toolSchema(t) })), null, 2));
    }
    const width = Math.max(...tools.map((t) => t.def.name.length));
    for (const t of tools) out(`${t.def.name.padEnd(width)}  ${t.def.description.split(/(?<=\.)\s/)[0]}`);
    return out(`\n${tools.length} tools. Run "freethetools list --json" for the details of each.`);
  }

  if (cmd === "run") {
    const [name, json] = args;
    if (!name) die('Say which tool to run, for example: freethetools run convert_case \'{"text":"hello","case":"upper"}\'');
    let parsed = {};
    try {
      const text = json?.startsWith("@") ? readFileSync(json.slice(1), "utf8") : json;
      parsed = text ? JSON.parse(text) : {};
    } catch (e) {
      die(`The arguments are not valid JSON: ${e.message}. On Windows, put the JSON in a file and pass @file.json.`);
    }
    const r = await callTool(name, parsed, { library, via: "mcp", by: "agent" });
    out(JSON.stringify(r, null, 2));
    process.exit(r.ok ? 0 : 1);
  }

  die(`I don't know the command "${cmd}". Run "freethetools --help".`, 2);
}

main().catch((e) => die(`Something went wrong: ${e?.message ?? e}`));
