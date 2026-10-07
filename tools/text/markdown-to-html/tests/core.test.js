import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import createDOMPurify from "dompurify";
import { markdownToHtml, htmlToMarkdown, htmlToText, markdownToText, sanitizeHtml, EXAMPLE_MARKDOWN } from "../core.js";

// DOMPurify and DOMParser need a DOM; Node has none, so give them jsdom's.
const { window } = new JSDOM("");
globalThis.DOMParser = window.DOMParser;
const purify = createDOMPurify(window);

test("renders headings, emphasis, links, lists and tables", () => {
  const html = markdownToHtml(EXAMPLE_MARKDOWN, { purify });
  assert.match(html, /<h1>Free the Tools<\/h1>/);
  assert.match(html, /<strong>Markdown<\/strong>/);
  assert.match(html, /<a href="https:\/\/freethetools.com">links<\/a>/);
  assert.match(html, /<li>Lists/);
  assert.match(html, /<table>/);
  assert.match(html, /<del>strikethrough<\/del>/);
});

test("removes scripts, event handlers and javascript: links when cleaning", () => {
  const html = markdownToHtml('Hi <script>alert(1)</script> <img src="x" onerror="alert(2)"> [bad](javascript:alert(3))', { purify });
  assert.doesNotMatch(html, /script|onerror|javascript:/i);
});

test("keeps the HTML as written when cleaning is off", () => {
  assert.match(markdownToHtml("<b onclick=\"x()\">hi</b>", { sanitize: false }), /onclick/);
});

test("preview blocks images from other sites and opens links in a new tab", () => {
  const html = sanitizeHtml('<img src="https://example.com/a.png" alt="Logo"><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="dot"><a href="https://a.b">x</a>', { purify, preview: true });
  assert.doesNotMatch(html, /example\.com/);
  assert.match(html, /\[Logo\]/);
  assert.match(html, /data:image\/gif/);
  assert.match(html, /target="_blank"/);
  assert.match(html, /noopener/);
  assert.doesNotMatch(sanitizeHtml('<a href="https://a.b">x</a>', { purify }), /target=/);
});

test("HTML to Markdown", () => {
  const md = htmlToMarkdown("<h2>Title</h2><p>Some <strong>bold</strong> and <em>italic</em> with a <a href=\"https://x.org\">link</a>.</p><ul><li>one</li><li>two</li></ul><pre><code>a = 1</code></pre><p><del>gone</del></p>");
  assert.match(md, /^## Title/);
  assert.match(md, /\*\*bold\*\*/);
  assert.match(md, /\*italic\*/);
  assert.match(md, /\[link\]\(https:\/\/x\.org\)/);
  assert.match(md, /^-\s+one/m);
  assert.match(md, /```\na = 1\n```/);
  assert.match(md, /~~gone~~/);
});

test("HTML tables become Markdown tables", () => {
  const md = htmlToMarkdown("<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2|3</td></tr></table>");
  assert.equal(md.trim(), "| A | B |\n| --- | --- |\n| 1 | 2\\|3 |");
});

test("Markdown survives a round trip", () => {
  const md = "# Hello\n\nSome **bold** text.\n\n- a\n- b\n\n1. x\n2. y\n";
  const back = htmlToMarkdown(markdownToHtml(md, { purify }));
  assert.match(back, /^# Hello/);
  assert.match(back, /\*\*bold\*\*/);
  assert.match(back, /^-\s+a$/m);
  assert.match(back, /^1\.\s+x$/m);
  const table = htmlToMarkdown(markdownToHtml("| A | B |\n|---|---|\n| 1 | 2 |", { purify }));
  assert.equal(table.trim(), "| A | B |\n| --- | --- |\n| 1 | 2 |");
});

test("plain text drops tags and keeps lists and paragraphs", () => {
  const t = htmlToText("<h1>Title</h1><p>One <b>two</b></p><ul><li>a</li><li>b</li></ul><script>x()</script>");
  assert.equal(t, "Title\n\nOne two\n\n- a\n- b\n");
  assert.equal(markdownToText("# Hi\n\n**there** you"), "Hi\n\nthere you\n");
  assert.equal(markdownToText("# T\n\n- a\n- b\n\n1. x\n2. y"), "T\n\n- a\n- b\n\n1. x\n2. y\n");
});

test("empty input says what to do", () => {
  assert.throws(() => markdownToHtml("  "), /Markdown/);
  assert.throws(() => htmlToMarkdown(""), /HTML/);
});

test("HTML to Markdown drops script, style, noscript, template and head contents", () => {
  assert.equal(htmlToMarkdown("<script>alert(1)</script><p>x</p>"), "x\n");
  const md = htmlToMarkdown("<head><title>T</title><style>p{color:red}</style></head><noscript>no js</noscript><template><b>tpl</b></template><p>x</p>");
  assert.equal(md, "x\n");
});

test("HTML to Markdown escapes a pipe inside a table cell", () => {
  const md = htmlToMarkdown("<table><tr><th>a|b</th><th>c</th></tr><tr><td>1|2</td><td>3</td></tr></table>");
  assert.equal(md, "| a\\|b | c |\n| --- | --- |\n| 1\\|2 | 3 |\n");
});

test("the preview blocks remote srcset, video, audio, source, track, poster and backslash URLs", () => {
  const html = [
    '<img src="/ok.png" srcset="https://evil.test/a.png 2x">',
    '<img src="\\\\evil.test/x.png" alt="slash">',
    '<video src="https://evil.test/v.mp4" poster="//evil.test/p.png"><source src="http://evil.test/v.webm"><track src="\\\\evil.test/t.vtt"></video>',
    '<audio src="https://evil.test/a.mp3"></audio>',
    '<form action="/x"><input name="q"><button>go</button></form>',
  ].join("");
  const out = sanitizeHtml(html, { purify, preview: true });
  assert.doesNotMatch(out, /evil\.test|<form|<input|<button/i);
  assert.match(out, /\[slash\]/);
  // Outside the preview nothing is rewritten.
  assert.match(sanitizeHtml('<video src="https://evil.test/v.mp4"></video>', { purify }), /evil\.test/);
  // Local images survive.
  assert.match(sanitizeHtml('<img src="/ok.png" alt="a">', { purify, preview: true }), /src="\/ok\.png"/);
});
