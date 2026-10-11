// The newest converters flash a result when it changes, like the other as-you-type tools
// (src/lib/live.ts), and never on first paint.
import { test, expect } from "@playwright/test";

test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "one run covers it"));

const CASES = [
  { path: "/everyday/colour-converter/", input: "#cc-in", value: "#ff8800" },
  { path: "/developer/url-encode/", input: "#ue-in", value: "a b&c" },
  { path: "/everyday/unix-timestamp/", input: "#ut-ts", value: "1600000000" },
];

for (const c of CASES) {
  test(`${c.path}: a changed result flashes, the first one does not`, async ({ page }) => {
    await page.goto(c.path);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("main .changed")).toHaveCount(0);
    await page.locator(c.input).fill(c.value);
    await expect(page.locator("main .changed").first()).toBeVisible();
  });
}
