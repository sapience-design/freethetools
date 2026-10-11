import test from "node:test";
import assert from "node:assert/strict";
import { zonedToInstant, dayStrip, localParts } from "../core.js";

test("local parts of an instant in a zone", () => {
  const t = zonedToInstant("2026-10-15T09:05", "Europe/Oslo");
  assert.deepEqual(localParts(t, "Europe/Oslo"), { date: "2026-10-15", time: "09:05", hour: 9, minute: 5 });
  assert.deepEqual(localParts(t, "Asia/Tokyo"), { date: "2026-10-15", time: "16:05", hour: 16, minute: 5 });
});

test("a day strip has 24 cells for the chosen day in the reference zone", () => {
  const t = zonedToInstant("2026-10-15T09:00", "Europe/Oslo");
  const strip = dayStrip(t, "Europe/Oslo", "Europe/Oslo");
  assert.equal(strip.length, 24);
  assert.equal(strip[0].hour, 0);
  assert.equal(strip[9].hour, 9);
  assert.equal(strip[9].now, true);
  assert.equal(strip.filter((c) => c.now).length, 1);
  assert.equal(strip[8].working, true);
  assert.equal(strip[7].working, false);
  assert.equal(strip[17].working, true);
  assert.equal(strip[18].working, false);
  assert.equal(strip[0].dayStart, "Thu 15 Oct");
  assert.equal(strip[1].dayStart, null);
});

test("another city's strip lines up with the reference day and marks its own midnight", () => {
  const t = zonedToInstant("2026-10-15T09:00", "Europe/Oslo");
  const tokyo = dayStrip(t, "Europe/Oslo", "Asia/Tokyo"); // Tokyo is 7 hours ahead of Oslo in October
  assert.equal(tokyo[0].hour, 7);
  assert.equal(tokyo[9].hour, 16);
  assert.equal(tokyo[9].now, true);
  assert.equal(tokyo[17].hour, 0);
  assert.equal(tokyo[17].dayStart, "Fri 16 Oct");
  const ny = dayStrip(t, "Europe/Oslo", "America/New_York"); // 6 hours behind
  assert.equal(ny[0].hour, 18);
  assert.equal(ny[6].hour, 0);
  assert.equal(ny[6].dayStart, "Thu 15 Oct");
});

test("the chosen cell is the one that contains the minute, not only the full hour", () => {
  const t = zonedToInstant("2026-10-15T09:45", "Europe/Oslo");
  const strip = dayStrip(t, "Europe/Oslo", "Europe/Oslo");
  assert.equal(strip[9].now, true);
  assert.equal(strip[10].now, false);
});

test("every cell carries the ISO time to set when it is pressed", () => {
  const t = zonedToInstant("2026-10-15T09:00", "Europe/Oslo");
  const strip = dayStrip(t, "Europe/Oslo", "Asia/Tokyo");
  assert.equal(strip[14].pick, "2026-10-15T14:00");
});
