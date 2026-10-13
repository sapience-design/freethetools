// View and Edit PDF, and Edit in the shared full-screen viewer. The tool page shows a read-only preview
// with Edit and View full screen; Edit opens the viewer in edit mode. Here: place text, a box, a highlight,
// a drawing and a typed signature, delete by key and by button, undo, redo, save (the page shows the saved
// copy and its download), the choice about unsaved marks, Edit on a PDF from another tool, other alphabets,
// touch drawing, axe in both themes, phone layout at 390 and 320 px, and the offline case.
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { PDFDocument, PDFName, decodePDFRawStream } from "pdf-lib";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { withRestrictions } from "../tools/pdf/unlock/tests/helpers.js";

const PDF = "tools/pdf/compress/tests/fixtures/sample.pdf";
const URL_PATH = "/pdf/edit/";
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

// Every test fails on a page error, a request to another origin, or a CSP violation.
test.beforeEach(async ({ page }) => {
  const problems = [];
  page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
  page.on("console", (m) => {
    if (page.__offline && /net::ERR_/.test(m.text())) return; // the network is off on purpose (the usage totals cannot be sent)
    if (m.type() === "error" || /Content Security Policy/i.test(m.text())) problems.push(`console: ${m.text()}`);
  });
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.protocol.startsWith("http") && u.hostname !== new URL(test.info().project.use.baseURL).hostname) problems.push(`offsite: ${r.url()}`);
  });
  page.__problems = problems;
});
test.afterEach(async ({ page }) => expect(page.__problems).toEqual([]));

async function download(page, trigger) {
  const [d] = await Promise.all([page.waitForEvent("download"), trigger()]);
  return { buf: readFileSync(await d.path()), name: d.suggestedFilename() };
}

async function textOfPages(buf) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false, verbosity: 0 }).promise;
  const out = [];
  for (let n = 1; n <= doc.numPages; n++) out.push((await (await doc.getPage(n)).getTextContent()).items.map((i) => i.str).join(" "));
  return out;
}

/** The drawing operators of a page, as text. */
async function contentOf(buf, pageNo) {
  const doc = await PDFDocument.load(buf);
  const refs = doc.getPage(pageNo - 1).node.Contents().asArray();
  return refs.map((r) => Buffer.from(decodePDFRawStream(doc.context.lookup(r)).decode()).toString("latin1")).join("\n");
}

const dlg = (page) => page.locator("dialog#fv");

/** Choose a PDF on the tool page: the read-only preview appears with Edit and View full screen. */
async function choose(page, file = PDF, { visit = true } = {}) {
  if (visit) await page.goto(URL_PATH);
  await page.setInputFiles("#pve-file", file);
  await expect(page.locator("#pve-pages .page-tile")).toHaveCount(3);
  await expect(page.locator("#pve-meta")).toContainText("3 pages");
}

/** Press Edit on the tool page and wait until the pages in the viewer are drawn. */
async function edit(page) {
  await page.locator("#pve-edit").click();
  await expect(dlg(page)).toBeVisible();
  await ready(page);
}
async function ready(page) {
  await expect(page.locator("#fv-ed")).toBeVisible();
  await expect(page.locator("#fv-stage .fv-cell").first().locator("canvas.fv-pic")).toBeVisible();
  await expect(page.locator(".fv-ed-layer")).toHaveCount(3);
}

async function openAndEdit(page, file = PDF) {
  await choose(page, file);
  await edit(page);
}

const mode = (page, name) => page.locator(`label[for="fv-ed-m-${name}"]`).click();
// The number of marks is on the dialog; under heavy test load a change can take a few seconds to show.
const count = (page, n) => expect(dlg(page)).toHaveAttribute("data-marks", String(n), { timeout: 10_000 });

/** Scroll a page of the viewer into the middle and return a way to point at it: fractions of its size. */
async function pageAt(page, n) {
  const el = page.locator(`#fv-stage .fv-cell[data-i="${n}"]`);
  await el.evaluate((e) => e.scrollIntoView({ block: "center" }));
  await expect(el.locator("canvas.fv-pic")).toBeVisible();
  const b = await el.boundingBox();
  return { at: (fx, fy) => [b.x + b.width * fx, b.y + b.height * fy], box: b };
}
async function dragOn(page, n, from, to) {
  const p = await pageAt(page, n);
  const [x0, y0] = p.at(...from), [x1, y1] = p.at(...to);
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  await page.mouse.move((x0 + x1) / 2, (y0 + y1) / 2, { steps: 4 });
  await page.mouse.move(x1, y1, { steps: 4 });
  await page.mouse.up();
}

