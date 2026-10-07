// CSV to JSON (and back), using Papa Parse (MIT). Detects the delimiter; keeps text as text.
import Papa from "papaparse";

/**
 * @param {string} csv
 * @param {{ header?: boolean, typed?: boolean, delimiter?: string }} [opts] delimiter: leave out to detect it
 * @returns {{ json: string, rows: number, delimiter: string, warnings: string[] }}
 */
export function csvToJson(csv, opts = {}) {
  const { header = true, typed = false, delimiter } = opts;
  if (!csv.trim()) throw new Error("Paste some CSV, or drop a .csv file.");
  // Strip only newlines. Trimming spaces or tabs would drop the empty cells on a last TSV row.
  const text = csv.replace(/^[\r\n]+/, "").replace(/[\r\n]+$/, "");
  const r = Papa.parse(text, { header, dynamicTyping: typed, skipEmptyLines: true, ...(delimiter ? { delimiter } : {}) });
  const warnings = r.errors.slice(0, 5).map((e) => `Row ${(e.row ?? 0) + 1}: ${e.message}`);
  // Papa renames repeated column names (a, a_1) and only reports it on the console.
  const renamed = Object.entries(r.meta.renamedHeaders ?? {});
  if (renamed.length) warnings.push(`Repeated column names were renamed: ${renamed.map(([to, from]) => `${from} to ${to}`).join(", ")}.`);
  return { json: JSON.stringify(r.data, null, 2), rows: r.data.length, delimiter: r.meta.delimiter, warnings };
}

/**
 * @param {string} json an array of objects or an array of arrays
 * @param {{ delimiter?: string }} [opts]
 */
export function jsonToCsv(json, opts = {}) {
  let data;
  try { data = JSON.parse(json); } catch (e) { throw new Error(`Not valid JSON: ${e.message}`); }
  if (!Array.isArray(data)) throw new Error("Use a JSON array, for example [{\"name\": \"Ada\"}].");
  const delimiter = opts.delimiter ?? ",";
  const objects = data.filter((r) => r !== null && typeof r === "object" && !Array.isArray(r)).length;
  const arrays = data.filter(Array.isArray).length;
  if (objects + arrays !== data.length) throw new Error('Every item in the list must be an object (like {"name": "Ada"}) or an array (like ["Ada", 36]).');
  if (objects && arrays) throw new Error("The list mixes objects and arrays. Use only objects, or only arrays.");
  // Nested values stay in the cell as JSON text.
  const cell = (v) => (v !== null && typeof v === "object" ? JSON.stringify(v) : v);
  if (arrays) return Papa.unparse(data.map((r) => r.map(cell)), { delimiter });
  // Columns are the union of every row's keys, in the order first seen.
  const fields = [...new Set(data.flatMap((r) => Object.keys(r)))];
  return Papa.unparse({ fields, data: data.map((r) => fields.map((f) => cell(r[f]))) }, { delimiter });
}
