import { defineTools } from "../../../src/agent/contract.js";
import { runRegex } from "./core.js";

export default defineTools({
  name: "test_regex",
  title: "Regex Tester",
  description:
    "Run a JavaScript regular expression over text and list every match with its position, numbered groups and named groups. Stops after a limit so a runaway pattern can't flood the answer. Runs on this device; nothing is uploaded.",
  input: {
    type: "object",
    properties: {
      pattern: { type: "string", minLength: 1, description: "The pattern, without slashes, e.g. \\d{4}-\\d{2}" },
      flags: { type: "string", "x-setting": true, description: "Flags such as i, m, s, u (g is always on). Default none." },
      text: { type: "string", description: "The text to search." },
      limit: { type: "integer", minimum: 1, maximum: 500, description: "Most matches to return (default 100)." },
    },
    required: ["pattern", "text"],
    additionalProperties: false,
  },
  example: { pattern: "(?<year>\\d{4})-(\\d{2})", text: "2026-10 and 2027-01" },
  run: ({ pattern, flags = "", text, limit = 100 }) => {
    if (!/^[dgimsuyv]*$/.test(flags)) throw new Error(`"${flags}" has a letter that isn't a regex flag. Use d, g, i, m, s, u, v or y.`);
    const r = runRegex(pattern, flags.includes("g") ? flags : flags + "g", text, limit);
    if (r.error) throw new Error(`The pattern isn't valid: ${r.error}`);
    const n = r.matches.length;
    return {
      summary: n ? `${n}${r.truncated ? "+" : ""} match${n === 1 ? "" : "es"}.` : "No matches.",
      data: { matches: r.matches, truncated: r.truncated },
    };
  },
});
