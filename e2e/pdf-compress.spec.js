import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { makePdf } from "../tools/pdf/compress/tests/helpers.js";

// The size shown on each choice, and the "More options" list of Compress PDF.
const FIXTURE = "tools/pdf/compress/tests/fixtures/sample.pdf";
const PHOTO = { name: "photo.pdf", mimeType: "application/pdf", buffer: makePdf() };

// Same rounding as the page: KB from 1 KB up, bytes below.
const fmt = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(2)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`);
const est = (page, preset) => page.locator(`[data-est="${preset}"] [aria-hidden="true"]`);
// The first number in the text, as bytes: "8 KB (−93%)" -> "8 KB".
const sizeOf = async (page, preset) => ((await est(page, preset).textContent()) ?? "").match(/^[\d.]+ (?:KB|MB|B)/)?.[0];

test.beforeEach(async ({ page }) => {
  const problems = [];
  page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" || /Content Security Policy/i.test(m.text())) problems.push(`console: ${m.text()}`); });
  page.__problems = problems;
});
test.afterEach(async ({ page }) => expect(page.__problems).toEqual([]));

test.describe("Compress PDF sizes", () => {
  // Each test runs Ghostscript several times. One at a time, in one worker, so they do not starve the
  // tests running beside them of CPU (Merge PDF's password checks timed out when four ran at once).
  test.describe.configure({ mode: "default" });
  test.skip(({ isMobile }) => isMobile, "file flows run once, on desktop");

  test("the chosen option shows its size, and the Make it smaller button is not held back", async ({ page }) => {
    await page.goto("/pdf/compress/");
    await page.setInputFiles("#pdfc-file", FIXTURE);
    await expect(page.locator("#pdfc-go")).toBeEnabled();
    await expect(est(page, "ebook")).toHaveText(/^\d+ KB \(−\d+%\)$/, { timeout: 30_000 });
    // A small file: the other three follow without a click.
    await expect(est(page, "screen")).toHaveText(/\(−\d+%\)/, { timeout: 30_000 });
    const screen = Number.parseInt(await sizeOf(page, "screen"), 10);
    await page.locator('label[for="pdfc-p-printer"]').click();
    await expect(est(page, "printer")).toHaveText(/\(−\d+%\)/, { timeout: 30_000 });
    expect(screen).toBeLessThan(Number.parseInt(await sizeOf(page, "printer"), 10));
    // Screen readers get a sentence, once.
    await expect(page.locator('[data-est="printer"] .sr-only')).toHaveText(/\d+ KB, \d+% smaller/);
    await expect(page.locator("#pdfc-announce")).toHaveText(/^For printing: \d+ KB, \d+% smaller\.$/);
  });

  test("a new file clears the old sizes", async ({ page }) => {
    await page.goto("/pdf/compress/");
    await page.setInputFiles("#pdfc-file", FIXTURE);
    await expect(est(page, "ebook")).toHaveText(/\(−\d+%\)/, { timeout: 30_000 });
    const first = await sizeOf(page, "ebook");
    await page.getByRole("button", { name: /^Remove sample\.pdf/ }).click();
    await expect(page.locator('[data-est="ebook"] *')).toHaveCount(0);
    await page.setInputFiles("#pdfc-file", PHOTO);
    await expect(est(page, "ebook")).toHaveText(/\(−\d+%\)/, { timeout: 30_000 });
    expect(await sizeOf(page, "ebook")).not.toBe(first);
  });

  test("with several files, the sizes say they are for the first", async ({ page }) => {
    await page.goto("/pdf/compress/");
    await page.setInputFiles("#pdfc-file", [{ name: "sample.pdf", mimeType: "application/pdf", buffer: readFileSync(FIXTURE) }, PHOTO]);
    await expect(page.locator("#pdfc-sizes-note")).toHaveText("Sizes are for the first file, sample.pdf.");
  });

  test("More options change the size, and the download is the size that was shown", async ({ page }) => {
    await page.goto("/pdf/compress/");
    await page.setInputFiles("#pdfc-file", PHOTO);
    await page.locator("#pdfc-more summary").click();
    await page.selectOption("#pdfc-dpi", "300");
    await expect(est(page, "ebook")).toHaveText(/\(−\d+%\)/, { timeout: 30_000 });
    const at300 = Number.parseInt(await sizeOf(page, "ebook"), 10);
    await page.selectOption("#pdfc-dpi", "72");
    await expect(page.locator('[data-est="ebook"] .spin')).toHaveCount(0, { timeout: 30_000 });
    await expect(est(page, "ebook")).toHaveText(/\(−\d+%\)/, { timeout: 30_000 });
    const at72 = Number.parseInt(await sizeOf(page, "ebook"), 10);
    expect(at72).toBeLessThan(at300);
    // Lower picture quality and grey shrink it again; both appear on the result row.
    await page.selectOption("#pdfc-jpeg", "low");
    await page.check("#pdfc-gray");
    await page.check("#pdfc-strip");
    await expect(page.locator("#pdfc-reset")).toBeVisible();
    await expect(est(page, "ebook")).toHaveText(/\(−\d+%\)/, { timeout: 30_000 });
    await expect(page.locator('[data-est="ebook"] .spin')).toHaveCount(0);
    const shown = await sizeOf(page, "ebook");
    expect(Number.parseInt(shown, 10)).toBeLessThan(at72);
    await page.click("#pdfc-go");
    const link = page.getByRole("link", { name: "Download" });
    await expect(link).toBeVisible({ timeout: 60_000 });
    const [d] = await Promise.all([page.waitForEvent("download"), link.click()]);
    const out = readFileSync(await d.path());
    expect(fmt(out.length)).toBe(shown);
    expect(out.toString("latin1")).not.toContain("Secret");
    await expect(page.locator("#pdfc-results .fmeta")).toContainText("72 dpi · lower picture quality · grey · details removed");
  });

  test("Back to the choice above puts every option back", async ({ page }) => {
    await page.goto("/pdf/compress/");
    await page.setInputFiles("#pdfc-file", FIXTURE);
    await page.locator("#pdfc-more summary").click();
    await page.selectOption("#pdfc-dpi", "100");
    await page.check("#pdfc-gray");
    await page.click("#pdfc-reset");
    await expect(page.locator("#pdfc-dpi")).toHaveValue("");
    await expect(page.locator("#pdfc-gray")).not.toBeChecked();
    await expect(page.locator("#pdfc-reset")).toBeHidden();
  });

  test("the options fit a 320 px screen and can be reached by keyboard", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto("/pdf/compress/");
    await page.setInputFiles("#pdfc-file", FIXTURE);
    await expect(est(page, "ebook")).toHaveText(/\(−\d+%\)/, { timeout: 30_000 });
    await page.locator("#pdfc-more summary").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#pdfc-dpi")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    // 44 px targets: the summary, the two lists, and the whole label around each checkbox.
    for (const sel of ["#pdfc-more summary", "#pdfc-dpi", "#pdfc-jpeg", "label:has(#pdfc-gray)", "label:has(#pdfc-strip)"]) {
      expect((await page.locator(sel).boundingBox()).height, sel).toBeGreaterThanOrEqual(44);
    }
  });

  for (const theme of ["light", "dark"]) {
    test(`${theme}: sizes shown and More options open meet WCAG 2.2 AA`, async ({ page, context }) => {
      await context.addInitScript((t) => { try { localStorage.setItem("ftt:theme", t); } catch {} }, theme);
      await page.goto("/pdf/compress/");
      await page.setInputFiles("#pdfc-file", FIXTURE);
      await page.locator("#pdfc-more summary").click();
      await page.selectOption("#pdfc-dpi", "100");
      await expect(est(page, "printer")).toHaveText(/\(−\d+%\)/, { timeout: 30_000 });
      const { violations } = await new AxeBuilder({ page })
        .options({ runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] }, rules: { "label-content-name-mismatch": { enabled: true } } })
        .analyze();
      expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
    });
  }
});
