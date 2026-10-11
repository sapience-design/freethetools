// Unix Timestamp Converter. Uses only Date and Intl, so it needs no library and works offline.
// A Unix timestamp counts time since 1 January 1970 00:00:00 UTC. Leap seconds are not counted.

/** The years this tool shows: 0001 to 9999. Outside that, Intl prints eras and signs that confuse people. */
const MIN_MS = -62135596800000;
const MAX_MS = 253402300799999;
const UNIT_MS = { s: 1000, ms: 1, us: 0.001 };
export const UNIT_NAMES = { s: "seconds", ms: "milliseconds", us: "microseconds" };

const DATE_HELP = "Enter a date such as 2023-11-14 22:13:20 or 2023-11-14T22:13:20Z.";

/** Milliseconds for a calendar date and time given as UTC fields. Years 0 to 99 stay in those years. */
function utcMs(y, mo, d, h = 0, mi = 0, s = 0, ms = 0) {
  const dt = new Date(0);
  dt.setUTCFullYear(y, mo - 1, d);
  dt.setUTCHours(h, mi, s, ms);
  return dt.getTime();
}

/** Offset of a zone from UTC at an instant, in minutes (Oslo in summer: 120). */
export function offsetMinutes(zone, ms) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(new Date(ms)).filter((x) => x.type !== "literal").map((x) => [x.type, +x.value]),
  );
  return Math.round((utcMs(p.year, p.month, p.day, p.hour % 24, p.minute, p.second) - Math.floor(ms / 1000) * 1000) / 60000);
}

const pad = (n) => String(n).padStart(2, "0");
const offsetText = (min) => `${min < 0 ? "-" : "+"}${pad(Math.floor(Math.abs(min) / 60))}:${pad(Math.abs(min) % 60)}`;

/** The zone this device uses, as an IANA name. */
export const deviceZone = () => new Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

/**
 * Which unit a bare number most likely is. Seconds up to 11 digits (year 5138), milliseconds up to
 * 14 digits, microseconds beyond that. 1700000000 is seconds; 1700000000000 is milliseconds.
 * @param {number} n
 * @returns {"s"|"ms"|"us"}
 */
export function detectUnit(n) {
  const a = Math.abs(n);
  return a < 1e11 ? "s" : a < 1e14 ? "ms" : "us";
}

/** Read the text as a number. Spaces, commas and underscores between digits are ignored. */
export function parseNumber(text) {
  const t = String(text ?? "").trim().replace(/[\s,_]/g, "");
  if (!t) throw new Error("Type a Unix timestamp, for example 1700000000.");
  if (!/^[+-]?\d+(\.\d+)?$/.test(t)) {
    const looksLikeDate = /^\d{4}-\d{2}-\d{2}/.test(t);
    throw new Error(looksLikeDate
      ? "That looks like a date, not a timestamp. Use step 2 to turn a date into a timestamp."
      : "That is not a number. Use digits only, for example 1700000000, with a minus sign for a date before 1970.");
  }
  return Number(t);
}

/**
 * Relative time such as "3 days ago", in the page language. Whole units, rounded toward zero.
 * @param {number} ms the moment
 * @param {number} nowMs the reference moment
 * @param {string} [locale]
 */
export function relativeTime(ms, nowMs, locale = "en") {
  const sec = (ms - nowMs) / 1000;
  const a = Math.abs(sec);
  const [value, unit] = a < 60 ? [sec, "second"] : a < 3600 ? [sec / 60, "minute"] : a < 86400 ? [sec / 3600, "hour"]
    : a < 86400 * 30 ? [sec / 86400, "day"] : a < 86400 * 365 ? [sec / (86400 * 30.4375), "month"] : [sec / (86400 * 365.25), "year"];
  return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(Math.trunc(value) || 0, unit);
}

/** A moment as ISO 8601 with the zone's offset, or "Z" for UTC. The milliseconds show only when not zero. */
export function isoIn(ms, zone) {
  const off = zone === "UTC" ? 0 : offsetMinutes(zone, ms);
  const s = new Date(ms + off * 60000).toISOString().slice(0, -1).replace(/\.000$/, "");
  return s + (zone === "UTC" ? "Z" : offsetText(off));
}

/** A moment written out in a zone and language, e.g. "Tuesday 14 November 2023 at 22:13:20 UTC". */
export function longDate(ms, zone, locale = "en") {
  return new Intl.DateTimeFormat(locale, { dateStyle: "full", timeStyle: "long", timeZone: zone }).format(new Date(ms));
}

