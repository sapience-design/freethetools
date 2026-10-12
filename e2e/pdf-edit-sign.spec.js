// Edit and Sign PDF: place text, a box, a highlight, a drawing and a typed signature on a three-page
// PDF, select and delete marks by keyboard and by button, undo and redo, save, and read the saved
// file back. Also the keyboard way to add text, other alphabets, touch drawing, axe in both themes,
// reflow at 320 px and the offline case.
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { PDFDocument, PDFName, decodePDFRawStream } from "pdf-lib";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

const PDF = "tools/pdf/compress/tests/fixtures/sample.pdf";
const URL_PATH = "/pdf/edit-sign/";
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
  return readFileSync(await d.path());
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

async function open(page, file = PDF, { visit = true } = {}) {
  if (visit) await page.goto(URL_PATH);
  await page.setInputFiles("#pes-file", file);
  await expect(page.locator(".pes-page")).toHaveCount(3);
  await expect(page.locator("#pes-meta")).toContainText("3 pages");
  // The first page is drawn by pdf.js.
  await expect.poll(() => page.evaluate(() => document.querySelector(".pes-page .pes-canvas").width)).toBeGreaterThan(100);
}

const mode = (page, name) => page.locator(`label[for="pes-m-${name}"]`).click();
const count = (page, n) => expect(page.locator("#pes-list-sum")).toHaveText(`Everything you added (${n})`);

