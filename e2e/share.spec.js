// Share buttons: the device's share menu, offered next to every download where the browser can
// share that file. Playwright's Chromium may lack navigator.share, so each test stubs it.
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const PDF = "tools/pdf/compress/tests/fixtures/sample.pdf";
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const FAILED = "Sharing didn't work. Download still does.";

// Every test fails on a page error, a request to another origin, or a CSP violation.
test.beforeEach(async ({ page, isMobile }) => {
  test.skip(isMobile, "share flows run once, on desktop");
  const problems = [];
  const watch = (p) => {
    p.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
    p.on("console", (m) => { if (m.type() === "error" || /Content Security Policy/i.test(m.text())) problems.push(`console: ${m.text()}`); });
    p.on("request", (r) => {
      const u = new URL(r.url());
      if (u.protocol.startsWith("http") && u.hostname !== new URL(test.info().project.use.baseURL).hostname) problems.push(`offsite: ${r.url()}`);
    });
  };
  watch(page);
  page.context().on("page", watch);
  page.__problems = problems;
});
test.afterEach(async ({ page }) => expect(page.__problems ?? []).toEqual([]));

/** Stand in for the share menu. `allow` lists the types canShare accepts (true: all); `share: false` removes the API. */
async function stubShare(page, { allow = true, share = true, fail = null } = {}) {
  await page.addInitScript(({ allow, share, fail }) => {
    window.__shared = [];
    const define = (k, v) => Object.defineProperty(navigator, k, { value: v, configurable: true, writable: true });
    if (!share) { define("share", undefined); define("canShare", undefined); return; }
    define("canShare", (data) => !!data?.files?.length && data.files.every((f) => allow === true || allow.includes(f.type)));
    define("share", async (data) => {
      if (fail) throw new DOMException("no", fail);
      window.__shared.push({ files: data.files.map((f) => ({ name: f.name, type: f.type, size: f.size })), title: data.title });
    });
  }, { allow, share, fail });
}
const shared = (page) => page.evaluate(() => window.__shared);

async function merge(page) {
  await page.goto("/pdf/merge/");
  await page.setInputFiles("#pdfm-file", [PDF, PDF]);
  await expect(page.locator("#pdfm-list li")).toHaveCount(2);
  await page.click("#pdfm-go");
  await expect(page.getByRole("link", { name: "Download" })).toBeVisible();
}

test("Merge PDFs: Share sits next to Download and shares the file", async ({ page }) => {
  await stubShare(page);
  await merge(page);
  const link = page.locator("#pdfm-result a[download]");
  const name = await link.getAttribute("download");
  const btn = page.locator("#pdfm-result .share-btn");
  await expect(btn).toHaveCount(1);
  await expect(btn).toHaveText("Share");
  await expect(btn).toHaveAttribute("aria-label", `Share ${name}`);
  expect(await link.evaluate((a) => a.nextElementSibling.classList.contains("share-btn"))).toBe(true);
  await btn.click();
  await expect.poll(() => shared(page)).toHaveLength(1);
  const [call] = await shared(page);
  expect(call.files).toHaveLength(1);
  expect(call.files[0]).toMatchObject({ name, type: "application/pdf" });
  expect(call.files[0].size).toBeGreaterThan(1000);
  expect(call.title).toBe(name);
});

test("Split PDF: one Share per file", async ({ page }) => {
  await stubShare(page);
  await page.goto("/pdf/split/");
  await page.setInputFiles("#pdfs-file", PDF);
  await page.click("#pdfs-go");
  await expect(page.getByRole("link", { name: "Download", exact: true })).toHaveCount(3);
  // One Share per file, and one for the "Download all" ZIP, which comes first.
  await expect(page.locator(".share-btn")).toHaveCount(4);
  const names = await page.locator("a[download]").evaluateAll((as) => as.map((a) => a.getAttribute("download")).filter((n) => !n.endsWith(".zip")));
  expect(names).toHaveLength(3);
  for (const n of names) await expect(page.getByRole("button", { name: `Share ${n}` })).toHaveCount(1);
  await page.locator(".share-btn").nth(2).click();
  await expect.poll(() => shared(page)).toHaveLength(1);
  expect((await shared(page))[0].files[0].name).toBe(names[1]);
});

test("a result that is redrawn as you type keeps exactly one Share per link", async ({ page }) => {
  await stubShare(page);
  await page.goto("/developer/qr-code-maker/");
  await expect(page.locator("#qr-actions a[download]")).toHaveCount(2);
  await expect(page.locator("#qr-actions .share-btn")).toHaveCount(2);
  for (const text of ["a", "ab", "abc", "abcd"]) {
    await page.fill("#qr-in", text);
    await page.waitForTimeout(150);
  }
  await expect(page.locator("#qr-actions a[download]")).toHaveCount(2);
  await expect(page.locator("#qr-actions .share-btn")).toHaveCount(2);
  const order = await page.locator("#qr-actions").evaluate((el) => [...el.children].map((c) => c.tagName + (c.classList.contains("share-btn") ? ".share" : "")));
  expect(order).toEqual(["A", "BUTTON.share", "A", "BUTTON.share"]);
  await page.locator("#qr-actions .share-btn").last().click();
  await expect.poll(() => shared(page)).toHaveLength(1);
  expect((await shared(page))[0].files[0]).toMatchObject({ name: "qr-code.png", type: "image/png" });
});

