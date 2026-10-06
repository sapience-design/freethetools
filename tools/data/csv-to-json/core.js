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
  const r = Papa.parse(csv.trim(), { header, dynamicTyping: typed, skipEmptyLines: true, ...(delimiter ? { delimiter } : {}) });
  const warnings = r.errors.slice(0, 5).map((e) => `Row ${(e.row ?? 0) + 1}: ${e.message}`);
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
  return Papa.unparse(data, { delimiter: opts.delimiter ?? "," });
}