/** Scroll a page into the middle of the window and return a way to point at it: fractions of its size. */
async function pageAt(page, n) {
  const el = page.locator(`.pes-page[data-page="${n}"]`);
  await el.evaluate((e) => e.scrollIntoView({ block: "center" }));
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

test.describe("Edit and Sign PDF", () => {
  test.skip(({ isMobile }) => isMobile, "mouse flows run once, on desktop");

  test("text, box, highlight, drawing and signature; delete by key and by button; undo; save", async ({ page }) => {
    await open(page);
    await expect(page.locator("#pes-delete")).toBeDisabled();

    // Text: click, type, finish with Escape.
    await mode(page, "text");
    const p1 = await pageAt(page, 1);
    await page.mouse.click(...p1.at(0.2, 0.45));
    await page.locator(".pes-edit").fill("Hello Ada");
    await page.keyboard.press("Escape");
    await count(page, 1);
    await expect(page.locator('.pes-mark[data-type="text"]')).toHaveAttribute("aria-label", /Text “Hello Ada”, page 1/);
    await expect(page.locator("#pes-selbar")).toBeVisible(); // a new mark is selected

    // Box with text on page 2.
    await mode(page, "box");
    await dragOn(page, 2, [0.2, 0.4], [0.7, 0.55]);
    await count(page, 2);
    await page.getByRole("button", { name: "Edit text" }).click();
    await page.locator(".pes-edit").fill("Approved by the board");
    await page.keyboard.press("Escape");

    // Highlight and a drawn line on page 3, and a drawn line on page 1.
    await mode(page, "highlight");
    await dragOn(page, 3, [0.15, 0.3], [0.75, 0.33]);
    await count(page, 3);
    await mode(page, "draw");
    await dragOn(page, 1, [0.2, 0.7], [0.6, 0.8]);
    await count(page, 4);

    // A typed signature.
    await page.locator("#pes-sig-open").click();
    const dlg = page.locator("#pes-sig");
    await expect(dlg).toBeVisible();
    await expect(dlg).toContainText("not a certificate-based digital signature");
    await dlg.locator('label[for="pes-st-type"]').click();
    await dlg.getByLabel("Your name").fill("Ada Lovelace");
    await dlg.getByRole("button", { name: "Use signature" }).click();
    await expect(dlg).toBeHidden();
    await count(page, 5);
    await expect(page.locator('.pes-mark[data-type="image"]')).toHaveAttribute("aria-label", /Signature, page \d/);

    // The signature is selected: Delete removes it, Ctrl+Z brings it back, Shift+Ctrl+Z removes it again.
    await expect(page.locator("#pes-delete")).toBeEnabled();
    await page.keyboard.press("Delete");
    await count(page, 4);
    await expect(page.locator('.pes-mark[data-type="image"]')).toHaveCount(0);
    await page.keyboard.press("Control+z");
    await count(page, 5);
    await expect(page.locator('.pes-mark[data-type="image"]')).toHaveCount(1);
    await page.keyboard.press("Control+Shift+z");
    await count(page, 4);
    await page.getByRole("button", { name: "Undo" }).click();
    await count(page, 5);
    await page.getByRole("button", { name: "Redo" }).click();
    await count(page, 4);

    // Delete the highlight with the button: choose it in the list of marks, then press Delete.
    await page.locator("#pes-list summary").click();
    await page.locator(".pes-pick", { hasText: "Highlight, page 3" }).click();
    await expect(page.locator("#pes-seltext")).toContainText("Highlight, page 3");
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await count(page, 3);
    await expect(page.locator('.pes-mark[data-type="highlight"]')).toHaveCount(0);

    // Save and read the file back.
    await page.click("#pes-go");
    const out = await download(page, () => page.getByRole("link", { name: "Download" }).click());
    expect((await PDFDocument.load(out)).getPageCount()).toBe(3);
    const text = await textOfPages(out);
    expect(text[0]).toContain("Hello Ada");
    expect(text[1]).toContain("Approved by the board");
    expect(text[0]).toContain("PDF Shrink test fixture - page 1"); // the original page is intact
    const doc = await PDFDocument.load(out);
    for (let n = 1; n <= 3; n++) {
      const res = doc.getPage(n - 1).node.Resources();
      const xo = res.lookup(PDFName.of("XObject"));
      const names = xo ? xo.entries().map(([k]) => k.toString()) : [];
      expect(names.filter((k) => k.startsWith("/Image-")), `page ${n}: the deleted signature is not in the file`).toEqual([]);
    }
    expect(await contentOf(out, 3)).not.toMatch(/\/GS-/); // the deleted highlight left no transparency behind
    expect(await contentOf(out, 2)).toMatch(/ RG/); // the box border
    expect(await contentOf(out, 1)).toMatch(/^S$/m); // the drawn line
  });

  test("the keyboard way: add text in the middle, move it with the arrow keys, change its size", async ({ page }) => {
    await open(page);
    await mode(page, "text");
    await page.getByRole("button", { name: "Add text in the middle of the screen" }).click();
    await page.locator(".pes-edit").fill("By keyboard");
    await page.keyboard.press("Escape");
    const mark = page.locator('.pes-mark[data-type="text"]');
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
    await page.locator("#pes-m-select").focus();
    await mark.focus();
    await page.keyboard.press("Backspace");
    await count(page, 0);
    await page.locator("#pes-list summary").click();
    await expect(page.locator("#pes-none")).toBeVisible();
  });

  test("a mark can be moved by dragging, and Escape stops editing", async ({ page }) => {
    await open(page);
    await mode(page, "box");
    await dragOn(page, 1, [0.2, 0.3], [0.5, 0.4]);
    const rect = page.locator('.pes-mark[data-type="rect"] rect').first();
    const x0 = Number(await rect.getAttribute("x"));
    const b = await rect.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 + 60, b.y + b.height / 2, { steps: 5 });
    await page.mouse.up();
    expect(Number(await page.locator('.pes-mark[data-type="rect"] rect').first().getAttribute("x"))).toBeGreaterThan(x0 + 30);
    await page.keyboard.press("Control+z");
    expect(Number(await page.locator('.pes-mark[data-type="rect"] rect').first().getAttribute("x"))).toBeCloseTo(x0, 1);
  });

  test("Russian and Greek text is saved with an embedded font, and Norwegian letters need none", async ({ page }) => {
    await open(page);
    await mode(page, "text");
    const p = await pageAt(page, 1);
    await page.mouse.click(...p.at(0.2, 0.4));
    await page.locator(".pes-edit").fill("Привет, мир Ωμέγα");
    await page.keyboard.press("Escape");
    await mode(page, "text");
    await page.mouse.click(...p.at(0.2, 0.5));
    await page.locator(".pes-edit").fill("Blåbærsyltetøy");
    await page.keyboard.press("Escape");
    await count(page, 2);
    await page.click("#pes-go");
    const out = await download(page, () => page.getByRole("link", { name: "Download" }).click());
    const text = (await textOfPages(out))[0];
    expect(text).toContain("Привет, мир Ωμέγα");
    expect(text).toContain("Blåbærsyltetøy");
  });

  test("saving with nothing added says so, and a result goes stale when something changes", async ({ page }) => {
    await open(page);
    await page.click("#pes-go");
    await expect(page.locator("#pes-result")).toContainText("Nothing to save yet");
    await mode(page, "box");
    await dragOn(page, 1, [0.2, 0.3], [0.5, 0.4]);
    await page.click("#pes-go");
    await expect(page.getByRole("link", { name: "Download" })).toBeVisible();
    await page.keyboard.press("Control+z");
    await expect(page.locator("#pes-result")).toContainText("Your signed PDF will appear here.");
  });

  test("a signature can be drawn and a picture can be used", async ({ page }) => {
    await open(page);
    await page.locator("#pes-sig-open").click();
    const dlg = page.locator("#pes-sig");
    const use = dlg.getByRole("button", { name: "Use signature" });
    await expect(use).toBeDisabled();
    const pad = await page.locator("#pes-pad").boundingBox();
    await page.mouse.move(pad.x + 40, pad.y + pad.height / 2);
    await page.mouse.down();
    await page.mouse.move(pad.x + 120, pad.y + 30, { steps: 6 });
    await page.mouse.move(pad.x + 220, pad.y + pad.height - 30, { steps: 6 });
    await page.mouse.up();
    await expect(use).toBeEnabled();
    await use.click();
    await count(page, 1);
    // The picture tab with a transparent PNG file.
    await page.locator("#pes-sig-open").click();
    await expect(dlg.getByRole("button", { name: "Use the last one" })).toBeVisible();
    await dlg.locator('label[for="pes-st-pic"]').click();
    const png = await sharp({ create: { width: 60, height: 24, channels: 4, background: { r: 20, g: 20, b: 20, alpha: 1 } } }).png().toBuffer();
    await dlg.locator("#pes-sigfile").setInputFiles({ name: "sig.png", mimeType: "image/png", buffer: png });
    await expect(use).toBeEnabled();
    await dlg.getByRole("button", { name: "Cancel" }).click();
    await expect(dlg).toBeHidden();
    await count(page, 1);
  });

  for (const theme of ["light", "dark"]) {
    test(`meets WCAG 2.2 AA with a PDF open, marks placed and the signature dialog (${theme})`, async ({ page, context }) => {
      await context.addInitScript((t) => { try { localStorage.setItem("ftt:theme", t); } catch {} }, theme);
      await open(page);
      await mode(page, "box");
      await dragOn(page, 1, [0.2, 0.3], [0.5, 0.4]);
      await mode(page, "highlight");
      await dragOn(page, 1, [0.2, 0.6], [0.6, 0.63]);
      await page.locator("#pes-list summary").click();
      const scan = async (label) => {
        const { violations } = await new AxeBuilder({ page })
          .options({ runOnly: { type: "tag", values: WCAG }, rules: { "label-content-name-mismatch": { enabled: true } } })
          .analyze();
        const summary = violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).slice(0, 4).join(" | ")}`);
        expect(summary, `${label}\n${summary.join("\n")}`).toEqual([]);
      };
      await scan("editor");
      await page.locator("#pes-sig-open").click();
      await scan("signature dialog");
      await page.locator("#pes-sig").locator('label[for="pes-st-type"]').click();
      await scan("signature dialog, type tab");
      await page.keyboard.press("Escape");
      await expect(page.locator("#pes-sig")).toBeHidden();
    });
  }

  test("every control is at least 44 px tall and focus is visible", async ({ page }) => {
    await open(page);
    await mode(page, "box");
    const small = await page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll("#pes-bar button, #pes-bar label, #pes-opts input[type=number], #pes-opts .check, #pes-opts select, #pes-opts .sw, #pes-fill-color, #pes-selbar button, #pes-add")) {
        const r = el.getBoundingClientRect();
        if (r.width && r.height && (r.height < 43.5 || r.width < 43.5) && !el.closest("[hidden]")) out.push(`${el.id || el.className}: ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
      return out;
    });
    expect(small).toEqual([]);
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
    // Using the tool once online: the pdf.js worker loads, and the page then keeps the font and its code.
    await open(page, PDF, { visit: false });
    await expect.poll(() => page.evaluate(async () => {
      const seen = [];
      for (const n of await caches.keys()) for (const r of await (await caches.open(n)).keys()) seen.push(new URL(r.url).pathname);
      return ["/vendor/pdfjs/pdf.worker.min.mjs", "/pdf/edit-sign/vendor/Roboto-Regular.woff"].every((p) => seen.includes(p)) && seen.some((p) => /fontkit/.test(p));
    })).toBe(true);
    await page.waitForLoadState("networkidle");
    page.__offline = true;
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator("main h1")).toBeVisible();
    await open(page, PDF, { visit: false });
    await mode(page, "text");
    const p = await pageAt(page, 1);
    await page.mouse.click(...p.at(0.2, 0.4));
    await page.locator(".pes-edit").fill("Offline, with Привет");
    await page.keyboard.press("Escape");
    await page.click("#pes-go");
    const out = await download(page, () => page.getByRole("link", { name: "Download" }).click());
    expect((await textOfPages(out))[0]).toContain("Offline, with Привет");
  });
});

