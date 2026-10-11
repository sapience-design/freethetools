import { defineTools } from "../../../src/agent/contract.js";
import { fromTimestamp, dateToTimestamp } from "./core.js";

function checkZone(zone) {
  try { new Intl.DateTimeFormat("en", { timeZone: zone }); }
  catch { throw new Error(`"${zone}" isn't a time zone. Use an IANA name such as Europe/Oslo, America/New_York or UTC.`); }
}

export default defineTools({
  name: "convert_unix_timestamp",
  title: "Unix Timestamp Converter",
  description:
    "Convert a Unix timestamp to a date, or a date to a Unix timestamp. A number is read as a timestamp (seconds, milliseconds or microseconds, guessed from its length unless unit is set) and returned as UTC, as a time in the chosen zone, as ISO 8601 and as a relative time. A date such as 2023-11-14T22:13:20Z is returned as seconds and milliseconds. Runs on this device; nothing is uploaded.",
  input: {
    type: "object",
    properties: {
      input: { type: "string", description: "A Unix timestamp such as 1700000000 or 1700000000000, or a date such as 2023-11-14T22:13:20Z or 2023-11-14 22:13:20." },
      unit: { type: "string", enum: ["auto", "s", "ms", "us"], "x-setting": true, description: "For a timestamp: seconds (s), milliseconds (ms) or microseconds (us). Default auto guesses from the number's length." },
      zone: { type: "string", "x-setting": true, description: "IANA time zone for the local time, and for a date that has no Z or offset. Default UTC. Example: Europe/Oslo." },
    },
    required: ["input"],
    additionalProperties: false,
  },
  example: { input: "1700000000", zone: "Europe/Oslo" },
  run: ({ input, unit = "auto", zone = "UTC" }) => {
    checkZone(zone);
    if (/^[+-]?[\d.,_\s]+$/.test(input.trim())) {
      const r = fromTimestamp(input, { unit, zone });
      return {
        summary: `${input.trim()} (${r.unitName}${r.guessed ? ", guessed" : ""}) = ${r.isoUtc}, ${r.isoLocal} in ${zone}, ${r.relative}`,
        data: { unit: r.unit, unitGuessed: r.guessed, seconds: r.seconds, milliseconds: r.milliseconds, isoUtc: r.isoUtc, isoLocal: r.isoLocal, zone, utc: r.utc, local: r.local, relative: r.relative },
      };
    }
    const r = dateToTimestamp(input, { mode: "local", zone });
    return {
      summary: `${input.trim()} = ${r.seconds} seconds, ${r.milliseconds} milliseconds`,
      data: { seconds: r.seconds, milliseconds: r.milliseconds, isoUtc: r.isoUtc, clockChange: r.change },
    };
  },
});
