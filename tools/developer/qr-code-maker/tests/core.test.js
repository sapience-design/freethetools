import test from "node:test";
import assert from "node:assert/strict";
import { makeQr, wifiPayload } from "../core.js";

test("makes an SVG with a quiet zone", () => {
  const { svg, modules } = makeQr("https://freethetools.com");
  assert.match(svg, /^<svg[^>]+viewBox="0 0 (\d+) \1"/);
  assert.equal(+svg.match(/viewBox="0 0 (\d+)/)[1], modules + 8);
  assert.ok(svg.includes("<path d=\"M"));
});

test("higher error correction needs more modules", () => {
  const text = "https://freethetools.com/pdf/compress/";
  assert.ok(makeQr(text, { level: "H" }).modules >= makeQr(text, { level: "L" }).modules);
});

test("encodes non-English text as UTF-8 without failing", () => {
  assert.ok(makeQr("Blåbærsyltetøy 👍").modules > 0);
});

test("Wi-Fi payloads escape special characters", () => {
  assert.equal(wifiPayload({ ssid: "Home;Net", password: 'p"w', security: "WPA" }), 'WIFI:T:WPA;S:Home\\;Net;P:p\\"w;;');
  assert.equal(wifiPayload({ ssid: "Cafe" }), "WIFI:T:nopass;S:Cafe;;");
});

test("explains empty and oversized input", () => {
  assert.throws(() => makeQr(""), /Enter something/);
  assert.throws(() => makeQr("x".repeat(4000), { level: "H" }), /too long/);
});
