// Video to GIF: choosing frames, sizing the picture and estimating the file. No page code here.

export const WIDTHS = [320, 480, 640];
export const FPS = [5, 10, 15];
/** Longest clip we turn into a GIF, in seconds. Longer clips make files too big to be useful. */
export const MAX_SECONDS = 30;
/** Shortest clip: anything shorter is barely a GIF. */
export const MIN_SECONDS = 1;
/** When the end is not after the start, the clip runs this long from the start. */
export const DEFAULT_SECONDS = 2;
/** Above this many bytes the page warns that the GIF will be large. */
export const LARGE_BYTES = 10 * 1024 * 1024;
/** A GIF stores each frame as a picture. About this many bytes per pixel per frame for video. */
const BYTES_PER_PIXEL = 0.3;

const nearest = (list, v, fallback) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return list.reduce((best, x) => (Math.abs(x - n) < Math.abs(best - n) ? x : best), list[0]);
};

/**
 * Turn what the person typed into safe values: both times inside the video, the end after the
 * start, the clip between MIN_SECONDS and MAX_SECONDS long, and width and frame rate from the
 * choices. `changed` says what was corrected, so the page can tell the person:
 * "order" (the end was not after the start), "short" (shorter than MIN_SECONDS), "long" (over
 * MAX_SECONDS), or null.
 */
export function clampOptions({ start = 0, end, duration, width = 480, fps = 10, loop = true, maxSeconds = MAX_SECONDS } = {}) {
  const dur = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const cap = (x) => (dur ? Math.min(x, dur) : x);
  let changed = null;
  let s = Number(start);
  if (!Number.isFinite(s) || s < 0) s = 0;
  if (dur) s = Math.min(s, Math.max(0, dur - 0.1));
  let e = Number(end);
  if (!Number.isFinite(e)) e = cap(s + maxSeconds); // no end given: as much as allowed
  e = cap(e);
  if (e <= s) { e = cap(s + DEFAULT_SECONDS); changed = "order"; }
  if (e - s > maxSeconds) { e = s + maxSeconds; changed = "long"; }
  if (e - s < MIN_SECONDS) {
    if (dur && dur <= MIN_SECONDS) { s = 0; e = dur; }
    else { e = cap(s + MIN_SECONDS); if (e - s < MIN_SECONDS) s = Math.max(0, e - MIN_SECONDS); }
    changed = changed ?? "short";
  }
  const round = (x) => Math.round(x * 100) / 100;
  return { start: round(s), end: round(e), width: nearest(WIDTHS, width, 480), fps: nearest(FPS, fps, 10), loop: Boolean(loop), changed };
}

/** What to tell the person when their times were corrected. */
export function rangeNote(changed, { start, end }) {
  const len = Math.round((end - start) * 10) / 10;
  if (changed === "order") return `The end was before the start, so the clip now runs ${len} seconds, from ${start} to ${end}.`;
  if (changed === "short") return `A GIF needs at least ${MIN_SECONDS} second, so the clip now runs from ${start} to ${end}.`;
  if (changed === "long") return `A GIF can be at most ${MAX_SECONDS} seconds, so the clip now ends at ${end}.`;
  return "";
}

/** The moments (in seconds) to take a picture of: one every 1/fps from the start, none past the end. */
export function frameTimes({ start, end, fps }) {
  const count = Math.max(1, Math.floor((end - start) * fps + 1e-9));
  return Array.from({ length: count }, (_, i) => Math.round((start + i / fps) * 1000) / 1000);
}

/** Output size: the chosen width, with the height that keeps the video's shape. */
export function outputSize(videoWidth, videoHeight, width) {
  if (!videoWidth || !videoHeight) return { width, height: Math.round((width * 9) / 16) };
  return { width, height: Math.max(1, Math.round((width * videoHeight) / videoWidth)) };
}

/** A rough size of the GIF in bytes. Real files vary a lot with the picture. */
export function estimateBytes({ frames, width, height }) {
  return Math.round(frames * width * height * BYTES_PER_PIXEL);
}

/** True when the GIF will probably be large. */
export const isLarge = (bytes) => bytes >= LARGE_BYTES;

/** File name for the GIF: "holiday.mp4" -> "holiday.gif". */
export function gifName(name) {
  const base = String(name || "video").replace(/\.[^.]+$/, "");
  return `${base || "video"}.gif`;
}

/** GIF delay for one frame, in milliseconds. */
export const frameDelay = (fps) => Math.round(1000 / fps);
