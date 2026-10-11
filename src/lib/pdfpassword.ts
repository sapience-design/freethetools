// A locked PDF in any PDF tool: ask for its password (or offer to lift its limits) in the file's
// own row, unlock it in the browser with the same qpdf code Unlock PDF uses, and carry on with the
// unlocked copy as if the file had never been locked. Nothing is uploaded.
//
// qpdf runs in a Web Worker (src/agent/qpdf.js), loaded only when a locked PDF appears, so a
// crafted file cannot freeze the page. A password is read from its field, the field is cleared at
// once, and the password goes only to qpdf as an argument: it is never written to the page, logged,
// stored or put in a file name. The unlocked bytes live in memory only, as a new File.
import { fileRow, fmtBytes, pdfThumb } from "./files";
import { inspectArgs, readInspection, unlockPdf } from "../../tools/pdf/unlock/core.js";

export type Lock = "none" | "password" | "limits";

const SAY_PASSWORD = "This PDF is locked. Enter its password to use it here. The password stays on this device.";
const SAY_LIMITS = "This PDF has limits on changes, such as printing or copying. Remove them for this job? Only do this for files you own or may change.";
const UNLOCK_PAGE = "/pdf/unlock/";

/** The qpdf function, fetched only when a locked PDF needs it. */
const engine = async () => (await import("../agent/qpdf.js")).qpdf;

/** Does the file mention /Encrypt anywhere? A cheap check, so an ordinary PDF never loads qpdf. */
function mentionsEncrypt(bytes: Uint8Array): boolean {
  const word = [0x2f, 0x45, 0x6e, 0x63, 0x72, 0x79, 0x70, 0x74]; // "/Encrypt"
  for (let i = bytes.indexOf(0x2f); i >= 0 && i <= bytes.length - word.length; i = bytes.indexOf(0x2f, i + 1)) {
    let k = 1;
    while (k < word.length && bytes[i + k] === word[k]) k++;
    if (k === word.length) return true;
  }
  return false;
}

/** What kind of lock a PDF has: "password" (needs one to open), "limits" (opens, but restricted) or "none". */
export async function lockOf(bytes: Uint8Array): Promise<Lock> {
  if (!mentionsEncrypt(bytes)) return "none";
  const seen = readInspection(await (await engine())(inspectArgs(""), bytes));
  return seen.kind === "password" ? "password" : seen.kind === "restricted" ? "limits" : "none";
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = "") => {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text) e.textContent = text;
  return e;
};

let counter = 0;
const generations = new WeakMap<HTMLElement, number>();

/** Say something to screen readers, even if it is the same words as last time. */
function announce(text: string) {
  let live = document.getElementById("pwx-live");
  if (!live) {
    live = el("p", "sr-only");
    live.id = "pwx-live";
    live.setAttribute("role", "status");
    live.setAttribute("aria-live", "polite");
    document.body.append(live);
  }
  const box = live;
  box.textContent = "";
  setTimeout(() => (box.textContent = text), 50);
}

const asFile = (src: File, bytes: Uint8Array) =>
  new File([bytes as BlobPart], src.name, { type: "application/pdf", lastModified: src.lastModified });

/**
 * Hand a chosen PDF to `onFile`. An ordinary PDF goes straight through. A locked one gets a row
 * after `anchor` (usually the drop area) that asks for its password, or offers to remove its
 * limits; `onFile` then gets the unlocked copy, with the same name. The returned promise settles
 * once `onFile` has run for an ordinary file, or once the prompt is showing for a locked one, so a
 * drop area is never kept waiting for a person to type.
 * `many`: false (the default) replaces any earlier prompt, for tools that take one file.
 */
