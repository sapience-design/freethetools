import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

// Files dropped anywhere on a tool page, or pasted, reach its file input (src/lib/page-files.ts).
const PDF = [...readFileSync("tools/pdf/compress/tests/fixtures/sample.pdf")];

test.beforeEach(async ({ page }) => {
  const problems = [];
  page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" || /Content Security Policy/i.test(m.text())) problems.push(`console: ${m.text()}`); });
  page.__problems = problems;
});
test.afterEach(async ({ page }) => expect(page.__problems).toEqual([]));

test.describe("Drop or paste a file anywhere", () => {
  test.skip(({ isMobile }) => isMobile, "dragging files and pasting with a keyboard are computer gestures");

  /** Count "change" events on a file input, so a file taken twice would show. */
  const countChanges = (page, id) => page.evaluate((id) => {
    window.__changes = 0;
    document.getElementById(id).addEventListener("change", () => window.__changes++);
  }, id);
  const changes = (page) => page.evaluate(() => window.__changes);

  /** Drop or paste one PDF on the element that matches `selector`, as a browser would. */
  const send = (page, kind, selector) => page.evaluate(({ kind, selector, bytes }) => {
    const box = new DataTransfer();
    box.items.add(new File([new Uint8Array(bytes)], "sample.pdf", { type: "application/pdf" }));
    const el = document.querySelector(selector);
    if (kind === "paste") el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: box, bubbles: true, cancelable: true }));
    else for (const type of ["dragenter", "dragover", "drop"]) el.dispatchEvent(new DragEvent(type, { dataTransfer: box, bubbles: true, cancelable: true }));
  }, { kind, selector, bytes: PDF });

  test("a PDF dropped beside the drop area is taken, once, and the page stays", async ({ page }) => {
    await page.goto("/pdf/compress/");
    await countChanges(page, "pdfc-file");
    await send(page, "drop", "h1");
    await expect(page.locator("#pdfc-picked li")).toHaveCount(1);
    await expect(page.locator("#pdfc-picked")).toContainText("sample.pdf");
    expect(await changes(page)).toBe(1);
    await expect(page).toHaveURL(/\/pdf\/compress\/$/);
  });

  test("a PDF dropped on the drop area is taken once, as before", async ({ page }) => {
    await page.goto("/pdf/compress/");
    await countChanges(page, "pdfc-file");
    await send(page, "drop", "#pdfc-drop");
    await expect(page.locator("#pdfc-picked li")).toHaveCount(1);
    expect(await changes(page)).toBe(0); // the drop area took it itself; the page did not add it again
  });

  test("a pasted PDF is taken", async ({ page }) => {
    await page.goto("/pdf/compress/");
    await countChanges(page, "pdfc-file");
    await send(page, "paste", "body");
    await expect(page.locator("#pdfc-picked li")).toHaveCount(1);
    expect(await changes(page)).toBe(1);
  });

  test("a paste into a text field is left to the field", async ({ page }) => {
    await page.goto("/pdf/protect/");
    await countChanges(page, "ppw-file");
    await send(page, "paste", "#ppw-pw");
    await page.waitForTimeout(500);
    expect(await changes(page)).toBe(0);
    await expect(page.locator("#ppw-picked")).toBeHidden(); // its one row is markup, shown once a file is in
  });

  test("with a dialog open, a dropped file is not taken", async ({ page }) => {
    await page.goto("/pdf/compress/");
    await countChanges(page, "pdfc-file");
    await page.evaluate(() => (document.getElementById("sg")).showModal());
    await send(page, "drop", "h1");
    await page.waitForTimeout(500);
    expect(await changes(page)).toBe(0);
  });

  /** Hold a file over the heading, as a drag in progress does. */
  const dragOver = (page) => page.evaluate(() => {
    const box = new DataTransfer();
    box.items.add(new File(["%PDF-1.4"], "a.pdf", { type: "application/pdf" }));
    document.querySelector("h1").dispatchEvent(new DragEvent("dragover", { dataTransfer: box, bubbles: true, cancelable: true }));
  });

  test("dragging a file over the page shows the drop overlay, and the drop hides it", async ({ page }) => {
    await page.goto("/pdf/compress/");
    const overlay = page.locator("#pdfc-overlay");
    await expect(overlay).toBeHidden();
    await dragOver(page);
    await expect(overlay).toBeVisible();
    await expect(overlay).toContainText("Drop your PDF here");
    await send(page, "drop", "h1");
    await expect(overlay).toBeHidden();
    await expect(page.locator("#pdfc-picked li")).toHaveCount(1);
  });

  test("the overlay goes by itself when the drag leaves the page", async ({ page }) => {
    await page.goto("/pdf/compress/");
    await dragOver(page);
    await expect(page.locator("#pdfc-overlay")).toBeVisible();
    await expect(page.locator("#pdfc-overlay")).toBeHidden({ timeout: 3000 });
  });

  test("the drop area says pasting works, with this computer's key", async ({ page }) => {
    await page.goto("/pdf/compress/");
    await expect(page.locator("#pdfc-drop .drop-paste")).toBeVisible();
    await expect(page.locator("#pdfc-drop [data-paste-key]")).toHaveText(/^(Ctrl|Cmd)\+V$/);
  });
});
