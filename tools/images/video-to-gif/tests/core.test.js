import test from "node:test";
import assert from "node:assert/strict";
import { clampOptions, frameTimes, outputSize, estimateBytes, isLarge, gifName, frameDelay, MAX_SECONDS, LARGE_BYTES } from "../core.js";

test("frame times run from the start, one per 1/fps, and stay before the end", () => {
  assert.deepEqual(frameTimes({ start: 0, end: 1, fps: 5 }), [0, 0.2, 0.4, 0.6, 0.8]);
  assert.deepEqual(frameTimes({ start: 2, end: 2.5, fps: 10 }), [2, 2.1, 2.2, 2.3, 2.4]);
  assert.equal(frameTimes({ start: 0, end: 4, fps: 15 }).length, 60);
});

test("a very short clip still gives one frame", () => {
  assert.deepEqual(frameTimes({ start: 1, end: 1.05, fps: 5 }), [1]);
});

test("clamping keeps the end after the start and inside the video", () => {
  assert.deepEqual(clampOptions({ start: 3, end: 1, duration: 10, width: 480, fps: 10 }), { start: 3, end: 3.1, width: 480, fps: 10, loop: true });
  const c = clampOptions({ start: -5, end: 99, duration: 8 });
  assert.equal(c.start, 0);
  assert.equal(c.end, 8);
});

test("clamping limits the clip length", () => {
  const c = clampOptions({ start: 0, end: 500, duration: 600 });
  assert.equal(c.end - c.start, MAX_SECONDS);
});

test("clamping picks the nearest allowed width and frame rate", () => {
  const c = clampOptions({ start: 0, end: 2, duration: 5, width: 500, fps: 12 });
  assert.equal(c.width, 480);
  assert.equal(c.fps, 10);
  assert.equal(clampOptions({ width: "x", fps: null, duration: 5 }).width, 480);
});

test("clamping fills in an empty end and keeps the loop choice", () => {
  const c = clampOptions({ duration: 4, loop: false });
  assert.equal(c.start, 0);
  assert.equal(c.end, 4);
  assert.equal(c.loop, false);
});

test("output size keeps the shape of the video", () => {
  assert.deepEqual(outputSize(1920, 1080, 480), { width: 480, height: 270 });
  assert.deepEqual(outputSize(1080, 1920, 320), { width: 320, height: 569 });
  assert.deepEqual(outputSize(0, 0, 320), { width: 320, height: 180 });
});

test("the estimate grows with frames and size, and big ones are flagged", () => {
  const small = estimateBytes({ frames: 20, width: 320, height: 180 });
  const big = estimateBytes({ frames: 450, width: 640, height: 360 });
  assert.ok(big > small * 20);
  assert.equal(isLarge(small), false);
  assert.equal(isLarge(big), true);
  assert.equal(isLarge(LARGE_BYTES), true);
});

test("file name and delay", () => {
  assert.equal(gifName("holiday.final.mp4"), "holiday.final.gif");
  assert.equal(gifName(""), "video.gif");
  assert.equal(frameDelay(10), 100);
  assert.equal(frameDelay(15), 67);
});
