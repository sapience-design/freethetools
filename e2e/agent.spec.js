import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import AxeBuilder from "@axe-core/playwright";

const PDF = "tools/pdf/compress/tests/fixtures/sample.pdf";
const pageCount = async (buf) => (await PDFDocument.load(buf)).getPageCount();

// Every test fails on a page error, a request to another origin, or a CSP violation.
test.beforeEach(async ({ page, isMobile }) => {
  test.skip(isMobile, "agent flows run once, on desktop");
  const problems = [];
  page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" || /Content Security Policy/i.test(m.text())) problems.push(`console: ${m.text()}`); });
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.protocol.startsWith("http") && u.hostname !== new URL(test.info().project.use.baseURL).hostname) problems.push(`offsite: ${r.url()}`);
  });
  page.__problems = problems;
  // A stand-in for WebMCP: remembers what a page registers, and lets a test call execute like an agent.
  await page.addInitScript(() => {
    window.__registered = {};
    document.modelContext = { registerTool(def) { window.__registered[def.name] = def; } };
    window.__call = (name, args) => window.__registered[name].execute(args, { signal: new AbortController().signal });
  });
});
test.afterEach(async ({ page }) => expect(page.__problems ?? []).toEqual([]));

async function download(page, trigger) {
  const [d] = await Promise.all([page.waitForEvent("download"), trigger()]);
  return readFileSync(await d.path());
}
const text = (r) => r.content.map((c) => c.text).join("\n");

test("without WebMCP a tool page registers nothing and shows no agent panel errors", async ({ page }) => {
  await page.addInitScript(() => { delete document.modelContext; });
  await page.goto("/text/case-converter/");
  await expect(page.locator("main h1")).toBeVisible();
  expect(await page.evaluate(() => Object.keys(window.__registered))).toEqual([]);
});

test("a page registers its tool, and a text call shows in the activity panel", async ({ page }) => {
  await page.goto("/text/case-converter/");
  await expect.poll(() => page.evaluate(() => Object.keys(window.__registered).sort())).toEqual(["convert_case", "list_page_files"]);
  const def = await page.evaluate(() => { const d = window.__registered.convert_case; return { description: d.description, inputSchema: d.inputSchema, type: typeof d.execute }; });
  expect(def.type).toBe("function");
  expect(def.inputSchema.properties.case.enum).toContain("title");
  await expect(page.locator("#agent-activity")).toBeHidden();

  const r = await page.evaluate(() => window.__call("convert_case", { text: "free the tools", case: "title" }));
  expect(text(r)).toContain("Free the Tools");
  expect(r.isError).toBeUndefined();
  await expect(page.locator("#agent-activity")).toBeVisible();
  await expect(page.locator("#agent-log li")).toHaveCount(1);
  await expect(page.locator("#agent-log")).toContainText("Free the Tools");
  await expect(page.locator("#agent-status")).toContainText("AI agent used");

  const bad = await page.evaluate(() => window.__call("convert_case", { text: "x", case: "nope" }));
  expect(bad.isError).toBe(true);
  expect(text(bad)).toContain("should be one of");
  await expect(page.locator("#agent-log li")).toHaveCount(2);
  await expect(page.locator("#agent-log li.bad")).toHaveCount(1);
});

