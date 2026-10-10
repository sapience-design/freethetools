// How it works: the diagram is real text, and "What this browser stores" lists, explains and
// clears exactly what the site keeps on the device, without creating anything by looking.
import { test, expect } from "@playwright/test";

const PDF = "tools/pdf/compress/tests/fixtures/sample.pdf";

test.skip(({ isMobile }) => isMobile, "run once, on desktop");

test("the diagram is text a screen reader can read, and every tool page links here", async ({ page }) => {
  await page.goto("/how-it-works/");
  const flow = page.locator("figure.flow");
  for (const words of ["freethetools.com", "Your file", "The tool", "The result", "Downloads folder", "Library", "Blocked"]) {
    await expect(flow.getByText(words, { exact: true })).toBeVisible();
  }
  await page.goto("/pdf/merge/");
  await page.locator(".safe").getByRole("link", { name: "Check it yourself" }).click();
  await expect(page).toHaveURL(/\/how-it-works\/$/);
});

test("lists what the site keeps, in plain words, and never creates the library by looking", async ({ page }) => {
  await page.goto("/about/");
  await page.evaluate(() => {
    localStorage.setItem("ftt:theme", "dark");
    localStorage.setItem("ftt:saved", JSON.stringify({ "pdf/merge": { name: "Merge PDFs", href: "/pdf/merge/" } }));
  });
  await page.goto("/how-it-works/");
  const stores = page.locator("#stores");
  await expect(stores.locator("li", { hasText: "Theme" })).toContainText("Dark");
  await expect(stores.locator("li", { hasText: "Favourites" })).toContainText("1 tool");
  await expect(stores.locator("li", { hasText: "Cookies" })).toContainText("None");
  await expect(stores.locator("li", { hasText: "Library" })).toHaveCount(0);
  expect(await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name))).not.toContain("ftt-library");

  // The raw value is one click away.
  const saved = stores.locator("li", { hasText: "Favourites" });
  await saved.getByText("Show exactly what's stored").click();
  await expect(saved.locator("pre")).toContainText('ftt:saved = {"pdf/merge"');

  // Clearing one thing clears only that, and says so.
  await stores.getByRole("button", { name: "Clear theme" }).click();
  await expect(page.locator("#stores-status")).toHaveText("Theme cleared.");
  await expect(stores.locator("li", { hasText: "Theme" })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("ftt:saved"))).not.toBeNull();
});

test("shows the library's jobs, and Clear everything asks first, then empties it all", async ({ page }) => {
  await page.goto("/pdf/merge/");
  await page.setInputFiles("#pdfm-file", [PDF, PDF]);
  await page.click("#pdfm-go");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Download" }).click()]);
  await download.path();
  await page.waitForTimeout(700);

  await page.goto("/how-it-works/");
  const stores = page.locator("#stores");
  await expect(stores.locator("li", { hasText: "Library" })).toContainText("1 job");

  await page.getByRole("button", { name: "Clear everything" }).click();
  await expect(page.locator("#stores-confirm")).toBeVisible();
  await page.getByRole("button", { name: "Keep it" }).click();
  await expect(stores.locator("li", { hasText: "Library" })).toContainText("1 job");

  await page.getByRole("button", { name: "Clear everything" }).click();
  await page.getByRole("button", { name: "Yes, clear everything" }).click();
  await expect(page.locator("#stores-status")).toContainText("cleared");
  await expect(stores.locator("li", { hasText: "Library" })).toContainText("Empty");
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("ftt:")))).toEqual([]);
  await expect(page.getByRole("button", { name: "Clear everything" })).toBeHidden();
});
