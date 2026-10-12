// "Install the app" in the footer: hidden until the browser offers a one-step install, then shows the
// browser's own install prompt once. Headless browsers never offer it, so the test sends the same
// beforeinstallprompt event the browser would, with a stand-in prompt.
import { test, expect } from "@playwright/test";

test.skip(({ isMobile }) => isMobile, "runs once, on desktop");

async function offerInstall(page, outcome = "accepted") {
  await page.evaluate((outcome) => {
    window.__prompts = 0;
    const e = new Event("beforeinstallprompt", { cancelable: true });
    e.prompt = async () => { window.__prompts++; };
    e.userChoice = Promise.resolve({ outcome, platform: "web" });
    window.__installEvent = e;
    window.dispatchEvent(e);
  }, outcome);
}

test("the button stays hidden where the browser offers no install", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(page.locator("#install-app")).toBeHidden();
});

test("the button appears when the browser offers an install, and opens its prompt once", async ({ page }) => {
  await page.goto("/pdf/merge/");
  await page.waitForLoadState("networkidle");
  await offerInstall(page);
  const btn = page.getByRole("button", { name: "Install the app" });
  await expect(btn).toBeVisible();
  expect(await page.evaluate(() => window.__installEvent.defaultPrevented), "the browser's own pop-up is replaced by the button").toBe(true);
  await btn.click();
  await expect.poll(() => page.evaluate(() => window.__prompts)).toBe(1);
  await expect(btn).toBeHidden();
});

test("the button goes away once the app is installed", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await offerInstall(page);
  await expect(page.locator("#install-app")).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
  await expect(page.locator("#install-app")).toBeHidden();
});

test("the button is translated", async ({ page }) => {
  await page.goto("/nb/");
  await page.waitForLoadState("networkidle");
  await offerInstall(page);
  await expect(page.getByRole("button", { name: "Installer appen" })).toBeVisible();
});
