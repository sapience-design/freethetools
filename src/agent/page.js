// The browser side of ADR 0008, started by every tool page:
//   1. keeps a list of the files the person added to this page;
//   2. records the person's own jobs in the library, with no help from the tool: it watches for
//      download links and keeps the Blob behind each;
//   3. when the browser has WebMCP (document.modelContext), registers the tool's agent
//      definitions so an AI agent can call them, shows each call in the activity panel, and
//      records it in the library.
// Nothing here is sent anywhere. Agent calls are not counted in the anonymous stats.
import { checkArgs, detectType, settingsOf, wireSchema } from "./contract.js";
import { factsOf, libraryEntry } from "./library.js";
import { saveEntry } from "./db.js";
import { blobsByUrl, installBlobCapture, plainUrl } from "./blob-capture.js";
import { fileKey, groupBursts, resolveArgs, snapshotSettings, successText, wireFile } from "./page-helpers.js";

installBlobCapture();

// One lazy loader per agent.js. Only the current tool's is ever called, so other pages download none.
const agentModules = import.meta.glob("../../tools/*/*/agent.js");

const MAX_FILES = 50;

/** @param {HTMLElement} work the #tool-work element @param {string} toolId e.g. "pdf/merge" */
export function startAgentPage(work, toolId) {
  const title =
    document.querySelector("[data-save]")?.dataset.name || document.querySelector("main h1")?.textContent?.trim() || toolId;

  // ---- 1. Files the person added -------------------------------------------------------------
  /** @type {{ name: string, size: number, type: string, lastModified: number, file: File }[]} */
  const added = [];
  const remember = (list) => {
    for (const f of list ?? []) {
      if (!(f instanceof File) || added.some((a) => fileKey(a.file) === fileKey(f))) continue;
      added.push({ name: f.name, size: f.size, type: f.type, lastModified: f.lastModified, file: f });
      if (added.length > MAX_FILES) added.shift();
    }
  };
  // Capture phase on the work area: runs before the tool's own handlers, which may clear the input.
  work.addEventListener("change", (e) => {
    const t = e.target;
    if (t instanceof HTMLInputElement && t.type === "file") remember(t.files ? [...t.files] : []);
  }, true);
  work.addEventListener("drop", (e) => remember(e.dataTransfer?.files ? [...e.dataTransfer.files] : []), true);

  // ---- 2. The person's own jobs --------------------------------------------------------------
  const controlsOf = () => {
    const out = [];
    for (const el of work.querySelectorAll("input, select")) {
      const type = el instanceof HTMLSelectElement ? "select" : el.type;
      if (["file", "password", "hidden", "button", "submit", "reset", "image"].includes(type)) continue;
      const label = labelOf(el);
      if (type === "select") out.push({ type, label, value: el.selectedOptions[0]?.textContent ?? "" });
      else if (type === "radio") out.push({ type, label, group: groupOf(el), checked: el.checked });
      else if (type === "checkbox") out.push({ type, label, checked: el.checked });
      else out.push({ type, label, value: el.value });
    }
    return out;
  };

  const seenHref = new WeakMap();
  let pending = [];
  let timer = 0;
  let lastKey = "";
  const consider = (a) => {
    if (!(a instanceof HTMLAnchorElement) || !a.hasAttribute("download")) return;
    const href = a.getAttribute("href") || "";
    if (!href.startsWith("blob:") || seenHref.get(a) === href) return;
    const blob = blobsByUrl.get(href);
    if (!blob) return;
    seenHref.set(a, href);
    pending.push({ t: performance.now(), name: a.getAttribute("download") || "download", blob });
    clearTimeout(timer);
    timer = setTimeout(flush, 300);
  };
  async function flush() {
    const batch = pending;
    pending = [];
    for (const group of groupBursts(batch, 300)) {
      const settings = snapshotSettings(controlsOf());
      const key = JSON.stringify([group.map((g) => [g.name, g.blob.size]), settings]);
      if (key === lastKey) continue; // the tool drew the same result again
      lastKey = key;
      const outputs = group.map((g) => ({ name: g.name, type: g.blob.type || detectType(new Uint8Array(0), g.name), size: g.blob.size }));
      const names = outputs.map((o) => o.name);
      const entry = libraryEntry({
        tool: toolId, title, by: "you", via: "site", ok: true,
        summary: outputs.length === 1 ? `Made ${names[0]}.` : `Made ${outputs.length} files: ${names.slice(0, 3).join(", ")}${outputs.length > 3 ? ", …" : ""}.`,
        settings,
        inputs: added.map((a) => ({ name: a.name, size: a.size, type: a.type || detectType(new Uint8Array(0), a.name) })),
        outputs,
      });
      await saveEntry(entry, group.map((g) => g.blob));
    }
  }
  const scan = (node) => {
    if (!(node instanceof Element)) return;
    if (node.matches("a[download]")) consider(node);
    node.querySelectorAll("a[download]").forEach(consider);
  };
  new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === "attributes") consider(m.target);
      else m.addedNodes.forEach(scan);
    }
  }).observe(work, { childList: true, subtree: true, attributes: true, attributeFilter: ["href", "download"] });

  // Leaving right after a download must not lose the record.
  addEventListener("pagehide", () => { clearTimeout(timer); flush(); });

  // ---- 3. WebMCP ------------------------------------------------------------------------------
  registerWithAgents(toolId, title, added);
}

