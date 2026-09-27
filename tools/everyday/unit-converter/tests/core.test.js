import test from "node:test";
import assert from "node:assert/strict";
import { convert, pretty } from "../core.js";

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${a} vs ${b}`);

test("exact length and weight definitions", () => {
  near(convert(1, "length", "in", "cm"), 2.54);
  near(convert(1, "length", "mi", "km"), 1.609344);
  near(convert(1, "weight", "lb", "kg"), 0.45359237);
  near(convert(14, "weight", "lb", "st"), 1);
});

test("temperature uses formulas, not factors", () => {
  near(convert(100, "temperature", "C", "F"), 212);
  near(convert(-40, "temperature", "F", "C"), -40);
  near(convert(0, "temperature", "K", "C"), -273.15);
  assert.throws(() => convert(-300, "temperature", "C", "K"), /absolute zero/);
});

test("data sizes separate decimal and binary units", () => {
  near(convert(1, "data", "GiB", "GB"), 1.073741824);
  near(convert(1, "speed", "kn", "km/h"), 1.852);
});

test("rejects mismatched units and non-numbers", () => {
  assert.throws(() => convert(1, "length", "m", "kg"), /same group/);
  assert.throws(() => convert(NaN, "length", "m", "km"), /Enter a number/);
});

test("pretty-prints without float noise", () => {
  assert.equal(pretty(0.1 + 0.2), "0.3");
  assert.equal(pretty(1e-9), "1.000000e-9");
});