export async function withUnlocked(file: File, anchor: HTMLElement, onFile: (file: File) => void | Promise<void>, o: { many?: boolean } = {}): Promise<void> {
  let bytes: Uint8Array;
  let kind: Lock = "none";
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
    kind = await lockOf(bytes);
  } catch {
    return onFile(file); // unreadable, or qpdf would not load: let the tool report it in its own words
  }
  let box = anchor.nextElementSibling as HTMLElement | null;
  if (box && !box.classList.contains("pwx-list")) box = null;
  // A tool that takes one file forgets an earlier prompt when another file is chosen.
  if (box && !o.many) { box.replaceChildren(); generations.set(box, (generations.get(box) ?? 0) + 1); if (kind === "none") box.remove(); }
  if (kind === "none") return onFile(file);
  if (!box) {
    box = el("ul", "file-list pwx-list");
    box.setAttribute("aria-label", "Locked PDFs");
    anchor.after(box);
  }
  const list = box;
  const generation = generations.get(list) ?? 0;

  const say = el("p", "pwx-say", kind === "password" ? SAY_PASSWORD : SAY_LIMITS);
  say.id = `pwx-say-${++counter}`;
  const msg = el("div", "pwx-msg");
  const li = fileRow({ name: file.name, meta: `Locked · ${fmtBytes(file.size)}`, thumb: pdfThumb(), extra: [say] });
  const info = li.querySelector(".finfo")!;
  const meta = li.querySelector<HTMLElement>(".fmeta")!;

  const finish = async (unlocked: File) => {
    const current = o.many || (generations.get(list) ?? 0) === generation;
    li.remove();
    if (!list.children.length) list.remove();
    announce(`${file.name} is unlocked.`);
    if (current) await onFile(unlocked);
  };
  const problem = (text: string, input?: HTMLInputElement) => {
    const p = el("p", "tool-error", text);
    p.id = `pwx-err-${++counter}`;
    msg.replaceChildren(p);
    if (input) { input.setAttribute("aria-describedby", `${say.id} ${p.id}`); input.setAttribute("aria-invalid", "true"); input.focus(); }
    meta.textContent = `Locked · ${fmtBytes(file.size)}`;
    announce(`${file.name}: ${text}`);
  };
  const broken = () => problem("The unlocker could not load. Reload the page and try again.");
  const damaged = () => problem("This PDF could not be unlocked. It may be damaged.");

  if (kind === "password") {
    const id = `pwx-pw-${++counter}`;
    const form = el("form", "pwx");
    form.noValidate = true;
    const label = el("label", "", `Password for ${file.name}`);
    label.htmlFor = id;
    const input = el("input", "input");
    input.id = id;
    input.type = "password";
    input.autocomplete = "off";
    input.setAttribute("autocapitalize", "off");
    input.spellcheck = false;
    input.setAttribute("aria-describedby", say.id);
    const button = el("button", "btn", "Use password");
    button.type = "submit";
    const line = el("div", "pwx-row");
    line.append(input, button);
    form.append(label, line);
    info.append(form);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      let password = input.value;
      input.value = ""; // never keep it: the field is cleared before anything else happens
      if (!password) return problem("Type the password first.", input);
      button.disabled = true;
      msg.replaceChildren();
      meta.textContent = "Unlocking…";
      try {
        const r = await unlockPdf(await engine(), bytes, password);
        password = "";
        button.disabled = false;
        if (r.status === "unlocked") return await finish(asFile(file, r.bytes));
        if (r.status === "wrong-password") return problem("That password doesn't open this PDF. Check it and try again.", input);
        damaged();
      } catch {
        password = "";
        button.disabled = false;
        broken();
      }
    });
  } else {
    const button = el("button", "btn", "Remove the limits");
    button.type = "button";
    const line = el("div", "pwx-row");
    line.append(button);
    info.append(line);
    button.addEventListener("click", async () => {
      button.disabled = true;
      msg.replaceChildren();
      meta.textContent = "Removing the limits…";
      try {
        const r = await unlockPdf(await engine(), bytes, "");
        button.disabled = false;
        if (r.status === "unlocked") return await finish(asFile(file, r.bytes));
        if (r.status === "not-locked") return await finish(file);
        damaged();
      } catch {
        button.disabled = false;
        broken();
      }
    });
  }

  const more = el("p", "pwx-link");
  const a = el("a", "", "Use Unlock PDF.");
  a.href = UNLOCK_PAGE;
  more.append("Want a saved copy without the password? ", a);
  info.append(msg, more);
  list.append(li);
  announce(`${file.name} is locked. ${kind === "password" ? "Enter its password to use it here." : "Choose whether to remove its limits."}`);
  if (!o.many || list.children.length === 1) li.querySelector<HTMLElement>("input, button.btn")?.focus();
}
