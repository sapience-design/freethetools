// A locked PDF in the PDF tools: ask for the password (or offer to lift limits) in the file's row,
// unlock in the browser with qpdf, then carry on. Fixtures come from tools/pdf/unlock/tests/helpers.js.
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { PDFDocument } from "pdf-lib";
import { OPEN_PASSWORD, plain, withPassword, withRestrictions } from "../tools/pdf/unlock/tests/helpers.js";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const pdfFile = (name, bytes) => ({ name, mimeType: "application/pdf", buffer: Buffer.from(bytes) });
const locked = pdfFile("locked.pdf", withPassword);
const limited = pdfFile("limited.pdf", withRestrictions);
const open = pdfFile("open.pdf", plain);
const SAY = "This PDF is locked. Enter its password to use it here. The password stays on this device.";
const LIMITS = "This PDF has limits on changes, such as printing or copying. Remove them for this job? Only do this for files you own or may change.";

// Every test fails on a page error, a request to another origin, or a CSP violation.
test.beforeEach(async ({ page }) => {
  const problems = [];
  const seen = [];
  page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" || /Content Security Policy/i.test(m.text())) problems.push(`console: ${m.text()}`); });
  page.on("request", (r) => {
    seen.push(r.url());
    const u = new URL(r.url());
    if (u.protocol.startsWith("http") && u.hostname !== new URL(test.info().project.use.baseURL).hostname) problems.push(`offsite: ${r.url()}`);
  });
  page.__problems = problems;
  page.__requests = seen;
});
test.afterEach(async ({ page }) => expect(page.__problems).toEqual([]));

async function download(page, trigger) {
  const [d] = await Promise.all([page.waitForEvent("download"), trigger()]);
  return readFileSync(await d.path());
}

const qpdfRequests = (page) => page.__requests.filter((u) => /qpdf/.test(u));

