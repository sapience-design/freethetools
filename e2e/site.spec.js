import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const FIXTURE = "tools/pdf/compress/tests/fixtures/sample.pdf";
const pageCount = (buf) => Math.max(...[...buf.toString("latin1").matchAll(/\/Count\s+(\d+)/g)].map((m) => +m[1]));

// Every test watches for the two things the site promises never happen:
// a request to another origin, and a Content Security Policy violation.
test.beforeEach(async ({ page }) => {
  const offsite = [];
  const violations = [];
  page.on("request", (r) => {
    const u = new URL(r.url());
    const own = new URL(test.info().project.use.baseURL).hostname;
    if (u.protocol.startsWith("http") && u.hostname !== own) offsite.push(r.url());
  });
  page.on("console", (m) => { if (/Content Security Policy/i.test(m.text())) violations.push(m.text()); });
  page.__checks = { offsite, violations };
});

test.afterEach(async ({ page }) => {
  expect(page.__checks.offsite, "requests to other origins").toEqual([]);
  expect(page.__checks.violations, "CSP violations").toEqual([]);
});

test("home lists the live tool and wanted tools", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Free the Tools/);
  await expect(page.getByRole("link", { name: /Compress PDF/ }).first()).toBeVisible();
  await expect(page.locator(".planned a").first()).toBeVisible();
  await expect(page.locator("body")).not.toContainText("$0");
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/home-${test.info().project.name}.png`, fullPage: true });
});

test("the sidebar drills into a group and back", async ({ page, isMobile }) => {
  await page.goto("/");
  if (isMobile) await page.click("#menu");
  await page.locator(".nav-root").getByRole("link", { name: "PDF" }).click();
  await expect(page).toHaveURL(/\/pdf\/$/);
  if (isMobile) await page.click("#menu");
  await expect(page.locator(".nav-sub").getByRole("link", { name: "Compress" })).toBeVisible();
  await page.locator(".nav-sub").getByRole("link", { name: /All tools/ }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("search finds tools and offers requests for misses", async ({ page, isMobile }) => {
  await page.goto("/?q=compress");
  if (isMobile) await page.click("#menu");
  await expect(page.locator("#side-results").getByRole("link", { name: /Compress PDF/ })).toBeVisible();
  await page.fill("#find", "zzzz nothing");
  await expect(page.locator("#side-results")).toContainText("No tool matches");
});

test("saving a tool shows it on the Saved page", async ({ page }) => {
  await page.goto("/pdf/compress/");
  await page.locator(".info [data-save]").click();
  await page.goto("/saved/");
  await expect(page.locator("#saved-list").getByRole("link", { name: "Compress PDF" })).toBeVisible();
});

for (const firstPage of [false, true]) {
  test(`Compress PDF works in the browser${firstPage ? " (first page only)" : ""}`, async ({ page }) => {
    await page.goto("/pdf/compress/");
    if (firstPage) await page.check("#pdfc-first");
    await page.setInputFiles("#pdfc-file", FIXTURE);
    const link = page.getByRole("link", { name: "Download" });
    await expect(link).toBeVisible({ timeout: 60_000 });
    const [download] = await Promise.all([page.waitForEvent("download"), link.click()]);
    const out = readFileSync(await download.path());
    expect(out.subarray(0, 5).toString()).toBe("%PDF-");
    expect(out.length).toBeLessThan(readFileSync(FIXTURE).length * 0.5);
    expect(pageCount(out)).toBe(firstPage ? 1 : 3);
    expect(download.suggestedFilename()).toBe(firstPage ? "sample_p1_small.pdf" : "sample_small.pdf");
    if (process.env.SHOTS && !firstPage) await page.screenshot({ path: `${process.env.SHOTS}/tool-${test.info().project.name}.png`, fullPage: true });
  });
}
