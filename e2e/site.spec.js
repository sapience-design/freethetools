import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const FIXTURE = "tools/pdf/compress/tests/fixtures/sample.pdf";
const pageCount = (buf) => Math.max(...[...buf.toString("latin1").matchAll(/\/Count\s+(\d+)/g)].map((m) => +m[1]));

// Every test watches for the two things the site promises never happen:
// a request to another origin, and a Content Security Policy violation.
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

test("home lists the live tools, and groups list wanted ones", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Free the Tools/);
  await expect(page.getByRole("link", { name: /Make a PDF smaller/ }).first()).toBeVisible();
  await expect(page.locator("body")).not.toContainText("$0");
  // A group that still has tools on its wanted list (building one takes it off).
  const wanted = await page.locator("li.want").first().getAttribute("data-g");
  await page.goto(`/${wanted}/`);
  await expect(page.locator("li.want a").first()).toBeVisible();
  await expect(page.locator("li.want a").first()).toContainText("Not built yet");
  await page.goto("/");
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/home-${test.info().project.name}.png`, fullPage: true });
});

test("a group card leads to its page, and back", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('.gcard[data-g="pdf"] .gcard-head')).toContainText(/See all \d+ tools/);
  await page.locator('.gcard[data-g="pdf"] .gcard-head').click();
  await expect(page).toHaveURL(/\/pdf\/$/);
  await expect(page.locator("main").getByRole("link", { name: /Make a PDF smaller/ })).toBeVisible();
  await page.locator("main .back").click();
  await expect(page).toHaveURL(/\/$/);
});

test("group chips filter the home page", async ({ page }) => {
  await page.goto("/");
  await page.locator('.chip[data-cat="images"]').click();
  await expect(page.locator("#results-title")).toHaveText("Image tools");
  const count = Number(await page.locator('.chip[data-cat="images"] .chip-n').textContent());
  await expect(page.locator("#search-results li")).toHaveCount(count);
  await page.click("#results-clear");
  await expect(page.locator("#results")).toBeHidden();
});

test("search finds tools and offers requests for misses", async ({ page }) => {
  await page.goto("/?q=compress");
  await expect(page.locator("#search-results").getByRole("link", { name: /Compress PDF/ })).toBeVisible();
  await page.fill("#find", "zzzz nothing");
  await expect(page.locator("#results-title")).toContainText("Nothing found");
  await expect(page.locator("#results-empty")).toContainText("ask us to build it");
});

test("the heart adds a favourite, shows it at home and on /saved/, and counts one like", async ({ page }) => {
  const likes = [];
  page.on("request", (r) => { if (r.url().endsWith("/api/stats/like") && r.method() === "POST") likes.push(r.postDataJSON()); });
  await page.goto("/pdf/compress/");
  const heart = page.locator(".tp-actions [data-save]");
  await expect(heart).toHaveAttribute("aria-pressed", "false");
  await heart.click();
  await expect(heart).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => likes.length).toBe(1);
  expect(likes[0]).toEqual({ tool: "pdf/compress", on: true });

  // A reload sends nothing and shows the heart on.
  await page.reload();
  await expect(heart).toHaveAttribute("aria-pressed", "true");

  await page.goto("/");
  const fav = page.locator("#fav");
  await expect(fav).toBeVisible();
  await expect(fav.getByRole("heading", { name: "Your favourites" })).toBeVisible();
  await expect(fav.getByRole("link", { name: /Compress PDF/ })).toBeVisible();
  await expect(fav.getByRole("link", { name: "Manage" })).toHaveAttribute("href", "/saved/");
  // It hides while search results show.
  await page.fill("#find", "merge");
  await expect(fav).toBeHidden();
  await page.fill("#find", "");
  await expect(fav).toBeVisible();

  await page.goto("/saved/");
  await expect(page.getByRole("heading", { name: "Your favourites" })).toBeVisible();
  await expect(page.locator("#saved-list").getByRole("link", { name: /Compress PDF/ })).toBeVisible();

  await page.goto("/pdf/compress/");
  await heart.click();
  await expect(heart).toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => likes.length).toBe(2);
  expect(likes[1]).toEqual({ tool: "pdf/compress", on: false });
  await page.goto("/");
  await expect(page.locator("#fav")).toBeHidden();
  expect(likes).toHaveLength(2);
});

test("the Favourites page says so when it is empty", async ({ page }) => {
  await page.goto("/saved/");
  await expect(page).toHaveTitle("Favourites | Free the Tools");
  await expect(page.locator("#saved-empty")).toContainText("No favourites yet. Press Add to favourites on any tool to keep it here.");
});

for (const firstPage of [false, true]) {
  test(`Compress PDF works in the browser${firstPage ? " (first page only)" : ""}`, async ({ page }) => {
    await page.goto("/pdf/compress/");
    if (firstPage) await page.check("#pdfc-first");
    await page.setInputFiles("#pdfc-file", FIXTURE);
    await page.click("#pdfc-go");
    const link = page.getByRole("link", { name: "Download" });
    await expect(link).toBeVisible({ timeout: 60_000 });
    const [download] = await Promise.all([page.waitForEvent("download"), link.click()]);
    const out = readFileSync(await download.path());
    expect(out.subarray(0, 5).toString()).toBe("%PDF-");
    expect(out.length).toBeLessThan(readFileSync(FIXTURE).length * 0.5);
    expect(pageCount(out)).toBe(firstPage ? 1 : 3);
    expect(download.suggestedFilename()).toBe(firstPage ? "sample_p1_small.pdf" : "sample_small.pdf");
    if (process.env.SHOTS && !firstPage) await page.screenshot({ path: `${process.env.SHOTS}/tool-${test.info().project.name}.png`, fullPage: true });
  });
}

// Links to other sites open in a new tab, so this page and any half-done job stay put.
test("links to other sites open in a new tab and say so", async ({ page }) => {
  for (const path of ["/", "/about/", "/pdf/merge/"]) {
    await page.goto(path);
    const links = await page.evaluate(() => [...document.querySelectorAll("a[href^='http']")]
      .filter((a) => new URL(a.href).origin !== location.origin)
      .map((a) => ({ href: a.href, target: a.target, rel: a.rel, label: a.getAttribute("aria-label") || a.textContent })));
    expect(links.length, `${path} has outside links`).toBeGreaterThan(0);
    for (const l of links) {
      expect(l.target, `${path}: ${l.href}`).toBe("_blank");
      expect(l.rel.split(" "), `${path}: ${l.href}`).toContain("noopener");
      expect(l.label.trim(), `${path}: ${l.href}`).toMatch(/\(opens in a new tab\)$/);
    }
  }
});

test("a link drawn later, in the Markdown preview, opens in a new tab too", async ({ page }) => {
  await page.goto("/text/markdown-to-html/");
  await page.fill("#md-in", "[a site](https://example.org/)");
  const link = page.locator("a[href='https://example.org/']").first();
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", /noopener/);
});

// Donations: one plain link in the top bar, and one quiet note after a result (src/lib/files.ts).
test("Donate is in the top bar and the footer, as a plain link to Ko-fi", async ({ page, isMobile }) => {
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Site" }).getByRole("link", { name: /^Donate/ })).toHaveAttribute("href", "https://ko-fi.com/freethetools");
  await expect(page.locator("footer").getByRole("link", { name: /^Donate/ })).toHaveAttribute("href", "https://ko-fi.com/freethetools");
  await expect(page.locator("footer").getByRole("link", { name: "Sponsor a tool" })).toHaveAttribute("href", "/support/#company-h");
});

test("the donation note shows once per visit, under the Download button, and No thanks keeps it away", async ({ page }) => {
  const merge = async () => {
    await page.goto("/pdf/merge/");
    await page.setInputFiles("input[type=file]", [FIXTURE, FIXTURE]);
    await page.locator("#pdfm-go:enabled").click();
    await expect(page.getByRole("link", { name: "Download PDF" }).first()).toBeVisible();
  };
  await merge();
  const note = page.locator(".donate-line");
  await expect(note).toHaveCount(1);
  await expect(note.getByRole("link", { name: /small donation/ })).toHaveAttribute("href", "https://ko-fi.com/freethetools");
  // It sits after the Download button, never between the person and their file.
  const after = await page.evaluate(() => {
    const dl = [...document.querySelectorAll("a[download]")].pop();
    const n = document.querySelector(".donate-line");
    return !!(dl && n && (dl.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING));
  });
  expect(after, "the note comes after the download").toBe(true);
  // Once per visit: a second result in the same tab shows no note.
  await merge();
  await expect(page.locator(".donate-line")).toHaveCount(0);
  // No thanks is remembered across visits.
  await page.evaluate(() => sessionStorage.clear());
  await merge();
  await page.getByRole("button", { name: "No thanks" }).click();
  await expect(page.locator(".donate-line")).toHaveCount(0);
  await page.evaluate(() => sessionStorage.clear());
  await merge();
  await expect(page.locator(".donate-line")).toHaveCount(0);
});