// ---- Form labels --------------------------------------------------------------------------------

function clean(s) {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

/** Text of a label without the text of controls inside it. */
function labelText(label) {
  const c = label.cloneNode(true);
  c.querySelectorAll("input, select, textarea, option, .sr-only").forEach((n) => n.remove());
  c.querySelectorAll("*").forEach((n) => n.after(" ")); // keep words apart: "<b>Every page</b><span>one file</span>"
  return clean(c.textContent);
}

function labelOf(el) {
  const fromLabel = [...(el.labels ?? [])].map(labelText).find(Boolean);
  const byId = el.getAttribute("aria-labelledby")?.split(/\s+/).map((id) => clean(document.getElementById(id)?.textContent)).join(" ").trim();
  return fromLabel || clean(el.getAttribute("aria-label")) || byId || clean(el.getAttribute("title")) || clean(el.getAttribute("placeholder")) || el.name || el.id || "Setting";
}

function groupOf(radio) {
  const box = radio.closest("fieldset, [role=radiogroup], [role=group]");
  const legend = box?.matches("fieldset") ? clean(box.querySelector("legend")?.textContent) : "";
  const named = box ? clean(box.getAttribute("aria-label")) || clean(document.getElementById(box.getAttribute("aria-labelledby") ?? "")?.textContent) : "";
  return legend || named || radio.name || "";
}

// ---- WebMCP -------------------------------------------------------------------------------------

async function registerWithAgents(toolId, pageTitle, added) {
  const mc = globalThis.document?.modelContext;
  if (!mc || typeof mc.registerTool !== "function") return;
  const load = agentModules[`../../tools/${toolId}/agent.js`];
  if (!load) return;
  let defs;
  try {
    defs = [(await load()).default].flat();
  } catch {
    return;
  }

  /** Result files made by agent calls on this page, so a later call can use them by name. */
  const made = [];
  const onPage = () => [
    ...added.map((a) => ({ name: a.name, size: a.size, read: async () => new Uint8Array(await a.file.arrayBuffer()) })),
    ...made.map((m) => ({ name: m.name, size: m.size, read: async () => new Uint8Array(await m.blob.arrayBuffer()) })),
  ];

  const text = (s, isError = false) => ({ content: [{ type: "text", text: s }], ...(isError ? { isError: true } : {}) });
  const register = async (def) => {
    try {
      await mc.registerTool(def);
    } catch {} // a duplicate name or a refusal must never show as a page error
  };

  await register({
    name: "list_page_files",
    description:
      "List the files the person has added to this page, and files earlier calls made here, with name, size and type. Files never leave this device. If the list is empty, tell the person to drop the file on the page, then call this again.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
    async execute() {
      const files = [
        ...added.map((a) => ({ name: a.name, size: a.size, type: a.type || detectType(new Uint8Array(0), a.name), source: "added by the person" })),
        ...made.map((m) => ({ name: m.name, size: m.size, type: m.type, source: "made by an agent call" })),
      ];
      return text(files.length ? JSON.stringify({ files }) : JSON.stringify({ files: [], note: "No files yet. Ask the person to drop a file on this page, then call list_page_files again." }));
    },
  });

  for (const def of defs) {
    const wire = wireSchema(def.input, wireFile);
    await register({
      name: def.name,
      description: def.description,
      inputSchema: wire,
      async execute(rawArgs) {
        const args = rawArgs && typeof rawArgs === "object" ? rawArgs : {};
        const call = { tool: def.title, time: new Date() };
        let inputs = [];
        try {
          const problems = checkArgs(wire, args);
          if (problems.length) throw new Error(problems.join(" "));
          const resolved = await resolveArgs(def.input, args, onPage());
          inputs = resolved.inputs;
          const ctx = {};
          if (def.needs?.includes("ghostscript")) ctx.ghostscript = (await import("./gs.js")).ghostscript;
          const result = await def.run(resolved.args, ctx);
          const outFiles = (result.files ?? []).map((f) => ({ name: f.name, type: f.type, size: f.bytes.length, blob: new Blob([f.bytes], { type: f.type }) }));
          for (const f of outFiles) made.push(f);
          const entry = libraryEntry({
            tool: toolId, title: def.title, by: "agent", via: "webmcp", ok: true, summary: result.summary,
            settings: settingsOf(def.input, args), inputs, outputs: outFiles,
          });
          await saveEntry(entry, outFiles.map((f) => f.blob));
          showCall({ ...call, ok: true, summary: result.summary, detail: result.data === undefined ? "" : JSON.stringify(result.data), files: outFiles });
          return text(successText(result, outFiles.map((f) => factsOf(f))));
        } catch (e) {
          const msg = e instanceof Error && e.message ? e.message : "The tool could not finish. Check the file and try again.";
          await saveEntry(
            libraryEntry({ tool: toolId, title: def.title, by: "agent", via: "webmcp", ok: false, summary: "Failed", error: msg, settings: settingsOf(def.input, args), inputs }),
          );
          showCall({ ...call, ok: false, summary: msg, files: [] });
          return text(msg, true);
        }
      },
    });
  }
}

// ---- Activity panel -----------------------------------------------------------------------------

function showCall({ tool, time, ok, summary, detail = "", files }) {
  const panel = document.getElementById("agent-activity");
  const list = document.getElementById("agent-log");
  if (!panel || !list) return;
  panel.hidden = false;
  const li = document.createElement("li");
  li.className = ok ? "agent-call" : "agent-call bad";
  const head = document.createElement("p");
  head.className = "agent-head";
  const name = document.createElement("strong");
  name.textContent = tool;
  const when = document.createElement("time");
  when.dateTime = time.toISOString();
  when.textContent = time.toLocaleTimeString();
  head.append(name, " · ", when, ok ? "" : " · failed");
  const msg = document.createElement("p");
  msg.textContent = summary;
  li.append(head, msg);
  if (detail) {
    const d = document.createElement("p");
    d.className = "agent-data mono";
    d.textContent = detail.length > 400 ? `${detail.slice(0, 400)}…` : detail;
    li.append(d);
  }
  if (files.length) {
    const row = document.createElement("p");
    row.className = "agent-files";
    for (const f of files) {
      const a = document.createElement("a");
      a.className = "btn line";
      a.href = plainUrl(f.blob);
      a.download = f.name;
      a.textContent = `Download ${f.name}`;
      row.append(a);
    }
    li.append(row);
  }
  list.prepend(li);
  const live = document.getElementById("agent-status");
  if (live) live.textContent = `AI agent used ${tool}. ${summary}`;
}
