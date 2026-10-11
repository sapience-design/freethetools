import test from "node:test";
import assert from "node:assert/strict";
import tools from "../agent.js";

const [tool] = tools;

test("agent: a timestamp becomes a date", async () => {
  const r = await tool.run({ input: "1700000000", zone: "Europe/Oslo" }, {});
  assert.equal(r.data.isoUtc, "2023-11-14T22:13:20Z");
  assert.equal(r.data.isoLocal, "2023-11-14T23:13:20+01:00");
  assert.equal(r.data.unit, "s");
  assert.equal(r.data.unitGuessed, true);
});

test("agent: milliseconds can be chosen", async () => {
  const r = await tool.run({ input: "1700000000", unit: "ms" }, {});
  assert.equal(r.data.isoUtc, "1970-01-20T16:13:20Z");
});

test("agent: a date becomes a timestamp", async () => {
  const r = await tool.run({ input: "2023-11-14T22:13:20Z" }, {});
  assert.equal(r.data.seconds, 1700000000);
  assert.equal(r.data.milliseconds, 1700000000000);
  const oslo = await tool.run({ input: "2023-11-14 23:13:20", zone: "Europe/Oslo" }, {});
  assert.equal(oslo.data.seconds, 1700000000);
});

test("agent: bad input and bad zones say what to fix", async () => {
  await assert.rejects(async () => tool.run({ input: "soon" }, {}), /not a date I can read/);
  await assert.rejects(async () => tool.run({ input: "0", zone: "Mars/Base" }, {}), /IANA name/);
});