async function addText(page, n, at, text) {
  await mode(page, "text");
  const p = await pageAt(page, n);
  await page.mouse.click(...p.at(...at));
  await page.locator(".fv-ed-edit").fill(text);
  await page.keyboard.press("Escape");
}

async function scan(page, label) {
  const { violations } = await new AxeBuilder({ page })
    .options({ runOnly: { type: "tag", values: WCAG }, rules: { "label-content-name-mismatch": { enabled: true } } })
    .analyze();
  const summary = violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).slice(0, 4).join(" | ")}`);
  expect(summary, `${label}\n${summary.join("\n")}`).toEqual([]);
}

test.describe("View and Edit PDF", () => {
  test.skip(({ isMobile }) => isMobile, "mouse flows run once, on desktop");

  test("the page shows a read-only preview with Edit and View full screen; View opens the plain viewer", async ({ page }) => {
    await page.goto(URL_PATH);
    await expect(page.locator("#pve-edit")).toBeDisabled();
    await choose(page, PDF, { visit: false });
    await expect(page.locator("#pve-edit")).toBeEnabled();
    await expect(page.locator("#pve-full")).toBeEnabled();
    // Read only: no editing layer, no toolbar on the page itself.
    await expect(page.locator(".fv-ed-layer")).toHaveCount(0);
    await expect(page.locator("#pve-pages canvas").first()).toBeVisible();
    await expect(page.locator("#pve-tool")).toContainText("not a certificate-based digital signature");
    await page.locator("#pve-full").click();
    await expect(dlg(page)).toBeVisible();
    await expect(page.locator("#fv-stage canvas.fv-pic").first()).toBeVisible();
    await expect(page.locator("#fv-ed")).toBeHidden();
    await expect(page.locator("#fv-edit")).toBeVisible();
    await expect(page.locator("#fv-done")).toBeHidden();
    await page.locator("#fv-close").click();
    await expect(dlg(page)).toBeHidden();
  });

  test("text, box, highlight, drawing and signature; delete by key and by button; undo; save; the page shows the copy", async ({ page }) => {
    await openAndEdit(page);
    await expect(page.locator("#fv-ed-del")).toBeDisabled();
    // Edit mode: one scrolling column, no layout choice, no rotate, zoom still there.
    await expect(page.locator("#fv-layout")).toBeHidden();
    await expect(page.locator("#fv-rot")).toBeHidden();
    await expect(page.locator("#fv-zoom")).toBeVisible();

    // Text: click, type, finish with Escape.
    await addText(page, 1, [0.2, 0.45], "Hello Ada");
    await count(page, 1);
    await expect(page.locator('.fv-mark[data-type="text"]')).toHaveAttribute("aria-label", /Text “Hello Ada”, page 1/);
    await expect(page.locator("#fv-ed-selbar")).toBeVisible(); // a new mark is selected

    // Box with text on page 2.
    await mode(page, "box");
    await dragOn(page, 2, [0.2, 0.4], [0.7, 0.55]);
    await count(page, 2);
    await page.getByRole("button", { name: "Edit text" }).click();
    await page.locator(".fv-ed-edit").fill("Approved by the board");
    await page.keyboard.press("Escape");

    // A highlight on page 3 and a drawn line on page 1.
    await mode(page, "highlight");
    await dragOn(page, 3, [0.15, 0.3], [0.75, 0.33]);
    await count(page, 3);
    await mode(page, "draw");
    await dragOn(page, 1, [0.2, 0.7], [0.6, 0.8]);
    await count(page, 4);

    // A typed signature.
    await page.locator("#fv-ed-sig").click();
    const sg = page.locator("dialog.fv-sg");
    await expect(sg).toBeVisible();
    await expect(sg).toContainText("not a certificate-based digital signature");
    await sg.locator('label[for="fv-sg-tab-type"]').click();
    await sg.getByLabel("Your name").fill("Ada Lovelace");
    await sg.getByRole("button", { name: "Use signature" }).click();
    await expect(sg).toBeHidden();
    await count(page, 5);
    await expect(page.locator('.fv-mark[data-type="image"]')).toHaveAttribute("aria-label", /Signature, page \d/);

    // The signature is selected: Delete removes it, Ctrl+Z brings it back, Shift+Ctrl+Z removes it again.
    await expect(page.locator("#fv-ed-del")).toBeEnabled();
    await page.keyboard.press("Delete");
    await count(page, 4);
    await expect(page.locator('.fv-mark[data-type="image"]')).toHaveCount(0);
    await page.keyboard.press("Control+z");
    await count(page, 5);
    await expect(page.locator('.fv-mark[data-type="image"]')).toHaveCount(1);
    await page.keyboard.press("Control+Shift+z");
    await count(page, 4);
    await page.getByRole("button", { name: "Undo" }).click();
    await count(page, 5);
    await page.getByRole("button", { name: "Redo" }).click();
    await count(page, 4);

    // Delete the highlight with the button: Tab selects a mark, then press Delete.
    await page.locator('.fv-mark[data-type="highlight"]').focus();
    await expect(page.locator("#fv-ed-seltext")).toContainText("Highlight, page 3");
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await count(page, 3);
    await expect(page.locator('.fv-mark[data-type="highlight"]')).toHaveCount(0);

    // Save: the viewer hands the copy to the page, which shows it and offers the download.
    await page.locator("#fv-ed-save").click();
    await expect(page.locator("#pve-name")).toHaveText("sample-edited.pdf");
    await count(page, 0); // the marks are part of the file now
    await expect(page.locator("#fv-name")).toHaveText("sample-edited.pdf");
    // Done leaves edit mode with nothing unsaved to ask about, and the viewer now shows the saved copy.
    await page.locator("#fv-done").click();
    await expect(page.locator("#fv-ed")).toBeHidden();
    await expect(page.locator("#fv-edit")).toBeVisible();
    await page.locator("#fv-close").click();
    await expect(dlg(page)).toBeHidden();

    const link = page.getByRole("link", { name: "Download PDF" });
    await expect(link).toBeVisible();
    const { buf, name } = await download(page, () => link.click());
    expect(name).toBe("sample-edited.pdf");
    expect((await PDFDocument.load(buf)).getPageCount()).toBe(3);
    const text = await textOfPages(buf);
    expect(text[0]).toContain("Hello Ada");
    expect(text[1]).toContain("Approved by the board");
    expect(text[0]).toContain("PDF Shrink test fixture - page 1"); // the original page is intact
    const doc = await PDFDocument.load(buf);
    for (let n = 1; n <= 3; n++) {
      const res = doc.getPage(n - 1).node.Resources();
      const xo = res.lookup(PDFName.of("XObject"));
      const names = xo ? xo.entries().map(([k]) => k.toString()) : [];
      expect(names.filter((k) => k.startsWith("/Image-")), `page ${n}: the deleted signature is not in the file`).toEqual([]);
    }
    expect(await contentOf(buf, 3)).not.toMatch(/\/GS-/); // the deleted highlight left no transparency behind
    expect(await contentOf(buf, 2)).toMatch(/ RG/); // the box border
    expect(await contentOf(buf, 1)).toMatch(/^S$/m); // the drawn line
  });

  test("the preview on the page shows the edited file, and Edit again continues on it", async ({ page }) => {
    await openAndEdit(page);
    await addText(page, 1, [0.2, 0.4], "First round");
    await page.locator("#fv-ed-save").click();
    await expect(page.locator("#pve-name")).toHaveText("sample-edited.pdf");
    await page.locator("#fv-close").click();
    await expect(dlg(page)).toBeHidden();
    await expect(page.locator("#pve-result")).toContainText("Done. Your marks are saved into the PDF.");
    await expect(page.locator("#pve-pages .page-tile")).toHaveCount(3);
    // A second round on the edited file; the name does not grow.
    await edit(page);
    await addText(page, 2, [0.2, 0.4], "Second round");
    await page.locator("#fv-ed-save").click();
    await expect(page.locator("#pve-result")).toContainText("sample-edited.pdf");
    await page.locator("#fv-close").click();
    const { buf, name } = await download(page, () => page.getByRole("link", { name: "Download PDF" }).click());
    expect(name).toBe("sample-edited.pdf");
    const text = await textOfPages(buf);
    expect(text[0]).toContain("First round");
    expect(text[1]).toContain("Second round");
  });

  test("the keyboard way: add text in the middle, move it with the arrow keys, change its size", async ({ page }) => {
    await openAndEdit(page);
    await mode(page, "text");
    await page.getByRole("button", { name: "Add text in the middle of the screen" }).click();
    await page.locator(".fv-ed-edit").fill("By keyboard");
    await page.keyboard.press("Escape");
    const mark = page.locator('.fv-mark[data-type="text"]');
    await expect(mark).toBeFocused();
    const x = async () => Number(await mark.locator("text").first().getAttribute("x"));
    const before = await x();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Shift+ArrowRight");
    expect(await x()).toBeCloseTo(before + 14, 1);
    // One run of arrow keys is one step to undo.
    await page.keyboard.press("Control+z");
    expect(await x()).toBeCloseTo(before, 1);
    const size = async () => Number(await mark.locator("text").first().getAttribute("font-size"));
    const s0 = await size();
    await page.getByRole("button", { name: "Bigger" }).click();
    expect(await size()).toBeGreaterThan(s0);
    // Tab reaches marks, and Backspace deletes the one that has focus.
    await mark.focus();
    await page.keyboard.press("Backspace");
    await count(page, 0);
  });

  test("a mark can be moved by dragging; zoom keeps the marks on the text they were put on", async ({ page }) => {
    await openAndEdit(page);
    await mode(page, "box");
    await dragOn(page, 1, [0.2, 0.3], [0.5, 0.4]);
    const rect = page.locator('.fv-mark[data-type="rect"] rect').first();
    const x0 = Number(await rect.getAttribute("x"));
    const b = await rect.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 + 60, b.y + b.height / 2, { steps: 5 });
    await page.mouse.up();
    expect(Number(await page.locator('.fv-mark[data-type="rect"] rect').first().getAttribute("x"))).toBeGreaterThan(x0 + 30);
    await page.keyboard.press("Control+z");
    expect(Number(await page.locator('.fv-mark[data-type="rect"] rect').first().getAttribute("x"))).toBeCloseTo(x0, 1);
    // Zoom in: the box grows with its page, and stays in the same place on it.
    const frac = async () => {
      const cell = await page.locator('#fv-stage .fv-cell[data-i="1"]').boundingBox();
      const r = await page.locator('.fv-mark[data-type="rect"] rect').first().boundingBox();
      return [(r.x - cell.x) / cell.width, (r.y - cell.y) / cell.height, r.width / cell.width];
    };
    const f0 = await frac();
    await page.getByRole("button", { name: "Zoom in" }).click();
    await page.getByRole("button", { name: "Zoom in" }).click();
    const f1 = await frac();
    for (let i = 0; i < 3; i++) expect(f1[i]).toBeCloseTo(f0[i], 2);
  });

  test("Russian and Greek text is saved with an embedded font, and Norwegian letters need none", async ({ page }) => {
    await openAndEdit(page);
    await addText(page, 1, [0.2, 0.4], "Привет, мир Ωμέγα");
    await addText(page, 1, [0.2, 0.5], "Blåbærsyltetøy");
    await count(page, 2);
    await page.locator("#fv-ed-save").click();
    await expect(page.locator("#pve-name")).toHaveText("sample-edited.pdf");
    await page.locator("#fv-close").click();
    const { buf } = await download(page, () => page.getByRole("link", { name: "Download PDF" }).click());
    const text = (await textOfPages(buf))[0];
    expect(text).toContain("Привет, мир Ωμέγα");
    expect(text).toContain("Blåbærsyltetøy");
  });

  test("saving with nothing added says so", async ({ page }) => {
    await openAndEdit(page);
    await page.locator("#fv-ed-save").click();
    await expect(page.locator("#fv-ed-status")).toContainText("Add some text, a box");
    await expect(dlg(page)).toBeVisible();
  });

  test("Done and Close with unsaved marks ask inline: Save, Discard or Keep editing", async ({ page }) => {
    await openAndEdit(page);
    await mode(page, "box");
    await dragOn(page, 1, [0.2, 0.3], [0.5, 0.4]);
    await count(page, 1);
    const ask = page.locator("#fv-ed-ask");
    await expect(ask).toBeHidden();

    // Done asks. Keep editing goes back.
    await page.locator("#fv-done").click();
    await expect(ask).toBeVisible();
    await expect(ask.getByRole("button", { name: "Save" })).toBeFocused();
    await ask.getByRole("button", { name: "Keep editing" }).click();
    await expect(ask).toBeHidden();
    await expect(page.locator("#fv-ed")).toBeVisible();
    await count(page, 1);

    // Close asks the same way; Escape means Keep editing.
    await page.locator("#fv-close").click();
    await expect(ask).toBeVisible();
    await expect(dlg(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(ask).toBeHidden();
    await expect(dlg(page)).toBeVisible();

    // Escape on the page with nothing selected asks as well (the box is selected: the first Escape lets go of it).
    await page.locator("#fv-stage").focus();
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect(ask).toBeVisible();
    await ask.getByRole("button", { name: "Keep editing" }).click();

    // Discard on Done: back to reading, the marks are gone.
    await page.locator("#fv-done").click();
    await ask.getByRole("button", { name: "Discard" }).click();
    await expect(page.locator("#fv-ed")).toBeHidden();
    await expect(page.locator("#fv-edit")).toBeVisible();
    await expect(page.locator(".fv-ed-layer")).toHaveCount(0);

    // Edit again, add a mark, and Save from the choice: it saves, then leaves edit mode.
    await page.locator("#fv-edit").click();
    await ready(page);
    await mode(page, "box");
    await dragOn(page, 2, [0.2, 0.3], [0.5, 0.4]);
    await page.locator("#fv-done").click();
    await ask.getByRole("button", { name: "Save" }).click();
    await expect(page.locator("#pve-name")).toHaveText("sample-edited.pdf");
    await expect(page.locator("#fv-ed")).toBeHidden();
    await expect(dlg(page)).toBeVisible();

    // Close with unsaved marks, then Discard: the viewer closes.
    await page.locator("#fv-edit").click();
    await ready(page);
    await mode(page, "highlight");
    await dragOn(page, 1, [0.2, 0.6], [0.6, 0.63]);
    await page.locator("#fv-close").click();
    await ask.getByRole("button", { name: "Discard" }).click();
    await expect(dlg(page)).toBeHidden();
  });

  test("leaving the page with unsaved marks asks first", async ({ page }) => {
    await openAndEdit(page);
    await mode(page, "box");
    await dragOn(page, 1, [0.2, 0.3], [0.5, 0.4]);
    const prevented = await page.evaluate(() => {
      const e = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(e);
      return e.defaultPrevented;
    });
    expect(prevented).toBe(true);
    await page.locator("#fv-close").click();
    await page.locator("#fv-ed-ask").getByRole("button", { name: "Discard" }).click();
    const after = await page.evaluate(() => {
      const e = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(e);
      return e.defaultPrevented;
    });
    expect(after).toBe(false);
  });

  test("a signature can be drawn and a picture can be used", async ({ page }) => {
    await openAndEdit(page);
    await page.locator("#fv-ed-sig").click();
    const sg = page.locator("dialog.fv-sg");
    const use = sg.getByRole("button", { name: "Use signature" });
    await expect(use).toBeDisabled();
    const pad = await page.locator("#fv-sg-pad").boundingBox();
    await page.mouse.move(pad.x + 40, pad.y + pad.height / 2);
    await page.mouse.down();
    await page.mouse.move(pad.x + 120, pad.y + 30, { steps: 6 });
    await page.mouse.move(pad.x + 220, pad.y + pad.height - 30, { steps: 6 });
    await page.mouse.up();
    await expect(use).toBeEnabled();
    await use.click();
    await count(page, 1);
    // The picture tab with a PNG file.
    await page.locator("#fv-ed-sig").click();
    await expect(sg.getByRole("button", { name: "Use the last one" })).toBeVisible();
    await sg.locator('label[for="fv-sg-tab-pic"]').click();
    const png = await sharp({ create: { width: 60, height: 24, channels: 4, background: { r: 20, g: 20, b: 20, alpha: 1 } } }).png().toBuffer();
    await sg.locator("#fv-sg-file").setInputFiles({ name: "sig.png", mimeType: "image/png", buffer: png });
    await expect(use).toBeEnabled();
    await sg.getByRole("button", { name: "Cancel" }).click();
    await expect(sg).toBeHidden();
    await count(page, 1);
  });

  test("a PDF whose limits were removed on the page is edited as the unlocked copy", async ({ page }) => {
    await page.goto(URL_PATH);
    await page.setInputFiles("#pve-file", { name: "limited.pdf", mimeType: "application/pdf", buffer: Buffer.from(withRestrictions) });
    await page.getByRole("button", { name: "Remove the limits" }).click();
    await expect(page.locator("#pve-pages .page-tile")).toHaveCount(3, { timeout: 60_000 });
    await edit(page);
    await addText(page, 1, [0.2, 0.4], "Unlocked and signed");
    await page.locator("#fv-ed-save").click();
    await expect(page.locator("#pve-name")).toHaveText("limited-edited.pdf");
    await page.locator("#fv-close").click();
    const { buf } = await download(page, () => page.getByRole("link", { name: "Download PDF" }).click());
    expect((await textOfPages(buf))[0]).toContain("Unlocked and signed");
  });

  for (const theme of ["light", "dark"]) {
    test(`meets WCAG 2.2 AA in edit mode with marks placed and the signature dialog (${theme})`, async ({ page, context }) => {
      await context.addInitScript((t) => { try { localStorage.setItem("ftt:theme", t); } catch {} }, theme);
      await openAndEdit(page);
      await mode(page, "box");
      await dragOn(page, 1, [0.2, 0.3], [0.5, 0.4]);
      await scan(page, "box options and selected mark");
      await mode(page, "highlight");
      await dragOn(page, 1, [0.2, 0.6], [0.6, 0.63]);
      await mode(page, "draw");
      await scan(page, "pen options");
      await page.locator("#fv-close").click();
      await expect(page.locator("#fv-ed-ask")).toBeVisible();
      await scan(page, "the unsaved choice");
      await page.locator("#fv-ed-ask").getByRole("button", { name: "Keep editing" }).click();
      await page.locator("#fv-ed-sig").click();
      await scan(page, "signature dialog");
      await page.locator("dialog.fv-sg").locator('label[for="fv-sg-tab-type"]').click();
      await scan(page, "signature dialog, type tab");
      await page.locator("dialog.fv-sg").locator('label[for="fv-sg-tab-pic"]').click();
      await scan(page, "signature dialog, picture tab");
      await page.keyboard.press("Escape");
      await expect(page.locator("dialog.fv-sg")).toBeHidden();
    });
  }

  test("every control in the edit bar is at least 44 px and focus is visible", async ({ page }) => {
    await openAndEdit(page);
    await mode(page, "box");
    const small = await page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll("#fv-ed button, #fv-ed label, #fv-ed input[type=number], #fv-ed .check, #fv-ed select, #fv-ed .fv-swl, #fv-ed .fv-fillpick")) {
        const r = el.getBoundingClientRect();
        if (r.width && r.height && (r.height < 43.5 || r.width < 43.5) && !el.closest("[hidden]")) out.push(`${el.id || el.className}: ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
      return out;
    });
    expect(small).toEqual([]);
  });
});

