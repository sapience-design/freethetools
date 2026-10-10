import test from "node:test";
import assert from "node:assert/strict";
import { offsetMinutes, zonedToInstant, clockChange, inZone, workingHour } from "../core.js";

test("offsets follow daylight saving", () => {
  assert.equal(offsetMinutes("Europe/Oslo", new Date("2026-07-01T12:00:00Z")), 120);
  assert.equal(offsetMinutes("Europe/Oslo", new Date("2026-01-15T12:00:00Z")), 60);
  assert.equal(offsetMinutes("Asia/Kolkata", new Date("2026-01-15T12:00:00Z")), 330);
  assert.equal(offsetMinutes("America/New_York", new Date("2026-01-15T12:00:00Z")), -300);
});

test("finds the instant for a wall-clock time in a zone", () => {
  assert.equal(zonedToInstant("2026-09-27T09:00", "Europe/Oslo").toISOString(), "2026-09-27T07:00:00.000Z");
  assert.equal(zonedToInstant("2026-12-01T09:00", "America/Los_Angeles").toISOString(), "2026-12-01T17:00:00.000Z");
});

test("shows the time elsewhere, with day changes", () => {
  const t = zonedToInstant("2026-09-27T20:00", "America/New_York");
  const tokyo = inZone(t, "Asia/Tokyo", "America/New_York");
  assert.equal(tokyo.time, "09:00");
  assert.equal(tokyo.dayShift, 1);
  assert.equal(tokyo.offset, "UTC+9");
  assert.equal(inZone(t, "Asia/Kolkata").offset, "UTC+5:30");
});

test("working hours are 8 to 18", () => {
  assert.equal(workingHour(8), true);
  assert.equal(workingHour(18), false);
});

// Clock-change days. The rule is the one Temporal and java.time call "compatible":
// a time that does not exist moves forward by the gap; a time that happens twice takes the earlier one.
test("a time skipped by the spring clock change moves forward by the gap", () => {
  // 02:30 does not exist in New York on 2026-03-08 (02:00 jumps to 03:00). It becomes 03:30 EDT.
  assert.equal(zonedToInstant("2026-03-08T02:30", "America/New_York").toISOString(), "2026-03-08T07:30:00.000Z");
  assert.equal(clockChange("2026-03-08T02:30", "America/New_York"), "gap");
  assert.equal(zonedToInstant("2026-03-08T01:30", "America/New_York").toISOString(), "2026-03-08T06:30:00.000Z");
  assert.equal(zonedToInstant("2026-03-08T03:30", "America/New_York").toISOString(), "2026-03-08T07:30:00.000Z");
  assert.equal(clockChange("2026-03-08T03:30", "America/New_York"), null);
});

test("a time that happens twice in autumn gives the first one", () => {
  // 01:30 happens twice in New York on 2026-11-01. The first is still summer time (UTC-4).
  const t = zonedToInstant("2026-11-01T01:30", "America/New_York");
  assert.equal(t.toISOString(), "2026-11-01T05:30:00.000Z");
  assert.equal(offsetMinutes("America/New_York", t), -240);
  assert.equal(clockChange("2026-11-01T01:30", "America/New_York"), "overlap");
  assert.equal(zonedToInstant("2026-11-01T02:30", "America/New_York").toISOString(), "2026-11-01T07:30:00.000Z");
});

test("a half-hour clock change in Lord Howe Island", () => {
  assert.equal(offsetMinutes("Australia/Lord_Howe", new Date("2026-07-01T12:00:00Z")), 630);
  assert.equal(offsetMinutes("Australia/Lord_Howe", new Date("2026-01-15T12:00:00Z")), 660);
  // Autumn: clocks go back 30 minutes at 02:00 on 2026-04-05, so 01:45 happens twice. The first is at +11:00.
  assert.equal(zonedToInstant("2026-04-05T01:45", "Australia/Lord_Howe").toISOString(), "2026-04-04T14:45:00.000Z");
  assert.equal(clockChange("2026-04-05T01:45", "Australia/Lord_Howe"), "overlap");
  assert.equal(zonedToInstant("2026-04-05T12:00", "Australia/Lord_Howe").toISOString(), "2026-04-05T01:30:00.000Z");
  // Spring: clocks go forward 30 minutes at 02:00 on 2026-10-04, so 02:15 does not exist. It becomes 02:45 at +11:00.
  assert.equal(zonedToInstant("2026-10-04T02:15", "Australia/Lord_Howe").toISOString(), "2026-10-03T15:45:00.000Z");
  assert.equal(clockChange("2026-10-04T02:15", "Australia/Lord_Howe"), "gap");
  assert.equal(zonedToInstant("2026-10-04T12:00", "Australia/Lord_Howe").toISOString(), "2026-10-04T01:00:00.000Z");
});

test("an ordinary time has no clock change", () => {
  assert.equal(clockChange("2026-09-27T09:00", "Europe/Oslo"), null);
  assert.equal(clockChange("2026-03-29T02:30", "Europe/Oslo"), "gap");
});
