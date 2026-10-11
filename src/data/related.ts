// "Related tools": the next step after each tool. Used by a tool page when its tool.json has no
// `related` field of its own. Ids are "group/slug"; the build stops if one is not a live tool.
// Anything missing is topped up from the same section, then the same group (see relatedFor in
// catalogue.ts), so every tool gets at least three. Keep this list short and obvious.
export const NEXT_STEP: Record<string, string[]> = {
  "pdf/compress": ["pdf/merge", "pdf/split"],
  "pdf/merge": ["pdf/compress", "pdf/split"],
  "pdf/split": ["pdf/merge", "pdf/compress"],
  "pdf/images-to-pdf": ["pdf/compress", "pdf/merge"],
  "pdf/to-images": ["images/compress", "pdf/split"],
  "pdf/unlock": ["pdf/compress", "pdf/merge"],
  "pdf/rotate": ["pdf/merge", "pdf/split"],
  "pdf/fill-form": ["pdf/compress", "pdf/merge"],
  "images/compress": ["images/resize", "images/convert"],
  "images/resize": ["images/compress", "images/convert"],
  "images/convert": ["images/compress", "images/resize"],
  "images/heic-to-jpg": ["images/compress", "images/resize"],
  "images/video-to-gif": ["images/compress"],
  "images/remove-location": ["images/compress", "images/resize"],
  "data/csv-to-json": ["data/json-formatter"],
  "data/json-formatter": ["data/csv-to-json"],
  "developer/base64": ["developer/url-encode"],
  "developer/url-encode": ["developer/base64"],
  "developer/hash-generator": ["developer/password-generator"],
  "developer/password-generator": ["developer/hash-generator"],
  "everyday/time-zone-converter": ["everyday/unix-timestamp"],
  "everyday/unix-timestamp": ["everyday/time-zone-converter"],
  "everyday/unit-converter": ["everyday/colour-converter"],
  "everyday/colour-converter": ["everyday/unit-converter"],
};