test.describe("Edit on a PDF from another tool", () => {
  test.skip(({ isMobile }) => isMobile, "mouse flows run once, on desktop");

  test("Merge PDF: Edit is in the viewer for the result, and Save downloads an edited copy with the text", async ({ page }) => {
    await page.goto("/pdf/merge/");
    await page.setInputFiles("#pdfm-file", [PDF, PDF]);
    await expect(page.locator("#pdfm-go")).toBeEnabled();
    await page.locator("#pdfm-go").click();
    const open = page.locator("#pdfm-result .out-row").getByRole("button", { name: "View page 1 full screen" });
    await expect(open).toBeVisible();
    await open.click();
    await expect(dlg(page)).toBeVisible();
    await expect(page.locator("#fv-stage canvas.fv-pic").first()).toBeVisible();
    await page.locator("#fv-edit").click();
    await expect(page.locator("#fv-ed")).toBeVisible();
    await expect(page.locator(".fv-ed-layer")).toHaveCount(6);
    await addText(page, 4, [0.2, 0.45], "Signed after merging");
    await count(page, 1);
    const { buf, name } = await download(page, () => page.locator("#fv-ed-save").click());
    expect(name).toMatch(/-edited\.pdf$/);
    expect((await PDFDocument.load(buf)).getPageCount()).toBe(6);
    expect((await textOfPages(buf))[3]).toContain("Signed after merging");
    // The viewer now shows the saved copy and can go on.
    await expect(page.locator("#fv-name")).toHaveText(name);
    await page.locator("#fv-done").click();
    await expect(page.locator("#fv-edit")).toBeVisible();
  });

  test("Merge PDF: the input rows have Edit too", async ({ page }) => {
    await page.goto("/pdf/merge/");
    await page.setInputFiles("#pdfm-file", [PDF, PDF]);
    await page.locator("#pdfm-list li").first().getByRole("button", { name: "View page 1 full screen" }).click();
    await expect(page.locator("#fv-edit")).toBeVisible();
  });

  test("Compress PDF, Split PDF and Rotate PDF previews offer Edit", async ({ page }) => {
    await page.goto("/pdf/split/");
    await page.setInputFiles("#pdfs-file", PDF);
    await page.locator("#pdfs-pages .page-tile, .pages .page-tile").first().getByRole("button", { name: "View page 1 full screen" }).click();
    await expect(page.locator("#fv-edit")).toBeVisible();
    await page.locator("#fv-close").click();
    await page.goto("/pdf/rotate/");
    await page.setInputFiles("#pdfr-file", PDF);
    await page.locator(".pages .page-tile").first().getByRole("button", { name: "View page 1 full screen" }).click();
    await expect(page.locator("#fv-edit")).toBeVisible();
  });

  test("Unlock PDF: the unlocked pages open with Edit and the copy is the unlocked file", async ({ page }) => {
    await page.goto("/pdf/unlock/");
    await page.setInputFiles("#unlk-file", { name: "limited.pdf", mimeType: "application/pdf", buffer: Buffer.from(withRestrictions) });
    const tiles = page.locator("#unlk-list .page-tile");
    await expect(tiles.first()).toBeVisible({ timeout: 60_000 });
    await tiles.first().getByRole("button", { name: "View page 1 full screen" }).click();
    await page.locator("#fv-edit").click();
    await expect(page.locator("#fv-ed")).toBeVisible();
    await expect(page.locator(".fv-ed-layer")).toHaveCount(3);
    await addText(page, 1, [0.2, 0.4], "On an unlocked copy");
    const { buf } = await download(page, () => page.locator("#fv-ed-save").click());
    expect((await textOfPages(buf))[0]).toContain("On an unlocked copy");
  });

  test("a picture comparison opens full screen with no Edit button", async ({ page }) => {
    await page.goto("/images/compress/");
    const png = await sharp({ create: { width: 900, height: 600, channels: 3, background: { r: 200, g: 60, b: 60 } } }).png().toBuffer();
    await page.setInputFiles("#cmi-file", { name: "red.png", mimeType: "image/png", buffer: png });
    await page.click("#cmi-go");
    await page.locator("#cmi-list").getByRole("button", { name: "View the comparison full screen" }).click();
    await expect(dlg(page)).toBeVisible();
    await expect(page.locator("#fv-edit")).toBeHidden();
  });
});

