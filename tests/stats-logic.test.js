import test from "node:test";
import assert from "node:assert/strict";
import { dayKey, parseBody, sameOrigin, summarize, normalizeRef, normalizeCountry } from "../worker/logic.js";

const tools = new Set(["pdf/compress", "text/word-counter"]);

test("accepts only known tools and kinds", () => {
  assert.deepEqual(parseBody({ tool: "pdf/compress", kind: "use" }, tools, "event"), { tool: "pdf/compress", kind: "use" });
  assert.deepEqual(parseBody({ tool: "pdf/compress", kind: "success" }, tools, "event"), { tool: "pdf/compress", kind: "success" });
  assert.throws(() => parseBody({ tool: "evil/tool", kind: "use" }, tools, "event"), /unknown tool/);
  assert.throws(() => parseBody({ tool: "pdf/compress", kind: "click" }, tools, "event"), /unknown kind/);
  assert.throws(() => parseBody("nope", tools, "event"), /bad body/);
});

test("visits carry only a referrer name and a device type, cleaned, and no tool", () => {
  assert.deepEqual(parseBody({ ref: "www.google.no", device: "phone", tool: "pdf/compress" }, tools, "visit"), { ref: "Google", device: "phone" });
  assert.deepEqual(parseBody({ device: "fridge" }, tools, "visit"), { ref: "Direct", device: null });
  assert.deepEqual(parseBody({ ref: "example.org/a?b" }, tools, "visit"), { ref: null, device: null });
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
