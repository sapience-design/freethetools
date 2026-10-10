// The library as recent files: jobs grouped by day, named by task, with a picture for each image,
// settings in plain words, a search and a "who made it" filter.
import { test, expect } from "@playwright/test";

const PDF = "tools/pdf/compress/tests/fixtures/sample.pdf";

test.skip(({ isMobile }) => isMobile, "run once, on desktop");

async function download(page, trigger) {
  const [d] = await Promise.all([page.waitForEvent("download"), trigger()]);
  await d.path();
}

test("an empty library shows a way on, without a search or filters", async ({ page }) => {
  await page.goto("/library/");
  await expect(page.locator("#lib-empty")).toBeVisible();
  await expect(page.locator("#lib-empty").getByRole("link", { name: "Browse all tools" })).toBeVisible();
  await expect(page.locator("#lib-bar")).toBeHidden();
});

test("jobs are grouped by day and named by task, with pictures, plain settings, search and a filter", async ({ page }) => {
  await page.addInitScript(() => { delete document.modelContext; });
  await page.goto("/developer/qr-code-maker/");
  await page.fill("#qr-in", "https://freethetools.com/");
  await page.waitForTimeout(400);
  await download(page, () => page.getByRole("link", { name: "Download SVG" }).click());
  await page.waitForTimeout(700);
  await page.goto("/pdf/split/");
  await page.setInputFiles("#pdfs-file", PDF);
  await page.click("#pdfs-go");
  await page.getByRole("link", { name: "Download" }).first().waitFor();
  await download(page, () => page.getByRole("link", { name: "Download" }).first().click());
  await page.waitForTimeout(700);

  await page.goto("/library/");
  const recs = page.locator("#lib-list li.rec");
  await expect(recs).toHaveCount(2);
  await expect(page.locator(".day-h")).toHaveText(["Today"]);
  await expect(page.locator("#lib-bar")).toBeVisible();

  // Named by the job, linked to the tool; images show themselves.
  const qr = recs.filter({ hasText: "Make a QR code" });
  await expect(qr.getByRole("link", { name: "Make a QR code" })).toHaveAttribute("href", "/developer/qr-code-maker/");
  await expect(qr.locator(".fthumb img").first()).toBeVisible();

  // Settings read as words, not true and false.
  await qr.getByText("Details", { exact: true }).click();
  await expect(qr.locator("dd", { hasText: /^No$/ }).first()).toBeVisible();
  expect(await page.locator("#lib-list").textContent()).not.toMatch(/\b(true|false)\b/);

  // Search looks at tools and file names.
  await page.fill("#lib-search", "page-2");
  await expect(recs).toHaveCount(1);
  await expect(recs).toContainText("Split a PDF into parts");
  await expect(page.locator("#lib-status")).toHaveText("1 job shown.");
  await page.fill("#lib-search", "nothing like this");
  await expect(recs).toHaveCount(0);
  await expect(page.locator("#lib-none")).toBeVisible();
  await page.fill("#lib-search", "");

  // Who made it.
  await page.click('label[for="lib-who-agent"]');
  await expect(recs).toHaveCount(0);
  await expect(page.locator("#lib-none")).toBeVisible();
  await page.click('label[for="lib-who-you"]');
  await expect(recs).toHaveCount(2);
});
