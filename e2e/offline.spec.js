import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";

const PDF = "tools/pdf/compress/tests/fixtures/sample.pdf";
// Every tool the catalogue says works offline. A new tool joins this test without a change here.
const catalogue = JSON.parse(readFileSync("dist/api/tools.json", "utf8"));
const OFFLINE_TOOLS = catalogue.categories.flatMap((c) => c.tools).filter((t) => t.offline).map((t) => new URL(t.url).pathname);

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

// Each tool page is opened once with the network on, then again with it off. Everything the page
// loads when it opens must come back from the worker: a script, font or vendor file it fetches but
// the worker does not keep would fail here. Engines a tool loads only when it runs (Ghostscript for
// Compress PDF) are covered by the tool's own offline FAQ and the Merge PDFs run above.
test.describe("every tool that says it works offline opens offline", () => {
  test.skip(({ isMobile }) => isMobile, "runs once, on desktop");

  for (const path of OFFLINE_TOOLS) {
    test(`${path} opens with the network off after one visit`, async ({ page, context }) => {
      await page.goto(path);
      await page.evaluate(() => navigator.serviceWorker.ready);
      await page.reload();
      await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
      await page.waitForLoadState("networkidle");

      // Scripts and fonts carry a one-year Cache-Control, so the browser's own HTTP cache would hide a
      // file the worker failed to keep. Browsers evict that cache when space runs low; only the
      // worker's copy counts, so the HTTP cache is switched off for the offline load.
      const cdp = await context.newCDPSession(page);
      await cdp.send("Network.enable");
      await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });

      const origin = new URL(page.url()).origin;
      const failed = [];
      page.on("requestfailed", (r) => {
        const u = new URL(r.url());
        if (u.origin === origin && !u.pathname.startsWith("/api/")) failed.push(`${u.pathname}: ${r.failure()?.errorText}`);
      });
      await context.setOffline(true);
      await page.reload();
      await page.waitForLoadState("networkidle");
      expect(failed, "files this page loads that the worker did not keep").toEqual([]);
      await expect(page.locator("main h1")).toBeVisible();
      await expect(page.locator("main h1")).not.toHaveText("You're offline.");
      await expect(page.locator("[data-offline-note]")).toBeVisible();
    });
  }
});