test.describe("Merge PDF with a locked file", () => {
  test("qpdf stays unloaded until a locked PDF appears", async ({ page }) => {
    await page.goto("/pdf/merge/");
    await page.setInputFiles("#pdfm-file", [open, open]);
    await expect(page.locator("#pdfm-list li")).toHaveCount(2);
    expect(qpdfRequests(page)).toEqual([]);
    await expect(page.locator(".pwx-list")).toHaveCount(0);
  });

  test("asks for the password, rejects a wrong one, and merges after the right one", async ({ page }) => {
    await page.goto("/pdf/merge/");
    await page.setInputFiles("#pdfm-file", [open, locked]);
    const row = page.locator(".pwx-list li");
    await expect(row).toContainText(SAY);
    await expect(page.locator("#pdfm-list li")).toHaveCount(1); // only the open file so far
    await expect(page.locator("#pdfm-result .tool-error, #pdfm-result .res-bad")).toHaveCount(0); // no "We can't open this PDF"
    const field = page.getByLabel("Password for locked.pdf");
    await expect(field).toHaveAttribute("type", "password");
    await expect(field).toHaveAttribute("autocomplete", "off");
    await expect(row.getByRole("link", { name: "Use Unlock PDF." })).toHaveAttribute("href", "/pdf/unlock/");
    await expect(row).toContainText("Want a saved copy without the password?");

    await field.fill("not-the-password");
    await row.getByRole("button", { name: "Use password" }).click();
    await expect(row.locator(".tool-error")).toContainText("That password doesn't open this PDF");
    await expect(field).toHaveValue("");
    await expect(field).toBeFocused();
    expect(await page.content()).not.toContain("not-the-password");

    await field.fill(OPEN_PASSWORD);
    await row.getByRole("button", { name: "Use password" }).click();
    await expect(page.locator(".pwx-list")).toHaveCount(0);
    await expect(page.locator("#pdfm-list li")).toHaveCount(2);
    expect(await page.content()).not.toContain(OPEN_PASSWORD);

    await page.getByRole("button", { name: /Combine 2 PDFs/ }).click();
    const out = await download(page, () => page.getByRole("link", { name: "Download PDF" }).click());
    expect((await PDFDocument.load(out)).getPageCount()).toBe(6); // 3 + 3, and pdf-lib opens it
    expect(qpdfRequests(page).length).toBeGreaterThan(0);
  });

  test("a PDF with only limits asks to lift them, then works", async ({ page }) => {
    await page.goto("/pdf/merge/");
    await page.setInputFiles("#pdfm-file", [open, limited]);
    const row = page.locator(".pwx-list li");
    await expect(row).toContainText(LIMITS);
    await expect(row.getByRole("link", { name: "Use Unlock PDF." })).toHaveAttribute("href", "/pdf/unlock/");
    await row.getByRole("button", { name: "Remove the limits" }).click();
    await expect(page.locator("#pdfm-list li")).toHaveCount(2);
    await page.getByRole("button", { name: /Combine 2 PDFs/ }).click();
    const out = await download(page, () => page.getByRole("link", { name: "Download PDF" }).click());
    expect((await PDFDocument.load(out)).getPageCount()).toBe(6);
  });

  test("the prompt passes axe", async ({ page }) => {
    await page.goto("/pdf/merge/");
    await page.setInputFiles("#pdfm-file", [open, locked, limited]);
    await expect(page.locator(".pwx-list li")).toHaveCount(2);
    await page.getByLabel("Password for locked.pdf").fill("x");
    await page.locator(".pwx-list").getByRole("button", { name: "Use password" }).click();
    await expect(page.locator(".pwx-list .tool-error")).toBeVisible();
    const { violations } = await new AxeBuilder({ page })
      .options({ runOnly: { type: "tag", values: WCAG }, rules: { "label-content-name-mismatch": { enabled: true } } })
      .analyze();
    const summary = violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).slice(0, 4).join(" | ")}`);
    expect(summary, summary.join("\n")).toEqual([]);
  });
});

test.describe("other PDF tools with a locked file", () => {
  test("Split PDF asks for the password and then splits", async ({ page }) => {
    await page.goto("/pdf/split/");
    await page.setInputFiles("#pdfs-file", locked);
    await expect(page.locator(".pwx-list li")).toContainText(SAY);
    await expect(page.getByRole("link", { name: "Use Unlock PDF." })).toHaveAttribute("href", "/pdf/unlock/");
    await page.getByLabel("Password for locked.pdf").fill(OPEN_PASSWORD);
    await page.getByRole("button", { name: "Use password" }).click();
    await expect(page.locator("#pdfs-name")).toHaveText("locked.pdf");
    await expect(page.locator("#pdfs-go")).toBeEnabled();
    await expect(page.locator(".pwx-list")).toHaveCount(0);
  });

  test("Compress PDF asks for the password and compresses the unlocked copy", async ({ page }) => {
    await page.goto("/pdf/compress/");
    await page.setInputFiles("#pdfc-file", locked);
    await expect(page.locator(".pwx-list li")).toContainText(SAY);
    await page.getByLabel("Password for locked.pdf").fill(OPEN_PASSWORD);
    await page.getByRole("button", { name: "Use password" }).click();
    await expect(page.locator("#pdfc-picked li")).toHaveCount(1);
    await page.locator("#pdfc-go").click();
    await expect(page.getByRole("link", { name: "Download" }).first()).toBeVisible({ timeout: 60_000 });
    await expect(page.locator("#pdfc-results .err")).toHaveCount(0);
  });

  test("Rotate PDF lifts limits on request", async ({ page }) => {
    await page.goto("/pdf/rotate/");
    await page.setInputFiles("#pdfr-file", limited);
    await expect(page.locator(".pwx-list li")).toContainText(LIMITS);
    await page.getByRole("button", { name: "Remove the limits" }).click();
    await expect(page.locator("#pdfr-name")).toHaveText("limited.pdf");
    await expect(page.locator("#pdfr-go")).toBeEnabled();
  });

  for (const [path, prefix] of [["/pdf/fill-form/", "pff"], ["/pdf/to-images/", "p2i"]]) {
    test(`${path} shows the prompt for a locked PDF`, async ({ page }) => {
      await page.goto(path);
      await page.setInputFiles(`#${prefix}-file`, locked);
      await expect(page.locator(".pwx-list li")).toContainText(SAY);
      await expect(page.getByLabel("Password for locked.pdf")).toBeVisible();
    });
  }
});
