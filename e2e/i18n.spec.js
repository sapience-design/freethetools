// The Norwegian pages (docs/adr/0014-languages.md): switching language, search in Norwegian, no
// outside requests, and accessibility in both themes.
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Like every other spec: nothing may reach another origin, and the policy must never be broken.
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

test("the language switcher keeps you on the same tool, there and back", async ({ page }) => {
  await page.goto("/pdf/compress/");
  const foot = page.getByRole("navigation", { name: "Language" });
  await expect(foot.getByRole("link", { name: "English" })).toHaveAttribute("aria-current", "true");
  await foot.getByRole("link", { name: "Norsk bokmål" }).click();
  await expect(page).toHaveURL(/\/nb\/pdf\/compress\/$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "nb");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Gjør en PDF mindre");
  await expect(page.locator(".review-note")).toContainText("oversatt maskinelt");
  await expect(page.locator(".tool-note")).toContainText("fortsatt på engelsk");
  const nbFoot = page.getByRole("navigation", { name: "Språk" });
  await expect(nbFoot.getByRole("link", { name: "Norsk bokmål" })).toHaveAttribute("aria-current", "true");
  await nbFoot.getByRole("link", { name: "English" }).click();
  await expect(page).toHaveURL(/\/pdf\/compress\/$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Make a PDF smaller");
});

test("a page with no translation sends you to the language's home", async ({ page }) => {
  await page.goto("/about/");
  await page.getByRole("navigation", { name: "Language" }).getByRole("link", { name: "Norsk bokmål" }).click();
  await expect(page).toHaveURL(/\/nb\/$/);
});

test("searching the Norwegian home page works in Norwegian and in English", async ({ page }) => {
  await page.goto("/nb/");
  await page.locator("#find").fill("komprimer");
  await expect(page.locator("#search-results").getByRole("link", { name: /Gjør en PDF mindre/ })).toBeVisible();
  await page.locator("#find").fill("compress");
  await expect(page.locator("#search-results").getByRole("link", { name: /Gjør en PDF mindre/ })).toBeVisible();
  await page.locator("#find").fill("slå sammen");
  await expect(page.locator("#search-results a").first()).toContainText("Slå sammen PDF-er til én");
  await expect(page.locator("#results-title")).toContainText("Beste treff for");
  // A result keeps you in Norwegian.
  await page.locator("#search-results a").first().click();
  await expect(page).toHaveURL(/\/nb\/pdf\/merge\/$/);
});

test("a missing Norwegian address shows the Norwegian 404 page", async ({ page }) => {
  const res = await page.goto("/nb/finnes-ikke/");
  expect(res.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Denne siden finnes ikke.");
});

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
for (const theme of ["light", "dark"]) {
  for (const path of ["/nb/", "/nb/pdf/compress/", "/nb/pdf/page-delete/"]) {
    test(`${path} meets WCAG 2.2 AA (${theme})`, async ({ page, context }) => {
      await context.addInitScript((t) => { try { localStorage.setItem("ftt:theme", t); } catch {} }, theme);
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const { violations } = await new AxeBuilder({ page })
        .options({ runOnly: { type: "tag", values: WCAG }, rules: { "label-content-name-mismatch": { enabled: true } } })
        .analyze();
      const summary = violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).slice(0, 4).join(" | ")}`);
      expect(summary, summary.join("\n")).toEqual([]);
    });
  }
}
