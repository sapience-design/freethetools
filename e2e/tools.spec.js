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

// ---- Image tools -------------------------------------------------------------------------------
import { deflateSync, crc32 } from "node:zlib";

function gradientPng(w, h) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = (x * 255) / w; raw[o + 1] = (y * 255) / h; raw[o + 2] = 140; }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

function jpegWithGps() {
  const tiff = Buffer.from([0x49, 0x49, 0x2a, 0, 8, 0, 0, 0, 1, 0, 0x25, 0x88, 4, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const exif = Buffer.concat([Buffer.from("Exif\0\0", "latin1"), tiff]);
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1, (exif.length + 2) >> 8, (exif.length + 2) & 255]), exif]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app1, Buffer.from([0xff, 0xda, 0, 4, 1, 2, 9, 9, 0xff, 0xd9])]);
}

test.describe("image tools", () => {
  test.skip(({ isMobile }) => isMobile, "file flows run once, on desktop");
  const png = () => ({ name: "gradient.png", mimeType: "image/png", buffer: gradientPng(300, 200) });

  test("Resize Images makes the requested width", async ({ page }) => {
    await page.goto("/images/resize/");
    await page.fill("#rsz-w", "150");
    await page.setInputFiles("#rsz-file", png());
    await expect(page.locator("#rsz-list .fmeta")).toContainText("300×200 → 150×100");
  });

  test("Convert Image Format writes a real JPG", async ({ page }) => {
    await page.goto("/images/convert/");
    await page.setInputFiles("#cvi-file", png());
    const out = await download(page, () => page.getByRole("link", { name: "Download" }).click());
    expect(out[0]).toBe(0xff);
    expect(out[1]).toBe(0xd8);
  });

  test("Compress Images reports a result", async ({ page }) => {
    await page.goto("/images/compress/");
    await page.setInputFiles("#cmi-file", png());
    await expect(page.locator("#cmi-list .fmeta")).toContainText(/smaller|Already compact/);
  });

  test("Remove Photo Location strips GPS", async ({ page }) => {
    await page.goto("/images/remove-location/");
    await page.setInputFiles("#rml-file", { name: "photo.jpg", mimeType: "image/jpeg", buffer: jpegWithGps() });
    await expect(page.locator("#rml-list .fmeta")).toContainText("Removed GPS location");
    const out = await download(page, () => page.getByRole("link", { name: "Download" }).click());
    expect(out.toString("hex")).not.toContain("ffe1");
  });
});

test.describe("PDF to images", () => {
  test.skip(({ isMobile }) => isMobile, "file flows run once, on desktop");
  test("renders every page as a PNG", async ({ page }) => {
    await page.goto("/pdf/to-images/");
    await page.setInputFiles("#p2i-file", PDF);
    await page.click("#p2i-go");
    await expect(page.getByRole("link", { name: "Download" })).toHaveCount(3, { timeout: 30_000 });
    const out = await download(page, () => page.getByRole("link", { name: "Download" }).first().click());
    expect(out.subarray(1, 4).toString()).toBe("PNG");
  });
});

test.describe("fill form and developer tools", () => {
  test.skip(({ isMobile }) => isMobile, "interaction checks run once, on desktop");

  test("Fill PDF Form fills and saves the answers", async ({ page }) => {
    const doc = await PDFDocument.create();
    const p = doc.addPage([595, 842]);
    doc.getForm().createTextField("full_name").addToPage(p, { x: 50, y: 700, width: 200, height: 20 });
    doc.getForm().createCheckBox("agree").addToPage(p, { x: 50, y: 650, width: 15, height: 15 });
    const buffer = Buffer.from(await doc.save());
    await page.goto("/pdf/fill-form/");
    await page.setInputFiles("#pff-file", { name: "form.pdf", mimeType: "application/pdf", buffer });
    await page.fill("#pff-f0", "Ada Lovelace");
    await page.check("#pff-f1");
    await page.click("#pff-go");
    const out = await pdf(await download(page, () => page.getByRole("link", { name: "Download" }).click()));
    expect(out.getForm().getTextField("full_name").getText()).toBe("Ada Lovelace");
    expect(out.getForm().getCheckBox("agree").isChecked()).toBe(true);
  });

  test("Password Generator makes a password of the chosen length", async ({ page }) => {
    await page.goto("/developer/password-generator/");
    await expect(page.locator("#pw-out")).toHaveText(/^.{20}$/);
    await expect(page.locator("#pw-meta")).toContainText("bits");
  });

  test("JWT Decoder decodes and verifies the example", async ({ page }) => {
    await page.goto("/developer/jwt-decoder/");
    await expect(page.locator("#jwt-body")).toContainText('"sub": "user-42"');
    await page.fill("#jwt-secret", "free-the-tools");
    await expect(page.locator("#jwt-verdict")).toHaveText("Signature is valid for this secret.");
  });

  test("Regex Tester highlights matches", async ({ page }) => {
    await page.goto("/developer/regex-tester/");
    await expect(page.locator("#rx-count")).toHaveText("2 matches");
    await expect(page.locator("#rx-view mark").first()).toHaveText("ada@example.com");
  });
});
