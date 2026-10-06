import { baseName, defineTools, file, textFile, textOrFile } from "../../../src/agent/contract.js";
import { formatJson } from "./core.js";

export default defineTools({
  name: "format_json",
  makesFiles: true,
  title: "JSON Formatter",
  description:
    "Check JSON and pretty-print it, minify it, or sort its keys. If it isn't valid, say where: line and column. Give text to get text back, or a file to get a file. Runs on this device; nothing is uploaded.",
  input: {
    type: "object",
    properties: {
      text: { type: "string", description: "JSON text. Give this or file." },
      file: file("A .json file. Give this or text.", ["application/json", "text/plain"]),
      indent: { type: ["integer", "string"], enum: [0, 2, 4, "tab"], description: "Spaces to indent, \"tab\", or 0 to minify (default 2)." },
      sort: { type: "boolean", description: "Sort object keys alphabetically (default false)." },
    },
    additionalProperties: false,
  },
  example: { text: '{"b":1,"a":[1,2]}', sort: true },
  run: (args) => {
    const { text, file: f } = textOrFile(args, "JSON");
    const r = formatJson(text, { indent: args.indent ?? 2, sort: args.sort ?? false });
    if (!r.ok) throw new Error(r.line ? `${r.error} (line ${r.line}, column ${r.column})` : r.error);
    const summary = args.indent === 0 ? "Valid JSON, minified." : "Valid JSON, formatted.";
    if (f) return { summary, files: [textFile(`${baseName(f.name)}.json`, "application/json", r.output)] };
    return { summary, data: { json: r.output } };
  },
});
