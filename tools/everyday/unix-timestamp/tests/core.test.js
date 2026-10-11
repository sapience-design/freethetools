import test from "node:test";
import assert from "node:assert/strict";
import { detectUnit, parseNumber, fromTimestamp, dateToTimestamp, relativeTime, isoIn } from "../core.js";

const NOW = Date.parse("2026-10-11T12:00:00Z");
const opts = (extra = {}) => ({ zone: "Europe/Oslo", nowMs: NOW, ...extra });

test("0 is the start of 1970 in UTC", () => {
  const r = fromTimestamp("0", opts());
  assert.equal(r.isoUtc, "1970-01-01T00:00:00Z");
  assert.equal(r.isoLocal, "1970-01-01T01:00:00+01:00");
  assert.equal(r.unit, "s");
  assert.equal(r.guessed, true);
});

test("a negative timestamp is before 1970", () => {
  assert.equal(fromTimestamp("-1", opts()).isoUtc, "1969-12-31T23:59:59Z");
  assert.equal(fromTimestamp("-86400", opts()).isoUtc, "1969-12-31T00:00:00Z");
  // Apollo 11 landing, 20 July 1969 20:17:40 UTC
  assert.equal(fromTimestamp("-14182940", opts()).isoUtc, "1969-07-20T20:17:40Z");
});

test("2147483647 is the 32-bit limit on 19 January 2038", () => {
  const r = fromTimestamp("2147483647", opts());
  assert.equal(r.isoUtc, "2038-01-19T03:14:07Z");
  assert.equal(r.isoLocal, "2038-01-19T04:14:07+01:00");
  assert.match(r.utc, /2038/);
  assert.equal(fromTimestamp("2147483648", opts()).isoUtc, "2038-01-19T03:14:08Z");
});

test("milliseconds and microseconds are detected from the length", () => {
  assert.equal(detectUnit(1700000000), "s");
  assert.equal(detectUnit(1700000000000), "ms");
  assert.equal(detectUnit(1700000000000000), "us");
  const ms = fromTimestamp("1700000000123", opts());
  assert.equal(ms.unit, "ms");
  assert.equal(ms.isoUtc, "2023-11-14T22:13:20.123Z");
  const us = fromTimestamp("1700000000123456", opts());
  assert.equal(us.unit, "us");
  assert.equal(us.isoUtc, "2023-11-14T22:13:20.123Z");
});

test("the unit can be chosen, and then it is not a guess", () => {
  const r = fromTimestamp("1700000000", opts({ unit: "ms" }));
  assert.equal(r.guessed, false);
  assert.equal(r.isoUtc, "1970-01-20T16:13:20Z");
});

test("fractions of a second are kept", () => {
  assert.equal(fromTimestamp("1700000000.5", opts()).isoUtc, "2023-11-14T22:13:20.500Z");
});

test("spaces, commas and underscores in a number are ignored", () => {
  assert.equal(parseNumber("1,700,000,000"), 1700000000);
  assert.equal(parseNumber(" 1_700_000_000 "), 1700000000);
});

test("input that is not a number says how to fix it", () => {
  assert.throws(() => fromTimestamp("abc"), /not a number.*digits only/);
  assert.throws(() => fromTimestamp(""), /Type a Unix timestamp/);
  assert.throws(() => fromTimestamp("12-34"), /not a number/);
  assert.throws(() => fromTimestamp("2023-11-14"), /looks like a date.*step 2/);
});

test("a timestamp too large for any unit is refused", () => {
  assert.throws(() => fromTimestamp("99999999999999999999"), /outside the years 1 to 9999/);
  assert.throws(() => fromTimestamp("9999999999999", opts({ unit: "s" })), /outside the years 1 to 9999.*Try another unit/);
});

test("relative time in the page language", () => {
  assert.equal(relativeTime(NOW - 3 * 86400000 - 3600000, NOW), "3 days ago");
  assert.equal(relativeTime(NOW + 2 * 3600000, NOW), "in 2 hours");
  assert.equal(relativeTime(NOW, NOW), "now");
  assert.equal(relativeTime(NOW - 400 * 86400000, NOW), "last year");
  assert.equal(relativeTime(NOW - 3 * 86400000, NOW, "es"), "hace 3 días");
  assert.equal(fromTimestamp(String(NOW / 1000), opts()).relative, "now");
});

