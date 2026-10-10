// Links to other sites open in a new tab, with a spoken note (src/lib/external-links.js).
import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { NEW_TAB, isExternal, markExternalLinks } from "../src/lib/external-links.js";

const ORIGIN = "https://freethetools.com";
const page = (html) => new JSDOM(`<body>${html}</body>`, { url: `${ORIGIN}/` }).window.document;

test("only http(s) links to other sites count as external", () => {
  const doc = page(`<a id="gh" href="https://github.com/x">GitHub</a><a id="in" href="/about/">About</a>
    <a id="abs" href="https://freethetools.com/stats/">Stats</a><a id="mail" href="mailto:hello@freethetools.com">Mail</a>
    <a id="dl" href="https://example.com/a.pdf" download>File</a><a id="blob" href="blob:https://freethetools.com/1">Blob</a>`);
  const ext = (id) => isExternal(doc.getElementById(id), ORIGIN);
  assert.deepEqual(["gh", "in", "abs", "mail", "dl", "blob"].map(ext), [true, false, false, false, false, false]);
});

test("an outside link opens in a new tab and says so, once", () => {
  const doc = page(`<a id="t" href="https://ko-fi.com/freethetools" rel="me">Tip on Ko-fi</a>`);
  markExternalLinks(doc.body, ORIGIN);
  markExternalLinks(doc.body, ORIGIN);
  const a = doc.getElementById("t");
  assert.equal(a.target, "_blank");
  assert.deepEqual(a.rel.split(" ").sort(), ["me", "noopener"]);
  assert.equal(a.textContent, "Tip on Ko-fi" + NEW_TAB);
  assert.equal(a.querySelectorAll(".sr-only").length, 1);
});

test("a link named by aria-label gets the note in its label", () => {
  const doc = page(`<a id="gh" href="https://github.com/x" aria-label="Source code on GitHub"><svg></svg></a>`);
  markExternalLinks(doc.body, ORIGIN);
  const a = doc.getElementById("gh");
  assert.equal(a.getAttribute("aria-label"), "Source code on GitHub" + NEW_TAB);
  assert.equal(a.querySelector(".sr-only"), null);
});

test("inside links are left alone", () => {
  const doc = page(`<a id="a" href="/about/">About</a>`);
  markExternalLinks(doc.body, ORIGIN);
  const a = doc.getElementById("a");
  assert.equal(a.hasAttribute("target"), false);
  assert.equal(a.textContent, "About");
});
