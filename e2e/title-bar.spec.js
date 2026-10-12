// The installed app's title bar colour follows the theme shown. The overlay layout itself cannot be
// emulated here (Chromium ignores a display-mode override), so tests/site.test.js checks its CSS.
import { test, expect } from "@playwright/test";

test.skip(({ isMobile }) => isMobile, "runs once, on desktop");

const colours = (page) => page.evaluate(() => [...document.querySelectorAll('meta[name="theme-color"]')].map((m) => m.content));

test("the title bar colour follows the Light, Dark and System switch", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const theme = page.getByRole("group", { name: "Theme" });
  expect(await colours(page)).toEqual(["#fbf8f2", "#fbf8f2"]);
  await theme.getByRole("button", { name: "Dark" }).click();
  expect(await colours(page)).toEqual(["#15130f", "#15130f"]);
  await theme.getByRole("button", { name: "System" }).click();
  expect(await colours(page)).toEqual(["#fbf8f2", "#fbf8f2"]);
  await page.emulateMedia({ colorScheme: "dark" });
  await expect.poll(() => colours(page)).toEqual(["#15130f", "#15130f"]);
  await theme.getByRole("button", { name: "Light" }).click();
  expect(await colours(page)).toEqual(["#fbf8f2", "#fbf8f2"]);
});

test("a remembered Dark theme paints the dark title bar on load", async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem("ftt:theme", "dark"); } catch {} });
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await expect.poll(() => colours(page)).toEqual(["#15130f", "#15130f"]);
});