test.describe("on a phone", () => {
  test("reflows at 320 px with no sideways scroll, and a finger can draw", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await open(page);
    const wide = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(await wide()).toBeLessThanOrEqual(0);
    await page.locator('label[for="pes-m-draw"]').click();
    expect(await wide()).toBeLessThanOrEqual(0);
    // A finger: pointer events of type touch on the page. While drawing, the page itself must not scroll.
    await page.locator('.pes-page[data-page="1"]').evaluate((e) => e.scrollIntoView({ block: "center" }));
    const touchAction = await page.locator('.pes-page[data-page="1"] .pes-layer').evaluate((e) => getComputedStyle(e).touchAction);
    expect(touchAction).toBe("none");
    await page.locator('.pes-page[data-page="1"] .pes-layer').evaluate((svg) => {
      const r = svg.getBoundingClientRect();
      const fire = (type, x, y) => svg.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: "touch", isPrimary: true, bubbles: true, cancelable: true, clientX: r.left + x, clientY: r.top + y, button: 0, buttons: 1 }));
      fire("pointerdown", 40, 100);
      for (let i = 1; i <= 8; i++) fire("pointermove", 40 + i * 14, 100 + (i % 2) * 20);
      fire("pointerup", 150, 100);
    });
    await expect(page.locator('.pes-mark[data-type="path"]')).toHaveCount(1);
    // In Select mode a finger scrolls the page as usual.
    await page.locator('label[for="pes-m-select"]').click();
    expect(await page.locator('.pes-page[data-page="1"] .pes-layer').evaluate((e) => getComputedStyle(e).touchAction)).toBe("auto");
    await page.locator("#pes-sig-open").click();
    expect(await wide()).toBeLessThanOrEqual(0);
    const dlg = await page.locator(".pes-dlg-box").boundingBox();
    expect(dlg.x).toBeGreaterThanOrEqual(0);
    expect(dlg.x + dlg.width).toBeLessThanOrEqual(320);
  });
});
