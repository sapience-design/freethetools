import test from "node:test";
import assert from "node:assert/strict";
import { EVENT_CEILING, LIKE_LIMIT, canRefetchTools, cleanWeight, dayKey, parseBody, sampleRateFor, sameOrigin, summarize, normalizeRef, normalizeCountry } from "../worker/logic.js";

const tools = new Set(["pdf/compress", "text/word-counter"]);

test("accepts only known tools and kinds", () => {
  assert.deepEqual(parseBody({ tool: "pdf/compress", kind: "use" }, tools, "event"), { tool: "pdf/compress", kind: "use", weight: 1 });
  assert.deepEqual(parseBody({ tool: "pdf/compress", kind: "success" }, tools, "event"), { tool: "pdf/compress", kind: "success", weight: 1 });
  assert.throws(() => parseBody({ tool: "evil/tool", kind: "use" }, tools, "event"), /unknown tool/);
  assert.throws(() => parseBody({ tool: "pdf/compress", kind: "click" }, tools, "event"), /unknown kind/);
  assert.throws(() => parseBody("nope", tools, "event"), /bad body/);
});

test("visits carry only a referrer name and a device type, cleaned, and no tool", () => {
  assert.deepEqual(parseBody({ ref: "www.google.no", device: "phone", tool: "pdf/compress" }, tools, "visit"), { ref: "Google", device: "phone", weight: 1 });
  assert.deepEqual(parseBody({ device: "fridge" }, tools, "visit"), { ref: "Direct", device: null, weight: 1 });
  assert.deepEqual(parseBody({ ref: "example.org/a?b" }, tools, "visit"), { ref: null, device: null, weight: 1 });
});

test("referrers become source names or bare domains, never paths", () => {
  assert.equal(normalizeRef("news.ycombinator.com"), "Hacker News");
  assert.equal(normalizeRef("t.co"), "X");
  assert.equal(normalizeRef("www.example.org"), "example.org");
  assert.equal(normalizeRef(""), "Direct");
  assert.equal(normalizeRef("example.org/secret?x=1"), null);
  assert.equal(normalizeRef("x".repeat(70) + ".com"), null);
});

test("countries are two-letter codes; Tor and unknown become XX", () => {
  assert.equal(normalizeCountry("NO"), "NO");
  assert.equal(normalizeCountry("T1"), "XX");
  assert.equal(normalizeCountry(undefined), "XX");
});

test("likes need a true/false on", () => {
  assert.deepEqual(parseBody({ tool: "pdf/compress", on: false }, tools, "like"), { tool: "pdf/compress", on: false });
  assert.throws(() => parseBody({ tool: "pdf/compress", on: "yes" }, tools, "like"), /bad like/);
});

test("only same-origin requests may write", () => {
  const req = (origin) => new Request("https://freethetools.com/api/stats/event", { method: "POST", headers: origin ? { Origin: origin } : {} });
  assert.equal(sameOrigin(req("https://freethetools.com")), true);
  assert.equal(sameOrigin(req("https://evil.example")), false);
  assert.equal(sameOrigin(req(null)), false);
});

test("summary never shows negative likes and sorts breakdowns", () => {
  const s = summarize(
    [{ tool: "pdf/compress", views: 10, uses: 4, likes: -1, uses30: 2, successes: 3, errors: 1 }],
    [{ dim: "country", key: "SE", n: 2 }, { dim: "country", key: "NO", n: 5 }, { dim: "device", key: "phone", n: 3 }, { dim: "visit", key: "all", n: 7 }],
  );
  assert.deepEqual(s.tools["pdf/compress"], { views: 10, uses: 4, likes: 0, uses30: 2, successes: 3, errors: 1 });
  assert.equal(s.site.visits30, 7);
  assert.deepEqual(s.site.countries, [["NO", 5], ["SE", 2]]);
  assert.deepEqual(s.site.devices, [["phone", 3]]);
});

test("day keys are UTC dates", () => {
  assert.equal(dayKey(new Date("2026-09-28T23:30:00-05:00")), "2026-09-29");
});

test("bodies with more than 5 keys are rejected", () => {
  const ok = { tool: "pdf/compress", kind: "use", a: 1, b: 2, c: 3 };
  assert.equal(parseBody(ok, tools, "event").kind, "use");
  assert.throws(() => parseBody({ ...ok, d: 4 }, tools, "event"), /too many keys/);
  assert.throws(() => parseBody({ device: "phone", a: 1, b: 2, c: 3, d: 4, e: 5 }, tools, "visit"), /too many keys/);
});

test("sampling rate steps up with the 7-day average of daily visits", () => {
  assert.equal(sampleRateFor(0), 1);
  assert.equal(sampleRateFor(14999), 1);
  assert.equal(sampleRateFor(15000), 5);
  assert.equal(sampleRateFor(39999), 5);
  assert.equal(sampleRateFor(40000), 10);
  assert.equal(sampleRateFor(99999), 10);
  assert.equal(sampleRateFor(100000), 20);
  assert.equal(sampleRateFor(NaN), 1);
  assert.equal(sampleRateFor(undefined), 1);
});

test("a weight counts only when it is a whole number equal to the server rate", () => {
  assert.equal(cleanWeight(5, 5), 5);
  assert.equal(cleanWeight(5, 1), 1);
  assert.equal(cleanWeight(10, 5), 1);
  assert.equal(cleanWeight(2.5, 5), 1);
  assert.equal(cleanWeight("5", 5), 1);
  assert.equal(cleanWeight(0, 1), 1);
  assert.equal(cleanWeight(21, 21), 1);
  assert.equal(cleanWeight(undefined, 5), 1);
  assert.equal(parseBody({ tool: "pdf/compress", kind: "view", weight: 5 }, tools, "event", 5).weight, 5);
  assert.equal(parseBody({ tool: "pdf/compress", kind: "view", weight: 5 }, tools, "event", 1).weight, 1);
  assert.equal(parseBody({ device: "phone", weight: 10 }, tools, "visit", 10).weight, 10);
});

test("the summary carries the sampling rate for the last 7 days", () => {
  assert.deepEqual(summarize([], [], 0).sample, { visits: 1, events: 1 });
  assert.deepEqual(summarize([], [], 7 * 40000).sample, { visits: 10, events: 10 });
});

test("the tool list is fetched again at most once a minute", () => {
  assert.equal(canRefetchTools(1000, 0), false);
  assert.equal(canRefetchTools(59999, 0), false);
  assert.equal(canRefetchTools(60000, 0), true);
});

test("limits are the agreed numbers", () => {
  assert.equal(LIKE_LIMIT, 500);
  assert.equal(EVENT_CEILING, 100000);
});
