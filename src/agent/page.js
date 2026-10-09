// The browser side of ADR 0008, started by every tool page:
//   1. keeps a list of the files the person added to this page;
//   2. records the person's own jobs in the library, with no help from the tool: it watches for
//      download links and keeps the Blob behind each;
//   3. when the browser has WebMCP (document.modelContext), registers the tool's agent
//      definitions so an AI agent can call them, shows each call in the activity panel, and
//      records it in the library.
// Nothing here is sent anywhere. Agent calls are not counted in the anonymous stats.
import { checkArgs, cleanArgs, detectType, settingsOf, wireSchema } from "./contract.js";
import { factsOf, libraryEntry } from "./library.js";
import { saveEntry } from "./db.js";
import { blobsByUrl, installBlobCapture, plainUrl } from "./blob-capture.js";
import { fileKey, resolveArgs, snapshotSettings, successText, wireFile } from "./page-helpers.js";

installBlobCapture();

// One lazy loader per agent.js. Only the current tool's is ever called, so other pages download none.
const agentModules = import.meta.glob("../../tools/*/*/agent.js");

const MAX_FILES = 50;
/** Agent results kept on the page for later calls: at most this many, and this many bytes. */
const MAX_MADE = 20;
const MAX_MADE_BYTES = 200 * 1024 * 1024;

