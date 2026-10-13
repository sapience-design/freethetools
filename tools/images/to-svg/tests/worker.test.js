// Runs the real worker.js and the real tracer in a plain context, as a browser worker would,
// and checks what comes back.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import { traceOptions, isSafeSvg } from "../core.js";

const require = createRequire(import.meta.url);
const tracerSource = readFileSync(require.resolve("imagetracerjs/imagetracer_v1.2.6.js"), "utf8");
const workerSource = readFileSync(new URL("../worker.js", import.meta.url), "utf8");

/** Start the worker in a fresh context; `send` posts it a message and returns its reply. */
function startWorker({ breakTracer = false } = {}) {
  const replies = [];
  const self = { postMessage: (m) => replies.push(m) };
  const context = vm.createContext({
    self,
    Uint8ClampedArray,
    String,
    importScripts: (url) => {
      assert.equal(url, "/images/to-svg/vendor/imagetracer.js");
      if (breakTracer) throw new Error("network error");
      vm.runInContext(tracerSource, context);
    },
  });
  vm.runInContext(workerSource, context);
  return (message) => { self.onmessage({ data: message }); return replies.at(-1); };
}

/** RGBA pixels, `w` x `h`, from a function of (x, y) returning [r, g, b, a]. */
function picture(w, h, colour) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set(colour(x, y), (y * w + x) * 4);
  return data.buffer;
}
const RED = [220, 30, 30, 255], BLUE = [30, 30, 220, 255], NONE = [0, 0, 0, 0];

test("two colour areas become two colours of shapes, and the file is safe", () => {
  const send = startWorker();
  const buffer = picture(80, 40, (x) => (x < 40 ? RED : BLUE));
  const r = send({ id: 1, width: 80, height: 40, buffer, options: traceOptions({ preset: "logo" }), outWidth: 800, outHeight: 400 });
  assert.equal(r.ok, true);
  assert.equal(r.id, 1);
  assert.equal(r.colours, 2);
  assert.ok(r.svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400" viewBox="0 0 80 40">'));
  assert.ok(r.svg.includes("<path "));
  assert.ok(isSafeSvg(r.svg));
  assert.ok(!/<script|href|desc=/.test(r.svg));
});

test("a see-through background stays see-through", () => {
  const send = startWorker();
  const buffer = picture(60, 60, (x, y) => (x > 15 && x < 45 && y > 15 && y < 45 ? RED : NONE));
  const r = send({ id: 2, width: 60, height: 60, buffer, options: traceOptions({ preset: "logo" }), outWidth: 60, outHeight: 60 });
  assert.equal(r.ok, true);
  assert.equal(r.colours, 1);
  assert.ok(isSafeSvg(r.svg));
});

test("black and white uses only black and white", () => {
  const send = startWorker();
  const buffer = picture(60, 60, (x, y) => (x + y < 60 ? [250, 250, 250, 255] : [20, 20, 20, 255]));
  const r = send({ id: 3, width: 60, height: 60, buffer, options: traceOptions({ preset: "bw" }), outWidth: 60, outHeight: 60 });
  assert.equal(r.ok, true);
  assert.deepEqual([...new Set(r.svg.match(/fill="[^"]+"/g))].sort(), ['fill="rgb(0,0,0)"', 'fill="rgb(255,255,255)"']);
  assert.ok(isSafeSvg(r.svg));
});

test("a bad request answers with an error, not a crash", () => {
  const send = startWorker();
  const r = send({ id: 4, width: 10, height: 10, buffer: new ArrayBuffer(4), options: traceOptions(), outWidth: 10, outHeight: 10 });
  assert.equal(r.ok, false);
  assert.equal(r.id, 4);
});

test("a tracer that did not load is reported as a load failure", () => {
  const send = startWorker({ breakTracer: true });
  const r = send({ id: 5, width: 1, height: 1, buffer: new ArrayBuffer(4), options: traceOptions(), outWidth: 1, outHeight: 1 });
  assert.deepEqual([r.ok, r.load], [false, true]);
});
