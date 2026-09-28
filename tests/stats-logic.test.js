import test from "node:test";
import assert from "node:assert/strict";
import { dayKey, parseBody, sameOrigin, summarize } from "../worker/logic.js";

const tools = new Set(["pdf/compress", "text/word-counter"]);

test("accepts only known tools and kinds", () => {
  assert.deepEqual(parseBody({ tool: "pdf/compress", kind: "use" }, tools, "event"), { tool: "pdf/compress", kind: "use" });
  assert.throws(() => parseBody({ tool: "evil/tool", kind: "use" }, tools, "event"), /unknown tool/);
  assert.throws(() => parseBody({ tool: "pdf/compress", kind: "click" }, tools, "event"), /unknown kind/);
  assert.throws(() => parseBody("nope", tools, "event"), /bad body/);
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

test("summary never shows negative likes", () => {
  const s = summarize([{ tool: "pdf/compress", views: 10, uses: 4, likes: -1, uses30: 2 }]);
  assert.deepEqual(s.tools["pdf/compress"], { views: 10, uses: 4, likes: 0, uses30: 2 });
});

test("day keys are UTC dates", () => {
  assert.equal(dayKey(new Date("2026-09-28T23:30:00-05:00")), "2026-09-29");
});