/** @param {HTMLElement} work the #tool-work element @param {string} toolId e.g. "pdf/merge" */
export function startAgentPage(work, toolId) {
  const title =
    document.querySelector("[data-save]")?.dataset.name || document.querySelector("main h1")?.textContent?.trim() || toolId;

  // ---- 1. Files the person added -------------------------------------------------------------
  /** @type {{ name: string, size: number, type: string, lastModified: number, file: File }[]} */
  const added = [];
  /** Files added since the last result appeared: the inputs of the next job. */
  let fresh = [];
  const remember = (list) => {
    for (const f of list ?? []) {
      if (!(f instanceof File) || added.some((a) => fileKey(a.file) === fileKey(f))) continue;
      const item = { name: f.name, size: f.size, type: f.type, lastModified: f.lastModified, file: f };
      added.push(item);
      fresh.push(item);
      if (added.length > MAX_FILES) added.shift();
      if (fresh.length > MAX_FILES) fresh.shift();
    }
  };
  // Capture phase on the work area: runs before the tool's own handlers, which may clear the input.
  work.addEventListener("change", (e) => {
    const t = e.target;
    if (t instanceof HTMLInputElement && t.type === "file") remember(t.files ? [...t.files] : []);
  }, true);
  work.addEventListener("drop", (e) => remember(e.dataTransfer?.files ? [...e.dataTransfer.files] : []), true);

  // ---- 2. The person's own jobs --------------------------------------------------------------
  // Settings are the option controls in the tool's own markup: checkboxes, radios, selects and
  // number inputs present when the page loads. Text fields and controls a tool draws later (Fill
  // PDF Form draws the PDF's own fields) hold the person's content, so they are never recorded.
  const settingControls = [...work.querySelectorAll("input, select")].filter(
    (el) => el instanceof HTMLSelectElement || ["checkbox", "radio", "number", "range"].includes(el.type),
  );
  const controlsOf = () =>
    settingControls.filter((el) => el.isConnected).map((el) => {
      const label = labelOf(el);
      if (el instanceof HTMLSelectElement) return { type: "select", label, value: el.selectedOptions[0]?.textContent ?? "" };
      if (el.type === "radio") return { type: "radio", label, group: groupOf(el), checked: el.checked };
      if (el.type === "checkbox") return { type: "checkbox", label, checked: el.checked };
      return { type: el.type, label, value: el.value };
    });

  // A result is recorded when the person downloads it, not each time the tool draws it: some
  // tools redraw their result on every keystroke. Links drawn within 300 ms of each other are one
  // job (Split PDF draws a link per file); downloading any of them records the whole job, once.
  /** @typedef {{ t: number, links: Map<HTMLAnchorElement, { name: string, blob: Blob }>, settings: Record<string, unknown>, inputs: typeof added, recorded: boolean }} Job */
  /** @type {WeakMap<HTMLAnchorElement, Job>} */
  const jobOf = new WeakMap();
  /** @type {Job | null} */
  let current = null;
  let lastInputs = [];
  const seenHref = new WeakMap();
  const consider = (a) => {
    if (!(a instanceof HTMLAnchorElement) || !a.hasAttribute("download")) return;
    const href = a.getAttribute("href") || "";
    if (!href.startsWith("blob:") || seenHref.get(a) === href) return;
    const blob = blobsByUrl.get(href);
    if (!blob) return;
    seenHref.set(a, href);
    const now = performance.now();
    if (!current || current.recorded || now - current.t > 300) {
      if (fresh.length) { lastInputs = fresh; fresh = []; }
      current = { t: now, links: new Map(), settings: snapshotSettings(controlsOf()), inputs: lastInputs, recorded: false };
    }
    current.t = now;
    current.settings = snapshotSettings(controlsOf()); // the settings of the latest draw
    current.links.set(a, { name: a.getAttribute("download") || "download", blob });
    jobOf.set(a, current);
  };
  const recordFor = (a) => {
    const job = a ? jobOf.get(a) : undefined;
    if (!job || job.recorded) return;
    job.recorded = true;
    record(job);
  };
  work.addEventListener("click", (e) => recordFor(e.target instanceof Element ? e.target.closest("a[download]") : null), true);
  // Sharing a result takes it too (src/lib/share.ts): the Share button names its link.
  work.addEventListener("ftt:shared", (e) => recordFor(e.detail?.link));

  async function record(job) {
    // Only the links still on the page: a tool that redraws replaces its old links.
    const live = [...job.links].filter(([a]) => a.isConnected).map(([, v]) => v);
    const items = live.length ? live : [...job.links.values()];
    const outputs = items.map((g) => ({ name: g.name, type: g.blob.type || detectType(new Uint8Array(0), g.name), size: g.blob.size }));
    const names = outputs.map((o) => o.name);
    const entry = libraryEntry({
      tool: toolId, title, by: "you", via: "site", ok: true,
      summary: outputs.length === 1 ? `Made ${names[0]}.` : `Made ${outputs.length} files: ${names.slice(0, 3).join(", ")}${outputs.length > 3 ? ", …" : ""}.`,
      settings: job.settings,
      inputs: job.inputs.map((a) => ({ name: a.name, size: a.size, type: a.type || detectType(new Uint8Array(0), a.name) })),
      outputs,
    });
    await saveEntry(entry, items.map((g) => g.blob));
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
      async execute(rawArgs, options) {
        const args = rawArgs && typeof rawArgs === "object" ? rawArgs : {};
        const signal = options?.signal;
        const stopIfCancelled = () => { if (signal?.aborted) throw new Error("The call was cancelled."); };
        const call = { tool: def.title, time: new Date() };
        let inputs = [];
        try {
          const problems = checkArgs(wire, args);
          if (problems.length) throw new Error(problems.join(" "));
          stopIfCancelled();
          const resolved = await resolveArgs(def.input, cleanArgs(args), onPage());
          inputs = resolved.inputs;
          const ctx = {};
          if (def.needs?.includes("ghostscript")) ctx.ghostscript = (await import("./gs.js")).ghostscript;
          if (def.needs?.includes("qpdf")) ctx.qpdf = (await import("./qpdf.js")).qpdf;
          const result = await def.run(resolved.args, ctx);
          stopIfCancelled();
          const outFiles = (result.files ?? []).map((f) => ({ name: f.name, type: f.type, size: f.bytes.length, blob: new Blob([f.bytes], { type: f.type }) }));
          for (const f of outFiles) made.push(f);
          // An agent that loops must not fill the page's memory: keep the newest results only.
          let bytes = made.reduce((n, f) => n + f.size, 0);
          while (made.length > MAX_MADE || (made.length > 1 && bytes > MAX_MADE_BYTES)) bytes -= made.shift().size;
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