test("merge_pdfs uses files the person added; the result is on the page and in the library", async ({ page }) => {
  await page.goto("/pdf/merge/");
  await expect.poll(() => page.evaluate(() => "merge_pdfs" in window.__registered)).toBe(true);
  const empty = await page.evaluate(() => window.__call("list_page_files", {}));
  expect(text(empty)).toContain("No files yet");

  await page.setInputFiles("#pdfm-file", [PDF, PDF]);
  await expect(page.locator("#pdfm-list li")).toHaveCount(2);
  const listed = JSON.parse(text(await page.evaluate(() => window.__call("list_page_files", {}))));
  expect(listed.files).toHaveLength(1); // the same file added twice is listed once
  expect(listed.files[0]).toMatchObject({ name: "sample.pdf", type: "application/pdf" });

  const miss = await page.evaluate(() => window.__call("merge_pdfs", { files: ["nope.pdf", "sample.pdf"] }));
  expect(miss.isError).toBe(true);
  expect(text(miss)).toContain("Files here: sample.pdf");

  const r = await page.evaluate(() => window.__call("merge_pdfs", { files: ["sample.pdf", "sample.pdf"], fileName: "both.pdf" }));
  expect(r.isError).toBeUndefined();
  expect(text(r)).toContain("Merged 2 PDFs into 6 pages");
  expect(text(r)).toContain("both.pdf (application/pdf");
  expect(text(r)).toContain("library");

  const link = page.locator("#agent-log a[download]");
  await expect(link).toHaveCount(1);
  expect(await pageCount(await download(page, () => link.click()))).toBe(6);

  // An inline file works too, and is capped.
  const b64 = readFileSync(PDF).toString("base64");
  const inline = await page.evaluate((b) => window.__call("merge_pdfs", { files: [{ name: "a.pdf", base64: b }, { name: "b.pdf", base64: b }] }), b64);
  expect(inline.isError).toBeUndefined();
  const big = await page.evaluate(() => window.__call("merge_pdfs", { files: [{ name: "big.pdf", base64: "A".repeat(15_000_000) }, "sample.pdf"] }));
  expect(big.isError).toBe(true);
  expect(text(big)).toContain("too big");

  await page.goto("/library/");
  const recs = page.locator("#lib-list li.rec");
  await expect(recs).toHaveCount(4);
  const first = recs.filter({ hasText: "both.pdf" });
  await expect(first).toContainText("by AI agent");
  await expect(first.getByRole("link", { name: "Merge PDFs" })).toHaveAttribute("href", "/pdf/merge/");
  await expect(first).toContainText("sample.pdf");
  const out = await download(page, () => first.getByRole("button", { name: "Download both.pdf" }).click());
  expect(await pageCount(out)).toBe(6);
  await expect(page.locator("#lib-space")).toContainText("Space used");
});

test("compress_pdf runs Ghostscript through the page's worker", async ({ page }) => {
  await page.goto("/pdf/compress/");
  await expect.poll(() => page.evaluate(() => "compress_pdf" in window.__registered)).toBe(true);
  const b64 = readFileSync(PDF).toString("base64");
  const r = await page.evaluate((b) => window.__call("compress_pdf", { file: { name: "sample.pdf", base64: b }, quality: "smallest" }), b64);
  expect(r.isError, text(r)).toBeUndefined();
  expect(text(r)).toMatch(/sample\.pdf/);
  expect(text(r)).toContain("sample_small.pdf");
  const link = page.locator("#agent-log a[download]");
  await expect(link).toHaveCount(1);
  expect(await pageCount(await download(page, () => link.click()))).toBe(3);
});

test("the person's own job is recorded without any change to the tool, and Clear empties the library", async ({ page }) => {
  await page.addInitScript(() => { delete document.modelContext; });
  await page.goto("/pdf/merge/");
  await page.setInputFiles("#pdfm-file", [PDF, PDF]);
  await expect(page.locator("#pdfm-list li")).toHaveCount(2);
  await page.click("#pdfm-go");
  const out = await download(page, () => page.getByRole("link", { name: "Download" }).click());
  expect(await pageCount(out)).toBe(6);
  await page.waitForTimeout(700);

  await page.goto("/library/");
  const rec = page.locator("#lib-list li.rec").first();
  await expect(rec).toBeVisible();
  await expect(rec).toContainText("by you");
  await expect(rec.getByRole("link", { name: "Merge PDFs" })).toHaveAttribute("href", "/pdf/merge/");
  await expect(rec).toContainText("Inputs");
  await expect(rec).toContainText("sample.pdf");
  await expect(page.locator("#lib-list li.rec")).toHaveCount(1);
  const saved = await download(page, () => rec.getByRole("button", { name: /^Download / }).click());
  expect(await pageCount(saved)).toBe(6);

  // Delete is per record; Clear asks first.
  await page.getByRole("button", { name: "Clear library" }).click();
  await expect(page.locator("#lib-confirm")).toBeVisible();
  await page.getByRole("button", { name: "Keep it" }).click();
  await expect(page.locator("#lib-list li.rec")).toHaveCount(1);
  await page.getByRole("button", { name: "Clear library" }).click();
  await page.getByRole("button", { name: "Yes, clear library" }).click();
  await expect(page.locator("#lib-list li.rec")).toHaveCount(0);
  await expect(page.locator("#lib-empty")).toBeVisible();
  await page.reload();
  await expect(page.locator("#lib-list li.rec")).toHaveCount(0);
});

