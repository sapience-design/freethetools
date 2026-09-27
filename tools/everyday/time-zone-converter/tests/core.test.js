import test from "node:test";
import assert from "node:assert/strict";
import { offsetMinutes, zonedToInstant, inZone, workingHour } from "../core.js";

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
