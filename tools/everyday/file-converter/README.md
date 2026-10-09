# File Converter

A front door for conversions. Drop files; each gets a row with its detected type, a list of what it can become, and a download. Specialised tools are linked where they do the job better.

## Files

| File | What it is |
|---|---|
| `tool.json` | Name, search text, specs and questions. The page is built from it. |
| `Tool.astro` | The drop area and one row per file. Canvas and audio decoding live here. |
| `core.js` | Type detection (magic bytes, then extension), output lists, BMP, ICO and WAV encoders, CSV/TSV/JSON and document conversion |
| `tests/` | Tests for `core.js`, run with `npm test` |

## Notes for reviewers

- No new dependencies. It reuses `tools/data/csv-to-json/core.js` (Papa Parse) and `tools/text/markdown-to-html/core.js` (marked, Turndown, DOMPurify). `csvToJson` gained an optional `delimiter` for TSV.
- Images are decoded with `createImageBitmap` through `src/lib/images.ts`, with an `<img>` fallback for formats it rejects (SVG, sometimes ICO). Encoding uses canvas for PNG, JPEG and WebP, and `core.js` for BMP (24-bit, flattened on white) and ICO (PNG-compressed entries).
- Audio is decoded with `OfflineAudioContext.decodeAudioData`, which resamples to 44.1 kHz.
- Adding a format: add its signature to `detectType`, its outputs to `OUTPUTS`, and the conversion to `convertFile` in `Tool.astro`.
