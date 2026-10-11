import { test, expect } from "@playwright/test";

// Searches that find nothing are counted (src/lib/stats.ts trackSearchMiss). The POST is
// intercepted and answered here, so nothing reaches the counter.
async function watch(page) {
  const posts = [];
  await page.route("**/api/stats/search", (route) => { posts.push(route.request().postDataJSON()); return route.fulfill({ status: 204 }); });
  return posts;
}

test("a search with no result sends one term after a pause, and only the term", async ({ page }) => {
  const posts = await watch(page);
  await page.goto("/");
  await page.fill("#find", "  Zxqv   Flurbo ");
  await expect(page.locator("#results-none")).toBeVisible();
  await page.waitForTimeout(800);
  expect(posts).toEqual([]);
  await expect.poll(() => posts.length, { timeout: 5000 }).toBe(1);
  expect(posts[0]).toEqual({ term: "zxqv flurbo" });
  // Pressing Enter and "Suggest it" for the same term does not send it again.
  await page.press("#find", "Enter");
  await expect(page.getByRole("dialog", { name: "Suggest a tool" })).toBeVisible();
  await page.waitForTimeout(300);
  expect(posts).toHaveLength(1);
});

test("Enter on an empty result sends the term at once and still opens the suggest dialog", async ({ page }) => {
  const posts = await watch(page);
  await page.goto("/");
  await page.fill("#find", "qwertyuiop blorp");
  await page.press("#find", "Enter");
  await expect(page.getByRole("dialog", { name: "Suggest a tool" })).toBeVisible();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0]).toEqual({ term: "qwertyuiop blorp" });
});

test("pressing Suggest it sends the term", async ({ page }) => {
  const posts = await watch(page);
  await page.goto("/");
  await page.fill("#find", "zzyzx wibble");
  await page.click("#results-suggest");
  await expect(page.getByRole("dialog", { name: "Suggest a tool" })).toBeVisible();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0]).toEqual({ term: "zzyzx wibble" });
});

test("a search with results sends nothing", async ({ page }) => {
  const posts = await watch(page);
  await page.goto("/");
  await page.fill("#find", "merge");
  await expect(page.locator("#search-results a").first()).toBeVisible();
  await page.waitForTimeout(2200);
  expect(posts).toEqual([]);
});

test("a term with a digit, an @ or a dot sends nothing", async ({ page }) => {
  const posts = await watch(page);
  for (const q of ["qqzxv 12345", "qqzxv@zzyx", "qqzxv.zzyx"]) {
    await page.goto("/");
    await page.fill("#find", q);
    await expect(page.locator("#results-none")).toBeVisible();
    await page.press("#find", "Enter");
    await expect(page.getByRole("dialog", { name: "Suggest a tool" })).toBeVisible();
  }
  await page.waitForTimeout(2000);
  expect(posts).toEqual([]);
});

test("with Global Privacy Control on, nothing is sent", async ({ page }) => {
  const posts = await watch(page);
  await page.addInitScript(() => Object.defineProperty(navigator, "globalPrivacyControl", { value: true }));
  await page.goto("/");
  await page.fill("#find", "zxqv flurbo");
  await expect(page.locator("#results-none")).toBeVisible();
  await page.press("#find", "Enter");
  await expect(page.getByRole("dialog", { name: "Suggest a tool" })).toBeVisible();
  await page.waitForTimeout(2200);
  expect(posts).toEqual([]);
});

test("/stats/ shows searches as text, or says none has reached the threshold", async ({ page }) => {
  await page.route("**/api/stats/summary", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ tools: {}, site: { visits30: 1, countries: [], referrers: [], devices: [], searches: [["<b>x</b> ok", 7]] } }) }));
  await page.goto("/stats/");
  await expect(page.locator("#st-searches li").first()).toHaveText("<b>x</b> ok7");
  await expect(page.locator("#st-searches b")).toHaveCount(0);
});

test("with no referrer, a host-like utm_source names the visit's source", async ({ page }) => {
  for (const [qs, ref] of [["utm_source=chatgpt.com", "chatgpt.com"], ["utm_source=newsletter", ""], ["utm_source=a%2Fb.com", ""]]) {
    const visit = page.waitForRequest((r) => r.url().endsWith("/api/stats/visit") && r.method() === "POST");
    await page.goto(`/?${qs}`);
    expect((await visit).postDataJSON().ref).toBe(ref);
    await page.evaluate(() => sessionStorage.clear());
  }
});
