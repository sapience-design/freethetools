# Image to SVG

Traces a picture (PNG, JPG, WebP, GIF or BMP) into coloured SVG shapes, in the browser. It suits logos, icons and drawings. Photos come out posterised.

## Files

| File | What it is |
|---|---|
| `tool.json` | Name, search text, specs and questions. The page is built from it. |
| `Tool.astro` | The working area of the page |
| `core.js` | The presets, the size limit and the check that an SVG holds only shapes |
| `worker.js` | Runs the tracer off the main thread and builds the SVG text |
| `tests/` | Tests for `core.js` and `worker.js`, run with `npm test` |

## Notes for reviewers

- The engine is [imagetracerjs](https://github.com/jankovicsandras/imagetracerjs) 1.2.6 (Unlicense). It is one 47 KB file with no `eval` and no `new Function`. It is listed under `vendor` in `tool.json` and served from this site, so `worker.js` loads it with `importScripts`, the same way Compress PDF loads its engine.
- Pictures are shrunk to 1200 px on the long side before tracing.
- The SVG is written from the tracer's numbers and colours only. `isSafeSvg` in `core.js` checks every file before it is offered for download.