test("Split PDF's several files become one record, and a record can be deleted", async ({ page }) => {
  await page.addInitScript(() => { delete document.modelContext; });
  await page.goto("/pdf/split/");
  await page.setInputFiles("#pdfs-file", PDF);
  await page.click("#pdfs-go");
  await expect(page.getByRole("link", { name: "Download" })).toHaveCount(3);
  await page.waitForTimeout(700);
  await page.goto("/library/");
  await expect(page.locator("#lib-list li.rec")).toHaveCount(1);
  await expect(page.locator("#lib-list li.rec .btn")).toHaveCount(3);
  await expect(page.locator("#lib-list li.rec")).toContainText("Split into: Every page");
  await page.getByRole("button", { name: /^Delete the record/ }).click();
  await expect(page.locator("#lib-list li.rec")).toHaveCount(0);
});

test("the sidebar links to the library, and the folder button explains itself without the API", async ({ page }) => {
  await page.addInitScript(() => { delete window.showDirectoryPicker; });
  await page.goto("/");
  await page.getByRole("link", { name: "Library" }).first().click();
  await expect(page).toHaveURL(/\/library\/$/);
  await expect(page.locator("#lib-empty")).toBeVisible();
  await page.click("#lib-folder");
  await expect(page.locator("#lib-status")).toContainText("Chrome or Edge");
});

test("the library and the agent panel meet WCAG 2.2 AA, in both themes", async ({ page, context }) => {
  const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
  const axe = async (where) => {
    const { violations } = await new AxeBuilder({ page }).options({ runOnly: { type: "tag", values: WCAG }, rules: { "label-content-name-mismatch": { enabled: true } } }).analyze();
    const summary = violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).slice(0, 4).join(" | ")}`);
    expect(summary, `${where}\n${summary.join("\n")}`).toEqual([]);
  };
  for (const theme of ["light", "dark"]) {
    await page.addInitScript((t) => { try { localStorage.setItem("ftt:theme", t); } catch {} }, theme);
    await page.goto("/pdf/merge/");
    await expect.poll(() => page.evaluate(() => "merge_pdfs" in window.__registered)).toBe(true);
    await page.setInputFiles("#pdfm-file", [PDF, PDF]);
    await page.evaluate(() => window.__call("merge_pdfs", { files: ["sample.pdf", "sample.pdf"] }));
    await page.evaluate(() => window.__call("merge_pdfs", { files: ["nope.pdf", "sample.pdf"] }));
    await expect(page.locator("#agent-log li")).toHaveCount(2);
    await axe(`${theme}: tool page with agent activity`);
    await page.goto("/library/");
    await expect(page.locator("#lib-list li.rec").first()).toBeVisible();
    await axe(`${theme}: library with records`);
    await page.getByRole("button", { name: "Clear library" }).click();
    await axe(`${theme}: library confirm step`);
    await page.getByRole("button", { name: "Yes, clear library" }).click();
    await expect(page.locator("#lib-empty")).toBeVisible();
    await axe(`${theme}: empty library`);
  }
});
