# Markdown to HTML

Converts Markdown to HTML and HTML to Markdown in the browser, with a live preview. The File Converter reuses `core.js`.

## Files

| File | What it is |
|---|---|
| `tool.json` | Name, search text, specs and questions. The page is built from it. |
| `Tool.astro` | The working area of the page |
| `core.js` | The logic: `markdownToHtml`, `htmlToMarkdown`, `sanitizeHtml`, `htmlToText`, `markdownToText` |
| `tests/` | Tests for `core.js`, run with `npm test` (they use jsdom to give DOMPurify a DOM) |

## Notes for reviewers

- Libraries are bundled by Vite from normal imports, not vendored: marked (MIT), Turndown (MIT), DOMPurify (MPL-2.0 OR Apache-2.0). None uses `eval` or `new Function`, which the Content Security Policy blocks.
- The preview is always sanitised. A DOMPurify hook replaces images from other origins with their alt text, so the preview never makes a request.
- jsdom is a dev dependency, used only by the tests.
