import { defineTools } from "../../../src/agent/contract.js";
import { inZone, zonedToInstant } from "./core.js";

function checkZone(zone) {
  try { new Intl.DateTimeFormat("en", { timeZone: zone }); }
  catch { throw new Error(`"${zone}" isn't a time zone. Use an IANA name such as Europe/Oslo or America/New_York.`); }
}

export default defineTools({
  name: "convert_time_zone",
  title: "Time Zone Converter",
  description:
    "Convert a local date and time in one time zone to other time zones, with daylight saving applied exactly from the time zone database, and flag times outside working hours (08-18). Runs on this device; nothing is uploaded.",
  input: {
    type: "object",
    properties: {
      time: { type: "string", "x-setting": true, description: "Local date and time in the source zone, as YYYY-MM-DDTHH:mm, e.g. 2026-10-06T09:00." },
      from: { type: "string", "x-setting": true, description: "Source time zone, IANA name, e.g. Europe/Oslo." },
      to: { type: "array", "x-setting": true, items: { type: "string" }, minItems: 1, maxItems: 50, description: "Target time zones, IANA names." },
    },
    required: ["time", "from", "to"],
    additionalProperties: false,
  },
  example: { time: "2026-10-06T09:00", from: "Europe/Oslo", to: ["America/New_York", "Asia/Tokyo"] },
  run: ({ time, from, to }) => {
    for (const z of [from, ...to]) checkZone(z);
    const instant = zonedToInstant(time, from);
    const times = to.map((zone) => {
      const r = inZone(instant, zone, from);
      return { zone, time: r.time, date: r.date, offset: r.offset, dayShift: r.dayShift, workingHours: r.hour >= 8 && r.hour < 18 };
    });
    return {
      summary: times.map((t) => `${t.zone} ${t.time}${t.dayShift ? ` (${t.dayShift > 0 ? "+" : ""}${t.dayShift} day)` : ""}`).join(", "),
      data: { utc: instant.toISOString(), times },
    };
  },
});
