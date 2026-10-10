import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";

const PDF = "tools/pdf/compress/tests/fixtures/sample.pdf";

// Same guards as tools.spec.js: no outside request, page error or CSP violation. Requests that
// fail because the network is switched off are the point of this test, so they are not counted.
test.beforeEach(async ({ page }) => {
  const problems = [];
  page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
  page.on("console", (m) => {
    if (/Content Security Policy/i.test(m.text())) problems.push(`console: ${m.text()}`);
  });
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.protocol.startsWith("http") && u.hostname !== new URL(test.info().project.use.baseURL).hostname) problems.push(`offsite: ${r.url()}`);
  });
  page.__problems = problems;
});
test.afterEach(async ({ page }) => expect(page.__problems).toEqual([]));

test.describe("works offline after a visit", () => {
  test.skip(({ isMobile }) => isMobile, "runs once, on desktop");

  test("Merge PDFs still runs with the network off", async ({ page, context }) => {
    await page.goto("/pdf/merge/");
    await page.evaluate(() => navigator.serviceWorker.ready);
    // The first load was not served by the worker; reload so this page is controlled and kept.
    await page.reload();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await expect(page.locator("[data-offline-note]")).toBeVisible();
    await page.waitForLoadState("networkidle");

    await context.setOffline(true);
    await page.reload();
    await expect(page.locator("main h1")).toBeVisible();

    await page.setInputFiles("#pdfm-file", [PDF, PDF]);
    await expect(page.locator("#pdfm-list li")).toHaveCount(2);
    await page.click("#pdfm-go");
    const [d] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Download" }).click()]);
    expect((await PDFDocument.load(readFileSync(await d.path()))).getPageCount()).toBe(6);
  });

  test("a page never opened shows the offline page, which lists the tools kept", async ({ page, context }) => {
    await page.goto("/pdf/merge/");
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await page.waitForLoadState("networkidle");

    await context.setOffline(true);
    await page.goto("/text/never-opened-page/");
    await expect(page.locator("main h1")).toHaveText("You're offline.");
    await expect(page.locator("#offline-list li:not([hidden])")).toHaveCount(1);
    await expect(page.locator("#offline-list li:not([hidden])")).toContainText("Merge");
  });

  test("usage totals are never kept by the worker", async ({ page }) => {
    await page.goto("/pdf/merge/");
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await page.waitForLoadState("networkidle");
    const keys = await page.evaluate(async () => {
      const out = [];
      for (const n of await caches.keys()) for (const r of await (await caches.open(n)).keys()) out.push(new URL(r.url).pathname);
      return out;
    });
    expect(keys.length).toBeGreaterThan(10);
    expect(keys.filter((k) => k.startsWith("/api/stats/"))).toEqual([]);
    expect(keys).toContain("/pdf/merge/");
  });
});
