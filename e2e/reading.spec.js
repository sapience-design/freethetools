// Reading pages: the text keeps a readable width, and "On this page" lists the sections beside it
// on wide screens, marking the one being read. Phones keep one column.
import { test, expect } from "@playwright/test";

test("wide screens list the sections beside the text, and mark the one being read", async ({ page, isMobile }) => {
  test.skip(isMobile, "phones keep one column");
  await page.goto("/about/");
  const toc = page.getByRole("navigation", { name: "On this page" });
  await expect(toc).toBeVisible();
  const links = toc.getByRole("link");
  expect(await links.count()).toBeGreaterThanOrEqual(3);
  await expect(links.first()).toHaveAttribute("aria-current", "location");
  // Following a link moves to that section, and the panel marks it.
  const last = links.last();
  const target = (await last.getAttribute("href")).slice(1);
  await last.click();
  await expect(page.locator(`#${target}`)).toBeInViewport();
  await expect(last).toHaveAttribute("aria-current", "location");
  // The panel sits beside the text, never over it.
  const text = await page.locator("main .lede").first().boundingBox();
  const box = await toc.boundingBox();
  expect(box.x).toBeGreaterThan(text.x + text.width);
});

test("phones keep one column, without the panel", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phones only");
  await page.goto("/about/");
  await expect(page.getByRole("navigation", { name: "On this page" })).toBeHidden();
});
