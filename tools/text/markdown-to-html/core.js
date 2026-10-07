// Markdown to HTML and back. marked (MIT) writes the HTML, Turndown (MIT) reads it,
// DOMPurify (MPL-2.0 or Apache-2.0) cleans it. None of them uses eval or new Function,
// which the site's Content Security Policy would block. The File Converter reuses this file.
import { marked } from "marked";
import TurndownService from "turndown";
import DOMPurify from "dompurify";

export const EXAMPLE_MARKDOWN = `# Free the Tools

Write **Markdown** on the left. The *HTML* appears on the right, and nothing is uploaded.

- Lists, [links](https://freethetools.com) and \`code\`
- Tables and ~~strikethrough~~

| Tool | Group |
|---|---|
| Markdown to HTML | Text |
| CSV to JSON | Data |

> Quotes work too.
`;

/** The DOMPurify to use: the one given (tests pass one built on jsdom), else the browser's. */
function purifier(purify) {
  const p = purify ?? DOMPurify;
  if (typeof p?.sanitize !== "function") throw new Error("This browser can't clean HTML. Turn off the clean option or try another browser.");
  return p;
}

const MEDIA = new Set(["VIDEO", "AUDIO", "SOURCE", "TRACK"]);
/** An address on another site. Backslashes count as slashes, as browsers read them. */
const isRemote = (url) => /^(https?:)?\/\//i.test((url || "").trim().replace(/\\/g, "/"));
const remoteSrcset = (set) => !!set && set.split(",").some((c) => isRemote(c.trim().split(/\s+/)[0]));

const hooked = new WeakSet();
let previewMode = false;
function install(p) {
  if (hooked.has(p)) return;
  hooked.add(p);
  p.addHook("afterSanitizeAttributes", (node) => {
    if (!previewMode || !node.tagName) return;
    // Preview only: never load media from other sites, and open links in a new tab.
    // The page's Content Security Policy blocks these requests too; this is a second layer.
    const tag = node.tagName;
    if (tag === "IMG") {
      if (isRemote(node.getAttribute("src")) || remoteSrcset(node.getAttribute("srcset"))) {
        const alt = node.getAttribute("alt") || "image";
        node.replaceWith(node.ownerDocument.createTextNode(`[${alt}]`));
      } else node.removeAttribute("srcset");
    } else if (MEDIA.has(tag)) {
      for (const a of ["src", "poster"]) if (isRemote(node.getAttribute(a))) node.removeAttribute(a);
      if (remoteSrcset(node.getAttribute("srcset"))) node.removeAttribute("srcset");
    } else if (node.tagName === "A" && node.hasAttribute("href")) {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer");
    }
  });
}

/**
 * Remove scripts, event handlers and other unsafe markup.
 * @param {string} html
 * @param {{ purify?: any, preview?: boolean }} [opts] preview: also block images from other sites
 */
export function sanitizeHtml(html, opts = {}) {
  const p = purifier(opts.purify);
  install(p);
  previewMode = !!opts.preview;
  try {
    // The preview has no use for forms or fields.
    const forbid = opts.preview ? { FORBID_TAGS: ["form", "input", "textarea", "select", "button"] } : {};
    return p.sanitize(html, { USE_PROFILES: { html: true }, ...forbid });
  } finally {
    previewMode = false;
  }
}

/**
 * @param {string} md
 * @param {{ sanitize?: boolean, purify?: any }} [opts] sanitize defaults to true
 * @returns {string}
 */
export function markdownToHtml(md, opts = {}) {
  if (typeof md !== "string" || !md.trim()) throw new Error("Type or paste some Markdown, or open a .md file.");
  const html = marked.parse(md, { gfm: true, async: false });
  return opts.sanitize === false ? html : sanitizeHtml(html, opts);
}

const cell = (el) => el.textContent.replace(/\s+/g, " ").replace(/\|/g, "\\|").trim();

function turndownService() {
  const td = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced", bulletListMarker: "-", emDelimiter: "*" });
  td.remove(["script", "style", "noscript", "template", "head", "title"]);
  td.addRule("strike", { filter: ["del", "s", "strike"], replacement: (c) => `~~${c}~~` });
  td.addRule("table", {
    filter: "table",
    replacement: (_c, node) => {
      const rows = Array.from(node.querySelectorAll("tr")).map((tr) => Array.from(tr.children).map(cell));
      if (!rows.length) return "";
      const width = Math.max(...rows.map((r) => r.length));
      const line = (r) => `| ${Array.from({ length: width }, (_, i) => r[i] ?? "").join(" | ")} |`;
      const rule = `| ${Array.from({ length: width }, () => "---").join(" | ")} |`;
      return `\n\n${[line(rows[0]), rule, ...rows.slice(1).map(line)].join("\n")}\n\n`;
    },
  });
  // Rows and cells are written by the table rule, so skip their own output.
  td.addRule("tablePart", { filter: ["thead", "tbody", "tfoot", "tr", "th", "td", "caption"], replacement: () => "" });
  return td;
}

/** @param {string} html @returns {string} */
export function htmlToMarkdown(html) {
  if (typeof html !== "string" || !html.trim()) throw new Error("Type or paste some HTML, or open an .html file.");
  return turndownService().turndown(html).trim() + "\n";
}

const BLOCKS = new Set(["P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "UL", "OL", "PRE", "BLOCKQUOTE", "TABLE", "HR", "SECTION", "ARTICLE", "HEADER", "FOOTER", "FIGURE", "DL"]);
const LINES = new Set(["LI", "TR", "DT", "DD"]);
const SKIP = new Set(["SCRIPT", "STYLE", "TEMPLATE", "HEAD", "NOSCRIPT"]);

/**
 * Plain text from HTML: no tags, lists as "- ", cells separated by tabs.
 * Needs DOMParser, which every browser has.
 * @param {string} html
 */
export function htmlToText(html) {
  if (typeof html !== "string" || !html.trim()) throw new Error("Type or paste some HTML, or open an .html file.");
  const Parser = globalThis.DOMParser;
  if (!Parser) throw new Error("This browser can't read HTML here.");
  const doc = new Parser().parseFromString(html, "text/html");
  let out = "";
  const walk = (node, pre) => {
    if (node.nodeType === 3) {
      const t = pre ? node.nodeValue : node.nodeValue.replace(/\s+/g, " ");
      if (!pre && t === " " && (!out || out.endsWith("\n"))) return; // spacing between tags
      out += t;
      return;
    }
    if (node.nodeType !== 1 || SKIP.has(node.tagName)) return;
    const tag = node.tagName;
    if (tag === "BR") { out += "\n"; return; }
    const block = BLOCKS.has(tag);
    if (block) out += "\n\n";
    else if (LINES.has(tag) && out && !out.endsWith("\n")) out += "\n";
    if (tag === "LI") out += node.parentElement?.tagName === "OL" ? `${Array.from(node.parentElement.children).indexOf(node) + 1}. ` : "- ";
    if (tag === "IMG") out += node.getAttribute("alt") || "";
    Array.from(node.childNodes).forEach((c, i, all) => {
      walk(c, pre || tag === "PRE");
      if ((tag === "TR") && i < all.length - 1 && c.nodeType === 1) out += "\t";
    });
    out += block ? "\n\n" : LINES.has(tag) ? "\n" : "";
  };
  walk(doc.body, false);
  return out.replace(/[ \t]+\n/g, "\n").replace(/\n[ \t]+/g, "\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

/** Plain text from Markdown: render it, then strip the tags. */
export function markdownToText(md) {
  return htmlToText(markdownToHtml(md, { sanitize: false }));
}
