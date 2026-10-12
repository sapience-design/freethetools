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

test("Light is the default, even on a device set to dark, until the visitor picks Dark or System", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const theme = page.getByRole("group", { name: "Theme" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(theme.getByRole("button", { name: "Light" })).toHaveAttribute("aria-pressed", "true");
  expect(await colours(page)).toEqual(["#fbf8f2", "#fbf8f2"]);
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(251, 248, 242)");
  // System is remembered and follows the device from then on, on every page.
  await theme.getByRole("button", { name: "System" }).click();
  await page.goto("/pdf/merge/");
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.*/);
  expect(await colours(page)).toEqual(["#15130f", "#15130f"]);
  // Light again forgets the choice.
  await page.getByRole("group", { name: "Theme" }).getByRole("button", { name: "Light" }).click();
  expect(await page.evaluate(() => localStorage.getItem("ftt:theme"))).toBeNull();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("a remembered Dark theme paints the dark title bar on load", async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem("ftt:theme", "dark"); } catch {} });
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await expect.poll(() => colours(page)).toEqual(["#15130f", "#15130f"]);
});