test("the long dates are written in the chosen language and zone", () => {
  const en = fromTimestamp("1700000000", opts());
  assert.match(en.utc, /Tuesday, November 14, 2023.*10:13:20 PM UTC/);
  assert.match(en.local, /November 14, 2023.*11:13:20 PM/);
  assert.match(fromTimestamp("1700000000", opts({ locale: "nb" })).utc, /tirsdag 14. november 2023/);
});

test("date to timestamp in UTC", () => {
  const r = dateToTimestamp("2023-11-14T22:13:20", { mode: "utc" });
  assert.equal(r.seconds, 1700000000);
  assert.equal(r.milliseconds, 1700000000000);
  assert.equal(dateToTimestamp("1970-01-01T00:00").seconds, 0);
  assert.equal(dateToTimestamp("1969-12-31T23:59:59").seconds, -1);
  assert.equal(dateToTimestamp("2038-01-19 03:14:07").seconds, 2147483647);
  assert.equal(dateToTimestamp("2023-11-14").seconds, 1699920000);
});

test("date to timestamp in a local zone, with daylight saving", () => {
  assert.equal(dateToTimestamp("2026-07-01T12:00", { mode: "local", zone: "Europe/Oslo" }).seconds, Date.parse("2026-07-01T10:00:00Z") / 1000);
  assert.equal(dateToTimestamp("2026-01-15T12:00", { mode: "local", zone: "Europe/Oslo" }).seconds, Date.parse("2026-01-15T11:00:00Z") / 1000);
});

test("a date in the hour the clocks skip moves forward by the gap", () => {
  // 2026-03-08 02:30 does not exist in New York (02:00 jumps to 03:00). It becomes 03:30 EDT.
  const r = dateToTimestamp("2026-03-08T02:30", { mode: "local", zone: "America/New_York" });
  assert.equal(r.change, "gap");
  assert.equal(r.milliseconds, Date.parse("2026-03-08T07:30:00Z"));
});

test("a date in the hour the clocks repeat takes the first one", () => {
  // 2026-11-01 01:30 happens twice in New York. The first is 05:30 UTC (EDT).
  const r = dateToTimestamp("2026-11-01T01:30", { mode: "local", zone: "America/New_York" });
  assert.equal(r.change, "overlap");
  assert.equal(r.milliseconds, Date.parse("2026-11-01T05:30:00Z"));
  assert.equal(dateToTimestamp("2026-11-01T03:30", { mode: "local", zone: "America/New_York" }).change, null);
});

test("an offset in the text wins over the chosen mode", () => {
  assert.equal(dateToTimestamp("2023-11-14T23:13:20+01:00", { mode: "local", zone: "Asia/Tokyo" }).seconds, 1700000000);
  assert.equal(dateToTimestamp("2023-11-14T22:13:20Z", { mode: "local", zone: "Asia/Tokyo" }).seconds, 1700000000);
  assert.equal(dateToTimestamp("2023-11-14T17:13:20-0500").seconds, 1700000000);
});

test("early years stay in those years", () => {
  const r = dateToTimestamp("0050-06-01T00:00");
  assert.equal(isoIn(r.milliseconds, "UTC"), "0050-06-01T00:00:00Z");
});

test("bad dates say how to fix them", () => {
  assert.throws(() => dateToTimestamp(""), /Pick a date and time/);
  assert.throws(() => dateToTimestamp("yesterday"), /not a date I can read.*2023-11-14/);
  assert.throws(() => dateToTimestamp("2023-02-30T10:00"), /does not exist/);
  assert.throws(() => dateToTimestamp("2023-11-14T25:00"), /does not exist/);
});

test("both directions agree", () => {
  for (const ts of [0, -1, 86399, 951782400, 1700000000, 2147483647, 4102444800]) {
    assert.equal(dateToTimestamp(fromTimestamp(String(ts), opts()).isoUtc).seconds, ts);
    assert.equal(dateToTimestamp(fromTimestamp(String(ts), opts()).isoLocal).seconds, ts);
  }
});
