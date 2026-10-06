import { baseName, defineTools, file, textFile, textOrFile } from "../../../src/agent/contract.js";
import { csvToJson, jsonToCsv } from "./core.js";

export default defineTools(
  {
    name: "csv_to_json",
    title: "CSV to JSON",
    description:
      "Turn CSV into JSON: an array of objects keyed by the header row, or an array of arrays. Detects the delimiter (comma, semicolon, tab). Give text to get text back, or a file to get a .json file. Runs on this device; nothing is uploaded.",
    input: {
      type: "object",
      properties: {
        text: { type: "string", description: "CSV text. Give this or file." },
        file: file("A .csv file. Give this or text.", ["text/csv", "text/plain", "text/tab-separated-values"]),
        header: { type: "boolean", description: "The first row holds column names (default true)." },
        typed: { type: "boolean", description: "Turn numbers and true/false into JSON numbers and booleans (default false: keep everything as text)." },
      },
      additionalProperties: false,
    },
    example: { text: "name,age\nAda,36\nAlan,41", typed: true },
    run: (args) => {
      const { text, file: f } = textOrFile(args, "CSV");
      const r = csvToJson(text, { header: args.header ?? true, typed: args.typed ?? false });
      const summary = `${r.rows} rows converted.${r.warnings.length ? ` ${r.warnings.length} warning(s).` : ""}`;
      const data = { rows: r.rows, delimiter: r.delimiter, warnings: r.warnings };
      if (f) return { summary, data, files: [textFile(`${baseName(f.name)}.json`, "application/json", r.json)] };
      return { summary, data: { ...data, json: r.json } };
    },
  },
  {
    name: "json_to_csv",
    title: "CSV to JSON",
    description:
      "Turn a JSON array (of objects, or of arrays) into CSV. Give text to get text back, or a file to get a .csv file. Runs on this device; nothing is uploaded.",
    input: {
      type: "object",
      properties: {
        text: { type: "string", description: "JSON text. Give this or file." },
        file: file("A .json file. Give this or text.", ["application/json", "text/plain"]),
        delimiter: { type: "string", enum: [",", ";", "\t"], description: "Column separator (default comma)." },
      },
      additionalProperties: false,
    },
    example: { text: '[{"name":"Ada","age":36}]' },
    run: (args) => {
      const { text, file: f } = textOrFile(args, "JSON");
      const csv = jsonToCsv(text, { delimiter: args.delimiter ?? "," });
      const rows = Math.max(0, csv.split(/\r?\n/).filter(Boolean).length - 1);
      const summary = `${rows} rows converted.`;
      if (f) return { summary, data: { rows }, files: [textFile(`${baseName(f.name)}.csv`, "text/csv", csv)] };
      return { summary, data: { rows, csv } };
    },
  },
);