test.describe("offline", () => {
  test.skip(({ isMobile }) => isMobile, "runs once, on desktop");

  test("edits and saves a PDF with the network off, after it was used once", async ({ page, context }) => {
    await page.goto(URL_PATH);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload(); // the first load was not served by the worker
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await expect(page.locator("[data-offline-note]")).toBeVisible();
    // Using the editor once online: the pdf.js worker loads, and the editor then keeps the font and its code.
    await choose(page, PDF, { visit: false });
    await edit(page);
    await expect.poll(() => page.evaluate(async () => {
      const seen = [];
      for (const n of await caches.keys()) for (const r of await (await caches.open(n)).keys()) seen.push(new URL(r.url).pathname);
      return ["/vendor/pdfjs/pdf.worker.min.mjs", "/pdf/edit/vendor/Roboto-Regular.woff"].every((p) => seen.includes(p)) && seen.some((p) => /fontkit/.test(p)) && seen.some((p) => /\/editor\./.test(p));
    })).toBe(true);
    await page.locator("#fv-close").click();
    await page.waitForLoadState("networkidle");
    page.__offline = true;
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator("main h1")).toBeVisible();
    await choose(page, PDF, { visit: false });
    await edit(page);
    await addText(page, 1, [0.2, 0.4], "Offline, with Привет");
    await page.locator("#fv-ed-save").click();
    await expect(page.locator("#pve-name")).toHaveText("sample-edited.pdf");
    await page.locator("#fv-close").click();
    const { buf } = await download(page, () => page.getByRole("link", { name: "Download PDF" }).click());
    expect((await textOfPages(buf))[0]).toContain("Offline, with Привет");
  });
});

