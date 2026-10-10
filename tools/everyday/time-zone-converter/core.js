// Time Zone Converter, using the browser's own time zone database (Intl), so daylight saving is exact.

/** Offset of a zone from UTC at a given instant, in minutes (e.g. Oslo in summer: 120). */
export function offsetMinutes(zone, date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(date).filter((p) => p.type !== "literal").map((p) => [p.type, +p.value]),
  );
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour % 24, parts.minute, parts.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

/**
 * Work out which instants show the given local time in a zone. Around a clock change a local time
 * can show twice (autumn) or never (spring). The rule is the one Temporal and java.time call "compatible":
 * a time that happens twice takes the earlier one; a time that does not exist moves forward by the gap.
 * @returns {{ instant: Date, change: null | "gap" | "overlap" }}
 */
function resolve(localIso, zone) {
  const m = localIso.match(/^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2})$/);
  if (!m) throw new Error("Enter a date and time.");
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  const DAY = 86400000;
  const before = offsetMinutes(zone, new Date(guess - DAY));
  const after = offsetMinutes(zone, new Date(guess + DAY));
  // An offset is right only if the zone really uses it at the instant it gives.
  const fits = [...new Set([before, after])].map((o) => guess - o * 60000).filter((t) => guess - offsetMinutes(zone, new Date(t)) * 60000 === t);
  if (fits.length === 0) return { instant: new Date(guess - before * 60000), change: "gap" };
  return { instant: new Date(Math.min(...fits)), change: fits.length > 1 ? "overlap" : null };
}

/**
 * The instant when the wall clock in `zone` shows the given local date and time.
 * @param {string} localIso "2026-09-27T09:00"
 * @param {string} zone IANA name, e.g. "Europe/Oslo"
 */
export const zonedToInstant = (localIso, zone) => resolve(localIso, zone).instant;

/** Does the local time fall on a clock change? "gap" = it does not exist, "overlap" = it happens twice, null = neither. */
export const clockChange = (localIso, zone) => resolve(localIso, zone).change;

/** Wall-clock time of an instant in a zone, e.g. { time: "15:00", date: "Sun 27 Sep", offset: "UTC+2", dayShift: 0 }. */
export function inZone(date, zone, refZone) {
  const fmt = (opts) => new Intl.DateTimeFormat("en-GB", { timeZone: zone, ...opts }).format(date);
  const off = offsetMinutes(zone, date);
  const sign = off < 0 ? "-" : "+";
  const offset = `UTC${sign}${Math.floor(Math.abs(off) / 60)}${Math.abs(off) % 60 ? ":" + String(Math.abs(off) % 60).padStart(2, "0") : ""}`;
  const day = (z) => new Intl.DateTimeFormat("en-CA", { timeZone: z, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  const dayShift = refZone ? Math.round((Date.parse(day(zone)) - Date.parse(day(refZone))) / 86400000) : 0;
  return { time: fmt({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" }), date: fmt({ weekday: "short", day: "numeric", month: "short" }), offset, dayShift, hour: +fmt({ hour: "2-digit", hourCycle: "h23" }) };
}

/** Is this local hour within normal working hours (08-18)? */
export const workingHour = (h) => h >= 8 && h < 18;
