// "Install the app" in the footer: always there except inside the installed app. Where the browser
// offers a one-step install it opens the browser's own prompt; elsewhere it opens a line on how to
// install. Headless browsers never offer it, so the test sends the same beforeinstallprompt event the
// browser would, with a stand-in prompt.
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

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

test("where the browser offers no one-step install, the button stays and says where Install is", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const btn = page.getByRole("button", { name: "Install the app" });
  await expect(btn).toBeVisible();
  await expect(btn).toHaveAttribute("aria-expanded", "false");
  await btn.click();
  await expect(page.locator("#install-hint")).toHaveText(OTHER);
});

test("the button appears when the browser offers an install, and opens its prompt once", async ({ page }) => {
  await page.goto("/pdf/merge/");
  await page.waitForLoadState("networkidle");
  await offerInstall(page);
  const btn = page.getByRole("button", { name: "Install the app" });
  await expect(btn).toBeVisible();
  expect(await page.evaluate(() => window.__installEvent.defaultPrevented), "the browser's own pop-up is replaced by the button").toBe(true);
  await expect(btn).not.toHaveAttribute("aria-expanded");
  await btn.click();
  await expect.poll(() => page.evaluate(() => window.__prompts)).toBe(1);
  await expect(btn).toBeHidden();
});

test("after a prompt the visitor declined, the button stays and says where Install is", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await offerInstall(page, "dismissed");
  const btn = page.getByRole("button", { name: "Install the app" });
  await btn.click();
  await expect.poll(() => page.evaluate(() => window.__prompts)).toBe(1);
  await expect(btn).toBeVisible();
  await btn.click();
  await expect(page.locator("#install-hint")).toHaveText(OTHER);
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

// Apple offers no one-step install, so on iPhone, iPad and Safari on a Mac the button opens the steps;
// other browsers without the install event get a line on where their own Install is.
// The browser is Chromium in every case; only the user agent string changes.
const UA = {
  iphoneSafari18: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
  iphoneSafari26: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1",
  iphoneChrome: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.7390.41 Mobile/15E148 Safari/604.1",
  iphoneInstagram: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 400.0.0.27.82 (iPhone14,5; iOS 18_6; en_US)",
  macSafari26: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15",
  macSafari18: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15",
  macChrome: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  macFirefox: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:143.0) Gecko/20100101 Firefox/143.0",
};
const OTHER = "Look for Install in your browser's menu or address bar. Already installed? Open Free the Tools from your apps.";
const FIREFOX = "Firefox can't install websites as apps. Offline use, at the bottom of the page, keeps every tool on this computer anyway.";
const IN_APP = "Open this page in Safari or Chrome to install it.";
const SHARE = "Tap Share, then Add to Home Screen.";
const MORE = "Tap More (⋯), then Share, then Add to Home Screen.";
const DOCK = "In Safari, choose File > Add to Dock.";
// The touch points are set too: a Mac has none, and an iPad asking for desktop sites says "Macintosh".
for (const [name, ua, touch, steps] of [
  ["iPhone, Safari 18", UA.iphoneSafari18, 5, SHARE], ["iPhone, Safari 26", UA.iphoneSafari26, 5, MORE],
  ["iPhone, Chrome", UA.iphoneChrome, 5, SHARE], ["iPhone, Instagram", UA.iphoneInstagram, 5, IN_APP],
  ["iPad as desktop, Safari 26", UA.macSafari26, 5, MORE],
  ["Mac, Safari 26", UA.macSafari26, 0, DOCK], ["Mac, Safari 18", UA.macSafari18, 0, OTHER],
  ["Mac, Chrome", UA.macChrome, 0, OTHER], ["Mac, Firefox", UA.macFirefox, 0, FIREFOX],
]) {
  test.describe(name, () => {
    test.use({ userAgent: ua });
    test(steps ? `the button opens the steps: ${steps}` : "no button and no steps", async ({ page }) => {
      await page.addInitScript((n) => Object.defineProperty(Navigator.prototype, "maxTouchPoints", { get: () => n }), touch);
      await page.goto("/");
      await page.waitForLoadState("networkidle");
      const btn = page.locator("#install-app");
      const hint = page.locator("#install-hint");
      if (!steps) {
        await expect(btn).toBeHidden();
        await expect(hint).toBeHidden();
        return;
      }
      await expect(btn).toBeVisible();
      await expect(btn).toHaveAccessibleName("Install the app");
      await expect(btn).toHaveAttribute("aria-expanded", "false");
      await expect(btn).toHaveAttribute("aria-controls", "install-hint");
      await expect(hint).toBeHidden();
      await btn.click();
      await expect(hint).toHaveText(steps);
      await expect(btn).toHaveAttribute("aria-expanded", "true");
      await btn.click();
      await expect(hint).toBeHidden();
      await expect(btn).toHaveAttribute("aria-expanded", "false");
    });
  });
}

test.describe("iPhone, Safari 26", () => {
  test.use({ userAgent: UA.iphoneSafari26 });

  test("the steps are readable in both themes, and translated", async ({ page }) => {
    for (const theme of ["light", "dark"]) {
      await page.addInitScript((t) => { try { localStorage.setItem("ftt:theme", t); } catch {} }, theme);
      await page.goto("/pdf/merge/");
      await page.locator("#install-app").click();
      await expect(page.locator("footer #install-hint")).toBeVisible();
      const { violations } = await new AxeBuilder({ page }).include("#install-app").include("#install-hint").withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
      expect(violations.map((v) => `${theme}: ${v.id}`)).toEqual([]);
    }
    await page.goto("/nb/");
    await page.getByRole("button", { name: "Installer appen" }).click();
    await expect(page.locator("#install-hint")).toHaveText("Trykk på Mer (⋯), så på Del, og så på Legg til på Hjem-skjerm.");
  });

  test("an app already on the Home Screen shows no button", async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(Navigator.prototype, "standalone", { get: () => true }));
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("#install-app")).toBeHidden();
  });
});