test("no Share buttons when the browser refuses the type", async ({ page }) => {
  await stubShare(page, { allow: ["image/png"] });
  await merge(page);
  await expect(page.locator(".share-btn")).toHaveCount(0);
});

test("no Share buttons, and no errors, when the browser has no share at all", async ({ page }) => {
  await stubShare(page, { share: false });
  await merge(page);
  await expect(page.locator(".share-btn")).toHaveCount(0);
  await page.goto("/library/");
  await expect(page.locator("#lib-empty, .rec").first()).toBeVisible();
  await expect(page.locator(".share-btn")).toHaveCount(0);
});

test("closing the share menu is silent", async ({ page }) => {
  await stubShare(page, { fail: "AbortError" });
  await merge(page);
  await page.locator(".share-btn").click();
  await page.waitForTimeout(300);
  await expect(page.locator(".share-note")).toHaveCount(0);
});

test("a share that fails says Download still works", async ({ page }) => {
  await stubShare(page, { fail: "NotAllowedError" });
  await merge(page);
  await page.locator(".share-btn").click();
  await expect(page.locator(".share-note")).toHaveText(FAILED);
  await expect(page.locator('[role="status"]', { hasText: FAILED })).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Download" })).toBeVisible();
});

test("sharing records the job in the library once, and Share works there", async ({ page }) => {
  await stubShare(page);
  await merge(page);
  const name = await page.locator("#pdfm-result a[download]").getAttribute("download");
  await page.locator(".share-btn").click();
  await expect.poll(() => shared(page)).toHaveLength(1);
  await page.locator(".share-btn").click();
  await expect.poll(() => shared(page)).toHaveLength(2);

  const lib = await page.context().newPage();
  await stubShare(lib);
  await lib.goto("/library/");
  await expect(async () => {
    await lib.reload();
    await expect(lib.locator(".rec")).toHaveCount(1, { timeout: 1000 });
  }).toPass();
  await expect(lib.locator(".rec")).toContainText(name);
  const btn = lib.getByRole("button", { name: `Share ${name}` });
  await expect(btn).toHaveCount(1);
  await btn.click();
  await expect.poll(() => shared(lib)).toHaveLength(1);
  const [call] = await shared(lib);
  expect(call.files[0]).toMatchObject({ name, type: "application/pdf" });
  expect(call.files[0].size).toBeGreaterThan(1000);
  await lib.waitForTimeout(300);
  await expect(lib.locator(".rec")).toHaveCount(1);
});

test("an agent call's result in the activity panel gets a Share button", async ({ page }) => {
  await stubShare(page);
  await page.addInitScript(() => {
    window.__registered = {};
    document.modelContext = { registerTool(def) { window.__registered[def.name] = def; } };
    window.__call = (name, args) => window.__registered[name].execute(args, { signal: new AbortController().signal });
  });
  await page.goto("/pdf/merge/");
  await expect.poll(() => page.evaluate(() => "merge_pdfs" in window.__registered)).toBe(true);
  await page.setInputFiles("#pdfm-file", [PDF]);
  await page.evaluate(() => window.__call("merge_pdfs", { files: ["sample.pdf", "sample.pdf"], fileName: "both.pdf" }));
  await expect(page.locator("#agent-log a[download]")).toHaveCount(1);
  const btn = page.locator("#agent-log .share-btn");
  await expect(btn).toHaveCount(1);
  await expect(btn).toHaveAttribute("aria-label", "Share both.pdf");
  await btn.click();
  await expect.poll(() => shared(page)).toHaveLength(1);
  expect((await shared(page))[0].files[0]).toMatchObject({ name: "both.pdf", type: "application/pdf" });
});

test("keyboard: Tab reaches Share and Enter triggers it", async ({ page }) => {
  await stubShare(page);
  await merge(page);
  await page.locator("#pdfm-result a[download]").focus();
  await page.keyboard.press("Tab");
  await expect(page.locator(".share-btn")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect.poll(() => shared(page)).toHaveLength(1);
});

test("a tool page with Share buttons meets WCAG 2.2 AA", async ({ page }) => {
  await stubShare(page);
  await merge(page);
  await expect(page.locator(".share-btn")).toHaveCount(1);
  const { violations } = await new AxeBuilder({ page })
    .options({ runOnly: { type: "tag", values: WCAG }, rules: { "label-content-name-mismatch": { enabled: true } } })
    .analyze();
  const summary = violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).slice(0, 4).join(" | ")}`);
  expect(summary, summary.join("\n")).toEqual([]);
});

test("a share counts as a success in the anonymous totals", async ({ page }) => {
  await stubShare(page);
  const kinds = [];
  page.on("request", (r) => { if (r.url().endsWith("/api/stats/event") && r.method() === "POST") kinds.push(JSON.parse(r.postData()).kind); });
  await merge(page);
  await expect.poll(() => kinds).not.toContain("success");
  await page.locator(".share-btn").click();
  await expect.poll(() => kinds).toContain("success");
});

test("closing the share menu without sharing counts nothing", async ({ page }) => {
  await stubShare(page, { fail: "AbortError" });
  const kinds = [];
  page.on("request", (r) => { if (r.url().endsWith("/api/stats/event") && r.method() === "POST") kinds.push(JSON.parse(r.postData()).kind); });
  await merge(page);
  await page.locator(".share-btn").click();
  await page.waitForTimeout(800);
  expect(kinds).not.toContain("success");
});
