import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";

const PDF = "tools/pdf/compress/tests/fixtures/sample.pdf";
// Open downloads with pdf-lib: its output uses compressed object streams, so text searches miss.
const pdf = (buf) => PDFDocument.load(buf);
const pageCount = async (buf) => (await pdf(buf)).getPageCount();
// A valid 2x1 PNG, built as a buffer so no fixture file is needed.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAAEElEQVR4nGP4z8DAwMDAAAAN/gH/7yFJ5QAAAABJRU5ErkJggg==", "base64");

const catalogue = JSON.parse(readFileSync("dist/api/tools.json", "utf8"));
const TOOLS = catalogue.categories.flatMap((c) => c.tools).map((t) => new URL(t.url).pathname);

// Every test fails on a page error, a request to another origin, or a CSP violation.
test.beforeEach(async ({ page }) => {
  const problems = [];
  page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" || /Content Security Policy/i.test(m.text())) problems.push(`console: ${m.text()}`); });
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.protocol.startsWith("http") && u.hostname !== new URL(test.info().project.use.baseURL).hostname) problems.push(`offsite: ${r.url()}`);
  });
  page.__problems = problems;
});
test.afterEach(async ({ page }) => expect(page.__problems).toEqual([]));

async function download(page, trigger) {
  const [d] = await Promise.all([page.waitForEvent("download"), trigger()]);
  return readFileSync(await d.path());
}

for (const path of TOOLS) {
  test(`${path} loads cleanly`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator("main h1")).toBeVisible();
    await expect(page.locator("main section.tool, main .shrink").first()).toBeVisible();
  });
}

test.describe("PDF tools", () => {
  test.skip(({ isMobile }) => isMobile, "file flows run once, on desktop");

  test("Merge PDFs combines two files", async ({ page }) => {
    await page.goto("/pdf/merge/");
    await page.setInputFiles("#pdfm-file", [PDF, PDF]);
    await expect(page.locator("#pdfm-list li")).toHaveCount(2);
    await page.click("#pdfm-go");
    const out = await download(page, () => page.getByRole("link", { name: "Download" }).click());
    expect(await pageCount(out)).toBe(6);
  });

  test("Split PDF makes one file per page", async ({ page }) => {
    await page.goto("/pdf/split/");
    await page.setInputFiles("#pdfs-file", PDF);
    await page.click("#pdfs-go");
    await expect(page.getByRole("link", { name: "Download" })).toHaveCount(3);
    const out = await download(page, () => page.getByRole("link", { name: "Download" }).first().click());
    expect(await pageCount(out)).toBe(1);
  });

  test("Split PDF rejects a bad range with a clear message", async ({ page }) => {
    await page.goto("/pdf/split/");
    await page.setInputFiles("#pdfs-file", PDF);
    await page.click('label[for="pdfs-ranges"]');
    await page.fill("#pdfs-range", "2-9");
    await page.click("#pdfs-go");
    await expect(page.locator(".tool-error")).toContainText("outside pages 1 to 3");
  });

  test("Rotate Pages turns every page", async ({ page }) => {
    await page.goto("/pdf/rotate/");
    await page.setInputFiles("#pdfr-file", PDF);
    await page.click("#pdfr-go");
    const out = await download(page, () => page.getByRole("link", { name: "Download" }).click());
    expect((await pdf(out)).getPages().map((p) => p.getRotation().angle)).toEqual([90, 90, 90]);
  });

  test("Images to PDF makes a page per image", async ({ page }) => {
    await page.goto("/pdf/images-to-pdf/");
    await page.setInputFiles("#i2p-file", [{ name: "a.png", mimeType: "image/png", buffer: PNG }, { name: "b.png", mimeType: "image/png", buffer: PNG }]);
    await page.click("#i2p-go");
    const out = await download(page, () => page.getByRole("link", { name: "Download" }).click());
    expect(out.subarray(0, 5).toString()).toBe("%PDF-");
    expect(await pageCount(out)).toBe(2);
  });
});

test.describe("text, data and everyday tools", () => {
  test.skip(({ isMobile }) => isMobile, "interaction checks run once, on desktop");

  test("Word Counter counts as you type", async ({ page }) => {
    await page.goto("/text/word-counter/");
    await page.fill("#wc-in", "one two three four");
    await expect(page.locator("#wc-words")).toHaveText("4");
  });

  test("Case Converter changes case", async ({ page }) => {
    await page.goto("/text/case-converter/");
    await page.fill("#cc-in", "free the tools");
    await page.click('label[for="cc-upper"]');
    await expect(page.locator("#cc-out")).toHaveText("FREE THE TOOLS");
  });

  test("JSON Formatter points at the broken line", async ({ page }) => {
    await page.goto("/data/json-formatter/");
    await page.fill("#jf-in", '{\n  "a": 1,\n}');
    await expect(page.locator("#jf-out")).toContainText("Line 3");
  });

  test("CSV to JSON converts", async ({ page }) => {
    await page.goto("/data/csv-to-json/");
    await page.fill("#cj-in", "a,b\n1,2");
    await expect(page.locator("#cj-out")).toContainText('"a": "1"');
  });

  test("Hash Generator matches the SHA-256 test vector", async ({ page }) => {
    await page.goto("/developer/hash-generator/");
    await page.fill("#hg-in", "abc");
    await expect(page.locator("#hg-list")).toContainText("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  test("QR Code Maker draws a code and offers downloads", async ({ page }) => {
    await page.goto("/developer/qr-code-maker/");
    await expect(page.locator("#qr-code img")).toBeVisible();
    await expect(page.getByRole("link", { name: "Download PNG" })).toBeVisible();
  });

  test("Unit Converter converts inches to centimetres", async ({ page }) => {
    await page.goto("/everyday/unit-converter/");
    await page.selectOption("#uc-from", "in");
    await page.selectOption("#uc-to", "cm");
    await page.fill("#uc-val", "10");
    await expect(page.locator("#uc-out")).toHaveText("10 in = 25.4 cm");
  });

  test("Time Zone Converter lists other cities", async ({ page }) => {
    await page.goto("/everyday/time-zone-converter/");
    await expect(page.locator("#tz-list li").first()).toBeVisible();
  });
});