/**
 * Timestamp to date.
 * @param {string|number} input the timestamp
 * @param {{ unit?: "auto"|"s"|"ms"|"us", zone?: string, nowMs?: number, locale?: string }} [opts]
 */
export function fromTimestamp(input, { unit = "auto", zone = deviceZone(), nowMs = Date.now(), locale = "en" } = {}) {
  const n = typeof input === "number" ? input : parseNumber(input);
  if (!Number.isFinite(n)) throw new Error("That is not a number. Use digits only, for example 1700000000.");
  const guessed = unit === "auto";
  const u = guessed ? detectUnit(n) : unit;
  if (!UNIT_MS[u]) throw new Error("Choose seconds, milliseconds or microseconds.");
  const ms = Math.floor(Math.round(n * UNIT_MS[u] * 1000) / 1000);
  if (!(ms >= MIN_MS && ms <= MAX_MS)) {
    throw new Error(`That is outside the years 1 to 9999 when read as ${UNIT_NAMES[u]}.${guessed ? "" : " Try another unit."}`);
  }
  return {
    unit: u,
    unitName: UNIT_NAMES[u],
    guessed,
    digits: String(Math.trunc(Math.abs(n))).length,
    seconds: Math.floor(ms / 1000),
    milliseconds: ms,
    zone,
    utc: longDate(ms, "UTC", locale),
    local: longDate(ms, zone, locale),
    isoUtc: isoIn(ms, "UTC"),
    isoLocal: isoIn(ms, zone),
    relative: relativeTime(ms, nowMs, locale),
  };
}

/**
 * The instant when the wall clock in a zone shows the given local time. Around a clock change a
 * time can show twice (autumn) or never (spring). A time that happens twice takes the earlier one;
 * a time that does not exist moves forward by the gap.
 * @returns {{ ms: number, change: null | "gap" | "overlap" }}
 */
function resolveLocal(guess, zone) {
  const DAY = 86400000;
  const before = offsetMinutes(zone, guess - DAY);
  const after = offsetMinutes(zone, guess + DAY);
  const fits = [...new Set([before, after])].map((o) => guess - o * 60000).filter((t) => guess - offsetMinutes(zone, t) * 60000 === t);
  if (fits.length === 0) return { ms: guess - before * 60000, change: "gap" };
  return { ms: Math.min(...fits), change: fits.length > 1 ? "overlap" : null };
}

/**
 * Date to timestamp.
 * @param {string} text "2023-11-14T22:13:20", "2023-11-14 22:13", "2023-11-14", or any of those with Z or +01:00
 * @param {{ mode?: "utc"|"local", zone?: string }} [opts] how to read a date that carries no offset
 */
export function dateToTimestamp(text, { mode = "utc", zone = deviceZone() } = {}) {
  const t = String(text ?? "").trim();
  if (!t) throw new Error(`Pick a date and time. ${DATE_HELP}`);
  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,9}))?)?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$/i);
  if (!m) throw new Error(`That is not a date I can read. ${DATE_HELP}`);
  const [y, mo, d, h, mi, s] = [m[1], m[2], m[3], m[4] ?? 0, m[5] ?? 0, m[6] ?? 0].map(Number);
  const msPart = m[7] ? Math.floor(Number("0." + m[7]) * 1000) : 0;
  const guess = utcMs(y, mo, d, h, mi, s, msPart);
  const chk = new Date(guess);
  if (mo < 1 || mo > 12 || chk.getUTCMonth() !== mo - 1 || chk.getUTCDate() !== d || h > 23 || mi > 59 || s > 59) {
    throw new Error(`That date or time does not exist. Check the day, month and time. ${DATE_HELP}`);
  }
  let ms = guess, change = null;
  if (m[8] && m[8].toUpperCase() !== "Z") {
    const digits = m[8].replace(":", "");
    const sign = digits[0] === "-" ? -1 : 1;
    ms = guess - sign * (+digits.slice(1, 3) * 60 + +(digits.slice(3, 5) || 0)) * 60000;
  } else if (!m[8] && mode === "local") {
    ({ ms, change } = resolveLocal(guess, zone));
  }
  if (!(ms >= MIN_MS && ms <= MAX_MS)) throw new Error("That date is outside the years 1 to 9999.");
  return { seconds: Math.floor(ms / 1000), milliseconds: ms, isoUtc: isoIn(ms, "UTC"), change };
}
