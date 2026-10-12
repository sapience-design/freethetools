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

// The whole site, kept when the visitor asks on /offline-use/ or installs the app (src/sw/sw.template.js).
test.describe("the whole site offline", () => {
  test.skip(({ isMobile }) => isMobile, "runs once, on desktop");

  async function controlled(page, path) {
    await page.goto(path);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  }
  // Only the worker's copy counts: the browser's HTTP cache is switched off before going offline.
  // This session is told it is offline too; otherwise navigator.onLine reads true after a navigation.
  const conditions = (offline) => ({ offline, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  async function goOffline(page, context) {
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    await cdp.send("Network.emulateNetworkConditions", conditions(true));
    await context.setOffline(true);
    return cdp;
  }
  const NEVER_OPENED = ["/about/", "/privacy/", "/pdf/", "/text/", OFFLINE_TOOLS.find((p) => p.startsWith("/text/")), OFFLINE_TOOLS.find((p) => p.startsWith("/images/"))];

  test("Download keeps pages never opened; Remove takes them away again", async ({ page, context }) => {
    await controlled(page, "/offline-use/");
    const state = page.locator("#ol-state");
    await expect(state).toContainText("Not downloaded");
    await page.locator("#ol-engine").uncheck();
    await expect(page.locator("#ol-download")).toContainText(/^Download for offline use \(\d+(\.\d)? MB\)$/);
    await page.locator("#ol-download").click();
    await expect(state).toContainText("Ready offline", { timeout: 60_000 });
    await expect(state).toContainText("English");
    await expect(state).not.toContainText("Compress PDF engine");
    await expect(page.locator("#ol-remove")).toBeVisible();

    const cdp = await goOffline(page, context);
    for (const path of NEVER_OPENED) {
      await page.goto(path);
      await expect(page.locator("main h1"), path).toBeVisible();
      await expect(page.locator("main h1"), path).not.toHaveText("You're offline.");
    }
    // Only English was asked for.
    await page.goto("/nb/pdf/merge/");
    await expect(page.locator("main h1")).toHaveText("You're offline.");
    // Without its engine, Compress PDF says what it needs instead of failing.
    await page.goto("/pdf/compress/");
    await page.setInputFiles("#pdfc-file", PDF);
    await page.locator("#pdfc-go").click();
    await expect(page.locator("#pdfc-tool .err").first()).toContainText("needs a one-time download of its engine");

    await cdp.send("Network.emulateNetworkConditions", conditions(false));
    await context.setOffline(false);
    await page.goto("/offline-use/");
    await expect(state).toContainText("Ready offline");
    await page.locator("#ol-remove").click();
    await expect(state).toContainText("You removed the offline copy");
    await cdp.send("Network.emulateNetworkConditions", conditions(true));
    await context.setOffline(true);
    await page.goto("/about/");
    await expect(page.locator("main h1")).toHaveText("You're offline.");
  });

  test("an installed app downloads everything by itself, with the Compress PDF engine on a computer", async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(Navigator.prototype, "standalone", { get: () => true }));
    await controlled(page, "/");
    const kept = () => page.evaluate(async () => {
      const out = [];
      for (const n of await caches.keys()) for (const r of await (await caches.open(n)).keys()) out.push(new URL(r.url).pathname);
      return out;
    });
    await expect.poll(async () => (await kept()).includes("/privacy/") && (await kept()).some((p) => p.endsWith("/gs.wasm")), { timeout: 60_000 }).toBe(true);
    await page.goto("/offline-use/");
    await expect(page.locator("#ol-app")).toBeVisible();
    await expect(page.locator("#ol-state")).toContainText("with the Compress PDF engine", { timeout: 30_000 });
  });

  // The same worker under a new address stands in for a new deploy: the browser installs it as an
  // update, and it waits. It carries the same release, so it stands for a deploy within a release.
  const deploy = (page) => page.evaluate(() => navigator.serviceWorker.register("/sw.js?next", { scope: "/" }));
  const waiting = (page) => page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration()).waiting);

  test("a deploy within the same release updates quietly, with no note", async ({ page }) => {
    await controlled(page, "/pdf/merge/");
    await deploy(page);
    await expect.poll(() => waiting(page), { timeout: 20_000 }).toBe(true);
    await page.waitForTimeout(2000);
    await expect(page.locator("#update-note")).toBeEmpty();
  });

  test("a new release shows a note with Reload in the corner, and Reload switches to it", async ({ page }) => {
    await controlled(page, "/pdf/merge/");
    const note = page.locator("#update-note");
    await expect(note).toBeEmpty();
    // The waiting worker answers with another release number, as the next version would.
    await page.evaluate(() => {
      const post = ServiceWorker.prototype.postMessage;
      ServiceWorker.prototype.postMessage = function (msg, transfer) {
        if (msg?.type === "release" && this.scriptURL.includes("?next")) return transfer[0].postMessage("99.0.0");
        return post.call(this, msg, transfer);
      };
    });
    await deploy(page);
    await expect(note).toContainText("A new version is ready.", { timeout: 20_000 });
    await expect(note.getByRole("button", { name: "Later" })).toBeVisible();
    expect(await page.evaluate(() => navigator.serviceWorker.controller.scriptURL)).not.toContain("?next");
    // After the reload the page would register "/sw.js" again: to the browser, a third version, and
    // a new note. Real visits always use "/sw.js", so the reloaded page here skips registering.
    await page.addInitScript(() => { navigator.serviceWorker.register = () => navigator.serviceWorker.ready; });
    await Promise.all([page.waitForEvent("load"), note.getByRole("button", { name: "Reload" }).click()]);
    await expect(note).toBeEmpty();
    await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL)).toContain("/sw.js?next");
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