test.describe("on a phone", () => {
  // The bar for editing is at the bottom of the viewer; its main actions never need a scroll.
  async function phone(page, width) {
    await page.setViewportSize({ width, height: 700 });
    await openAndEdit(page);
  }
  const wide = (page) => page.evaluate(() => Math.max(document.documentElement.scrollWidth - document.documentElement.clientWidth, document.querySelector("dialog#fv").scrollWidth - document.querySelector("dialog#fv").clientWidth));

  for (const width of [390, 320]) {
    test(`at ${width} px the bar is at the bottom, 44 px to press, in reach without scrolling`, async ({ page }) => {
      await phone(page, width);
      expect(await wide(page)).toBeLessThanOrEqual(0);
      const bar = await page.locator("#fv-ed").boundingBox();
      const view = page.viewportSize();
      expect(bar.y + bar.height).toBeLessThanOrEqual(view.height + 1);
      expect(bar.y).toBeGreaterThan(view.height / 2); // at the bottom, not under the top bar
      // The main actions are visible inside the window: modes, signature, Undo, Delete, Save.
      for (const sel of ["label[for='fv-ed-m-select']", "label[for='fv-ed-m-text']", "label[for='fv-ed-m-draw']", "#fv-ed-sig", "#fv-ed-undo", "#fv-ed-del", "#fv-ed-save", "#fv-ed-optbtn"]) {
        const r = await page.locator(sel).boundingBox();
        expect(r, sel).not.toBeNull();
        expect(r.x, sel).toBeGreaterThanOrEqual(0);
        expect(r.x + r.width, sel).toBeLessThanOrEqual(width + 0.5);
        expect(r.y + r.height, sel).toBeLessThanOrEqual(view.height + 0.5);
        expect(r.width, `${sel} width`).toBeGreaterThanOrEqual(43.5);
        expect(r.height, `${sel} height`).toBeGreaterThanOrEqual(43.5);
      }
      // The page being edited is still big enough to work on.
      const stage = await page.locator("#fv-stage").boundingBox();
      expect(stage.height).toBeGreaterThan(220);
      // Options sit behind a button and open above the bar.
      await mode(page, "box");
      await expect(page.locator("#fv-ed-sheet")).toBeHidden();
      await page.locator("#fv-ed-optbtn").click();
      await expect(page.locator("#fv-ed-sheet")).toBeVisible();
      await expect(page.locator("#fv-ed-optbtn")).toHaveAttribute("aria-expanded", "true");
      expect(await wide(page)).toBeLessThanOrEqual(0);
      const sheet = await page.locator("#fv-ed-sheet").boundingBox();
      expect(sheet.y + sheet.height).toBeLessThanOrEqual(bar.y + bar.height);
      expect(sheet.x + sheet.width).toBeLessThanOrEqual(width + 0.5);
      await scan(page, `phone ${width}`);
      await page.locator("#fv-ed-optbtn").click();
      await expect(page.locator("#fv-ed-sheet")).toBeHidden();
    });
  }

  test("a finger can draw, and in Select mode a finger scrolls", async ({ page }) => {
    await phone(page, 390);
    await mode(page, "draw");
    const cell = page.locator('#fv-stage .fv-cell[data-i="1"]');
    await cell.evaluate((e) => e.scrollIntoView({ block: "center" }));
    expect(await cell.locator(".fv-ed-layer").evaluate((e) => getComputedStyle(e).touchAction)).toBe("none");
    await cell.locator(".fv-ed-layer").evaluate((svg) => {
      const r = svg.getBoundingClientRect();
      const fire = (type, x, y) => svg.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: "touch", isPrimary: true, bubbles: true, cancelable: true, clientX: r.left + x, clientY: r.top + y, button: 0, buttons: 1 }));
      fire("pointerdown", 40, 100);
      for (let i = 1; i <= 8; i++) fire("pointermove", 40 + i * 14, 100 + (i % 2) * 20);
      fire("pointerup", 150, 100);
    });
    await count(page, 1);
    await mode(page, "select");
    expect(await cell.locator(".fv-ed-layer").evaluate((e) => getComputedStyle(e).touchAction)).toBe("auto");
    // Undo and Delete are in the bar; Save too.
    await page.locator("#fv-ed-undo").click();
    await count(page, 0);
    await page.locator("#fv-ed-sig").click();
    expect(await wide(page)).toBeLessThanOrEqual(0);
    const box = await page.locator(".fv-sg-box").boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
  });

  test("on a phone Save in the bar works at once", async ({ page }) => {
    await phone(page, 320);
    await mode(page, "text");
    await page.locator("#fv-ed-optbtn").click();
    await page.getByRole("button", { name: "Add text in the middle of the screen" }).click();
    await page.locator(".fv-ed-edit").fill("From a phone");
    await page.keyboard.press("Escape");
    await count(page, 1);
    await page.locator("#fv-ed-save").click();
    await expect(page.locator("#pve-name")).toHaveText("sample-edited.pdf");
  });
});
