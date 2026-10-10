import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { unzipSync } from "fflate";
import { OPEN_PASSWORD, withPassword, withRestrictions } from "../tools/pdf/unlock/tests/helpers.js";

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
    await expect(page.locator("#pdfs-meta")).toContainText(/^3 pages · .+ · \d+ KB$/);
    await page.click("#pdfs-go");
    await expect(page.getByRole("link", { name: "Download", exact: true })).toHaveCount(3);
    const out = await download(page, () => page.getByRole("link", { name: "Download", exact: true }).first().click());
    expect(await pageCount(out)).toBe(1);
  });

  test("Split PDF downloads every page as one ZIP", async ({ page }) => {
    await page.goto("/pdf/split/");
    await page.setInputFiles("#pdfs-file", PDF);
    await expect(page.locator("#pdfs-meta")).toContainText(/^3 pages/);
    await page.click("#pdfs-go");
    const all = page.getByRole("link", { name: "Download all (3 files, ZIP)" });
    await expect(all).toBeVisible();
    const out = await download(page, () => all.click());
    const files = unzipSync(new Uint8Array(out));
    const names = Object.keys(files);
    expect(names).toHaveLength(3);
    for (const n of names) {
      expect(n).toMatch(/\.pdf$/);
      expect(await pageCount(Buffer.from(files[n]))).toBe(1);
    }
  });

  test("Merge PDFs keeps keyboard focus on the arrows while reordering", async ({ page }) => {
    await page.goto("/pdf/merge/");
    await page.setInputFiles("#pdfm-file", [PDF, PDF]);
    await page.locator("#pdfm-list li").first().locator('button[data-kind="down"]').click();
    // The moved file is now last, so its down arrow is off; focus moves to its up arrow.
    await expect(page.locator("#pdfm-list li").nth(1).locator('button[data-kind="up"]')).toBeFocused();
  });

  test("Split PDF clears an old result when the options change", async ({ page }) => {
    await page.goto("/pdf/split/");
    await page.setInputFiles("#pdfs-file", PDF);
    await page.click("#pdfs-go");
    await expect(page.getByRole("link", { name: "Download", exact: true })).toHaveCount(3);
    await page.click('label[for="pdfs-ranges"]');
    await expect(page.getByRole("link", { name: "Download", exact: true })).toHaveCount(0);
    await expect(page.locator("#pdfs-result")).toContainText("will appear here");
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
    await expect(page.locator("#i2p-list .fthumb img")).toHaveCount(2);
    await expect(page.locator("#i2p-list .fmeta").first()).toContainText("PNG · 2 × 1");
    await page.click("#i2p-go");
    const out = await download(page, () => page.getByRole("link", { name: "Download" }).click());
    expect(out.subarray(0, 5).toString()).toBe("%PDF-");
    expect(await pageCount(out)).toBe(2);
  });

  // Unlock PDF. The encrypted files are made by qpdf itself from the sample PDF (tools/pdf/unlock/tests/helpers.js).
  const locked = { name: "locked.pdf", mimeType: "application/pdf", buffer: Buffer.from(withPassword) };
  const limited = { name: "limited.pdf", mimeType: "application/pdf", buffer: Buffer.from(withRestrictions) };
  const downloadLink = (page, name) => page.getByRole("link", { name: "Download " + name });

  test("Unlock PDF opens a password-protected file with the right password", async ({ page }) => {
    await page.goto("/pdf/unlock/");
    await page.setInputFiles("#unlk-file", locked);
    const field = page.getByLabel("Password for locked.pdf");
    await expect(field).toHaveAttribute("type", "password");
    await expect(field).toHaveAttribute("autocomplete", "off");
    await expect(page.locator("#unlk-list")).toContainText("Needs a password to open");
    await expect(downloadLink(page, "locked_unlocked.pdf")).toHaveCount(0);
    await field.fill(OPEN_PASSWORD);
    await page.getByRole("button", { name: "Unlock", exact: true }).click();
    await expect(field).toHaveCount(0);
    await expect(page.locator("#unlk-list")).toContainText("Removed the password");
    // The password is not anywhere on the page once it has been used.
    expect(await page.content()).not.toContain(OPEN_PASSWORD);
    const out = await download(page, () => downloadLink(page, "locked_unlocked.pdf").click());
    expect(await pageCount(out)).toBe(3); // pdf-lib refuses encrypted files, so this also proves the lock is gone
    await expect(page.locator("#unlk-status")).toContainText("locked_unlocked.pdf is ready to download");
  });

  test("Unlock PDF explains a wrong password and lets you try again", async ({ page }) => {
    await page.goto("/pdf/unlock/");
    await page.setInputFiles("#unlk-file", locked);
    const field = page.getByLabel("Password for locked.pdf");
    await field.fill("not-the-password");
    await page.getByRole("button", { name: "Unlock", exact: true }).click();
    await expect(page.locator(".tool-error")).toContainText("That password doesn't open this PDF");
    await expect(page.locator("#unlk-status")).toContainText("doesn't open");
    await expect(field).toHaveValue(""); // cleared after use
    await expect(field).toBeFocused();
    await expect(field).toHaveAttribute("aria-invalid", "true");
    expect(await page.content()).not.toContain("not-the-password");
    await field.fill(OPEN_PASSWORD);
    await field.press("Enter");
    await expect(page.locator(".tool-error")).toHaveCount(0);
    const out = await download(page, () => downloadLink(page, "locked_unlocked.pdf").click());
    expect(await pageCount(out)).toBe(3);
  });

  test("Unlock PDF removes restrictions with no password and says which", async ({ page }) => {
    await page.goto("/pdf/unlock/");
    await page.setInputFiles("#unlk-file", limited);
    await expect(page.locator("#unlk-list")).toContainText("Removed the restrictions on printing");
    await expect(page.locator("#unlk-list")).toContainText("copying text and images");
    await expect(page.locator('#unlk-list input[type="password"]')).toHaveCount(0);
    const out = await download(page, () => downloadLink(page, "limited_unlocked.pdf").click());
    expect(await pageCount(out)).toBe(3);
  });

  test("Unlock PDF says when a PDF isn't locked, and offers no download", async ({ page }) => {
    await page.goto("/pdf/unlock/");
    await page.setInputFiles("#unlk-file", PDF);
    await expect(page.locator("#unlk-list")).toContainText("This PDF isn't locked");
    await expect(page.getByRole("link", { name: /Download/ })).toHaveCount(0);
  });

  test("Unlock PDF reports a file that is not a PDF", async ({ page }) => {
    await page.goto("/pdf/unlock/");
    await page.setInputFiles("#unlk-file", { name: "notes.pdf", mimeType: "application/pdf", buffer: Buffer.from("this is not a pdf") });
    await expect(page.locator(".tool-error")).toContainText("notes.pdf could not be read");
  });

  test("Unlock PDF handles several files, one row each", async ({ page }) => {
    await page.goto("/pdf/unlock/");
    await page.setInputFiles("#unlk-file", [locked, limited]);
    await expect(page.locator("#unlk-list li")).toHaveCount(2);
    await expect(downloadLink(page, "limited_unlocked.pdf")).toBeVisible();
    await expect(page.getByLabel("Password for locked.pdf")).toBeFocused(); // the first file that needs one
  });

  test("Unlock PDF works from the keyboard alone", async ({ page }) => {
    await page.goto("/pdf/unlock/");
    await page.waitForLoadState("networkidle");
    // A key press can land before the page's script is ready on a busy machine; pickerFromKey presses again.
    const chooser = await pickerFromKey(page, "#unlk-drop", "Enter");
    await chooser.setFiles(locked);
    const field = page.getByLabel("Password for locked.pdf");
    await expect(field).toBeFocused();
    await page.keyboard.type("wrong-one");
    await page.keyboard.press("Enter");
    await expect(page.locator(".tool-error")).toBeVisible();
    await expect(field).toBeFocused();
    await page.keyboard.type(OPEN_PASSWORD);
    await page.keyboard.press("Tab"); // to the Unlock button
    await expect(page.getByRole("button", { name: "Unlock", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(downloadLink(page, "locked_unlocked.pdf")).toBeFocused();
    const out = await download(page, () => page.keyboard.press("Enter"));
    expect(await pageCount(out)).toBe(3);
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

  test("Markdown to HTML converts, previews, copies and downloads", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => {});
    await page.goto("/text/markdown-to-html/");
    // The example is converted on load.
    await expect(page.locator("#md-out")).toContainText("<h1>Free the Tools</h1>");
    await page.fill("#md-in", "# Hello\n\nSome **bold** text <script>window.__x = 1</script>");
    await expect(page.locator("#md-out")).toContainText("<strong>bold</strong>");
    await expect(page.locator("#md-out")).not.toContainText("<script");
    await expect(page.locator("#md-preview .md-h1")).toHaveText("Hello");
    await expect(page.locator("#md-preview strong")).toHaveText("bold");
    await page.click("#md-copy");
    await expect(page.locator("#md-copy")).toHaveText(/Copied|Select the text/);
    const html = (await download(page, () => page.getByRole("link", { name: "Download .html" }).click())).toString();
    expect(html).toContain("<h1>Hello</h1>");
    // And back again.
    await page.click('label[for="md-h2m"]');
    await page.fill("#md-in", "<h2>Title</h2><ul><li>one</li><li>two</li></ul>");
    await expect(page.locator("#md-out")).toContainText("## Title");
    await expect(page.locator("#md-preview li")).toHaveCount(2);
  });

  test("Markdown to HTML shows Preview or Code in one place, and remembers the choice", async ({ page }) => {
    await page.goto("/text/markdown-to-html/");
    await expect(page.locator("#md-preview")).toBeVisible();
    await expect(page.locator("#md-out")).toBeHidden();
    await expect(page.locator("#md-view-preview")).toBeChecked();
    // Keyboard: the arrow keys move between the two views, like any radio group.
    await page.locator("#md-view-preview").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("#md-view-code")).toBeChecked();
    await expect(page.locator("#md-out")).toBeVisible();
    await expect(page.locator("#md-preview")).toBeHidden();
    await expect(page.locator("#md-out")).toContainText("<h1>Free the Tools</h1>");
    await page.reload();
    await expect(page.locator("#md-view-code")).toBeChecked();
    await expect(page.locator("#md-out")).toBeVisible();
    await page.click('label[for="md-view-preview"]');
    await expect(page.locator("#md-preview")).toBeVisible();
    // An error shows in the open view too.
    await page.fill("#md-in", "");
    await expect(page.locator("#md-preview .md-err")).toBeVisible();
  });

  test("File Converter converts a PNG to BMP and ICO, and a CSV to JSON", async ({ page }) => {
    await page.goto("/everyday/file-converter/");
    // The example file is converted on load.
    await expect(page.locator("#fc-list li").first()).toContainText("example.csv");
    await expect(page.locator("#fc-list li").first().locator("a[download]")).toHaveAttribute("download", "example.json");

    await page.setInputFiles("#fc-file", { name: "pic.png", mimeType: "image/png", buffer: PNG });
    const row = page.locator("#fc-list li").filter({ hasText: "pic.png" });
    await expect(row).toContainText("PNG image");
    await row.getByRole("combobox").selectOption("bmp");
    await expect(row.locator("a[download]")).toHaveAttribute("download", "pic.bmp");
    const bmp = await download(page, () => row.locator("a[download]").click());
    expect(bmp.subarray(0, 2).toString()).toBe("BM");
    expect([bmp.readInt32LE(18), bmp.readInt32LE(22)]).toEqual([2, 1]);
    expect(bmp.length).toBe(54 + 8); // one row of 2 pixels: 6 bytes, padded to 8

    await row.getByRole("combobox").selectOption("ico");
    await expect(row.locator("a[download]")).toHaveAttribute("download", "pic.ico");
    const ico = await download(page, () => row.locator("a[download]").click());
    expect([...ico.subarray(0, 6)]).toEqual([0, 0, 1, 0, 1, 0]);
    expect(ico.subarray(22, 26).toString("latin1")).toBe("\x89PNG");

    await page.setInputFiles("#fc-file", { name: "people.csv", mimeType: "text/csv", buffer: Buffer.from("name,age\nAda,36\nAlan,41") });
    const csv = page.locator("#fc-list li").filter({ hasText: "people.csv" });
    const json = JSON.parse((await download(page, () => csv.locator("a[download]").click())).toString());
    expect(json).toEqual([{ name: "Ada", age: "36" }, { name: "Alan", age: "41" }]);
  });

  test("File Converter says plainly when it can't convert a file, and points to other tools", async ({ page }) => {
    await page.goto("/everyday/file-converter/");
    await page.setInputFiles("#fc-file", [
      { name: "mystery.xyz", mimeType: "application/octet-stream", buffer: Buffer.from([1, 2, 0, 3, 4, 5, 6, 7]) },
      { name: "scan.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%%EOF\n") },
    ]);
    const unknown = page.locator("#fc-list li").filter({ hasText: "mystery.xyz" });
    await expect(unknown).toContainText("can't convert it yet");
    await expect(unknown.getByRole("link", { name: "Request this conversion" })).toHaveAttribute("href", /issues\/new\?template=tool_request\.yml/);
    await expect(unknown.locator("a[download]")).toHaveCount(0);
    const pdf = page.locator("#fc-list li").filter({ hasText: "scan.pdf" });
    await expect(pdf.getByRole("link", { name: "PDF to Images" })).toHaveAttribute("href", "/pdf/to-images/");
    await expect(pdf.getByRole("link", { name: "Compress PDF" })).toHaveAttribute("href", "/pdf/compress/");
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

  test("Time Zone Converter says when a time is skipped or repeated", async ({ page }) => {
    await page.goto("/everyday/time-zone-converter/");
    await page.selectOption("#tz-from", "America/New_York");
    await page.fill("#tz-when", "2026-03-08T02:30");
    await expect(page.locator("#tz-note")).toContainText("2:30 does not exist on 8 March in New York");
    await expect(page.locator("#tz-note")).toContainText("Showing 3:30");
    await page.fill("#tz-when", "2026-11-01T01:30");
    await expect(page.locator("#tz-note")).toContainText("happens twice");
    await page.fill("#tz-when", "2026-09-27T09:00");
    await expect(page.locator("#tz-note")).toBeEmpty();
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

function jpegWithDetails() {
  const dirs = [
    { name: "ifd0", entries: [[0x010f, 2, Buffer.from("Apple\0")], [0x0110, 2, Buffer.from("iPhone 14\0")], [0x8769, 4, { ptr: "exif" }], [0x8825, 4, { ptr: "gps" }]] },
    { name: "exif", entries: [[0x9003, 2, Buffer.from("2024:03:14 10:32:05\0")]] },
    { name: "gps", entries: [[1, 2, Buffer.from("N\0")], [2, 5, rationals(59, 1, 54, 1, 5004, 100)], [3, 2, Buffer.from("E\0")], [4, 5, rationals(10, 1, 45, 1, 792, 100)]] },
  ];
  const at = {};
  let o = 8;
  for (const d of dirs) { at[d.name] = o; o += 2 + d.entries.length * 12 + 4; }
  const t = Buffer.alloc(512);
  t.write("II*\0", 0, "latin1");
  t.writeUInt32LE(at.ifd0, 4);
  let data = o;
  for (const d of dirs) {
    let p = at[d.name];
    t.writeUInt16LE(d.entries.length, p);
    p += 2;
    for (const [tag, type, val] of d.entries) {
      const count = val.ptr ? 1 : type === 5 ? val.length / 8 : val.length;
      t.writeUInt16LE(tag, p); t.writeUInt16LE(type, p + 2); t.writeUInt32LE(count, p + 4);
      if (val.ptr) t.writeUInt32LE(at[val.ptr], p + 8);
      else if (val.length <= 4) val.copy(t, p + 8);
      else { val.copy(t, data); t.writeUInt32LE(data, p + 8); data += val.length + (val.length & 1); }
      p += 12;
    }
  }
  const exif = Buffer.concat([Buffer.from("Exif\0\0", "latin1"), t.subarray(0, data)]);
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1, (exif.length + 2) >> 8, (exif.length + 2) & 255]), exif]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app1, Buffer.from([0xff, 0xda, 0, 4, 1, 2, 9, 9, 0xff, 0xd9])]);
}
function rationals(...v) { const b = Buffer.alloc(v.length * 4); v.forEach((x, i) => b.writeUInt32LE(x, i * 4)); return b; }

test.describe("Video to GIF", () => {
  test.skip(({ isMobile }) => isMobile, "file flows run once, on desktop");

  test("Video to GIF turns a short video into a GIF", async ({ page }) => {
    await page.goto("/images/video-to-gif/");
    await page.setInputFiles("#v2g-file", "tools/images/video-to-gif/tests/fixtures/sample.webm");
    await expect(page.locator("#v2g-meta")).toContainText("seconds");
    await expect(page.locator("#v2g-estimate")).toContainText(/^About .+ frames/);
    await page.locator('label[for="v2g-w320"]').click();
    await page.locator('label[for="v2g-f5"]').click();
    await page.click("#v2g-go");
    await expect(page.locator("#v2g-out img")).toBeVisible({ timeout: 30000 });
    const out = await download(page, () => page.locator("#v2g-out").getByRole("link", { name: /^Download/ }).click());
    expect(out.subarray(0, 6).toString("latin1")).toBe("GIF89a");
    expect(out.readUInt16LE(6)).toBe(320);
  });
});

test.describe("image tools", () => {
  test.skip(({ isMobile }) => isMobile, "file flows run once, on desktop");
  const png = () => ({ name: "gradient.png", mimeType: "image/png", buffer: gradientPng(300, 200) });

  test("Resize Images makes the requested width", async ({ page }) => {
    await page.goto("/images/resize/");
    await page.fill("#rsz-w", "150");
    await page.setInputFiles("#rsz-file", png());
    await expect(page.locator("#rsz-picked .fthumb img")).toBeVisible();
    await expect(page.locator("#rsz-picked .fmeta")).toContainText("PNG · 300 × 200");
    await page.click("#rsz-go");
    await expect(page.locator("#rsz-list .fmeta")).toContainText("300×200 → 150×100");
  });

  test("Convert Image Format writes a real JPG", async ({ page }) => {
    await page.goto("/images/convert/");
    await page.setInputFiles("#cvi-file", png());
    await page.click("#cvi-go");
    const out = await download(page, () => page.getByRole("link", { name: "Download" }).click());
    expect(out[0]).toBe(0xff);
    expect(out[1]).toBe(0xd8);
  });

  test("Convert Image Format offers a ZIP for several photos", async ({ page }) => {
    await page.goto("/images/convert/");
    await page.setInputFiles("#cvi-file", [png(), { ...png(), name: "second.png" }]);
    await page.click("#cvi-go");
    const all = page.getByRole("link", { name: "Download all (2 files, ZIP)" });
    await expect(all).toBeVisible();
    const files = unzipSync(new Uint8Array(await download(page, () => all.click())));
    expect(Object.keys(files).sort()).toEqual(["gradient.jpg", "second.jpg"]);
    expect(files["gradient.jpg"][0]).toBe(0xff);
  });

  test("Compress Images reports a result", async ({ page }) => {
    await page.goto("/images/compress/");
    await page.setInputFiles("#cmi-file", png());
    await page.click("#cmi-go");
    await expect(page.locator("#cmi-list .fmeta")).toContainText(/smaller|Already compact/);
  });

  test("Remove Photo Location strips GPS", async ({ page }) => {
    await page.goto("/images/remove-location/");
    await page.setInputFiles("#rml-file", { name: "photo.jpg", mimeType: "image/jpeg", buffer: jpegWithGps() });
    await expect(page.locator("#rml-picked .ffacts .warn")).toContainText("Location");
    await page.click("#rml-go");
    await expect(page.locator("#rml-list .fmeta")).toContainText("Removed GPS location");
    const out = await download(page, () => page.getByRole("link", { name: "Download" }).click());
    expect(out.toString("hex")).not.toContain("ffe1");
  });
});

test("Remove Photo Location shows where, when and with what a photo was taken", async ({ page, isMobile }) => {
  test.skip(isMobile, "file flows run once, on desktop");
  await page.goto("/images/remove-location/");
  await page.setInputFiles("#rml-file", { name: "trip.jpg", mimeType: "image/jpeg", buffer: jpegWithDetails() });
  const facts = page.locator("#rml-picked .ffacts");
  await expect(facts).toContainText("Location: 59.9139° N, 10.7522° E");
  await expect(facts).toContainText("Camera: Apple iPhone 14");
  await expect(facts).toContainText("Taken:");
});

test("Remove Photo Location says when there is nothing to remove", async ({ page, isMobile }) => {
  test.skip(isMobile, "file flows run once, on desktop");
  await page.goto("/images/remove-location/");
  await page.setInputFiles("#rml-file", { name: "plain.png", mimeType: "image/png", buffer: gradientPng(4, 4) });
  await expect(page.locator("#rml-picked .ffacts .good")).toContainText("already safe to share");
});

test.describe("HEIC to JPG", () => {
  test.skip(({ isMobile }) => isMobile, "file flows run once, on desktop");

  test("converts a HEIC photo to a JPEG", async ({ page }) => {
    await page.goto("/images/heic-to-jpg/");
    await page.setInputFiles("#heic-file", "tools/images/heic-to-jpg/tests/fixtures/sample.heic");
    await page.click("#heic-go");
    const link = page.getByRole("link", { name: "Download" });
    await expect(link).toBeVisible({ timeout: 30000 });
    await expect(page.locator("#heic-list .fmeta")).toContainText("HEIC → JPG");
    const out = await download(page, () => link.click());
    expect([...out.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
  });
});

test.describe("PDF to images", () => {
  test.skip(({ isMobile }) => isMobile, "file flows run once, on desktop");
  test("renders every page as a PNG", async ({ page }) => {
    await page.goto("/pdf/to-images/");
    await page.setInputFiles("#p2i-file", PDF);
    await expect(page.locator("#p2i-thumb canvas")).toBeVisible();
    await expect(page.locator("#p2i-meta")).toContainText("3 pages ·");
    await page.click("#p2i-go");
    await expect(page.getByRole("link", { name: "Download", exact: true })).toHaveCount(3, { timeout: 30_000 });
    const out = await download(page, () => page.getByRole("link", { name: "Download", exact: true }).first().click());
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

test.describe("phone layout", () => {
  test.skip(({ isMobile }) => !isMobile, "phone only");
  for (const path of ["/", "/pdf/", "/about/", "/how-it-works/", ...TOOLS]) {
    test(`${path} doesn't scroll sideways`, async ({ page }) => {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }

  test("a form field's text can't push a 320 px screen sideways", async ({ page }) => {
    // The date field's text width depends on the date, time and fonts; on Linux it once came out
    // 3 px too wide. A large wide font makes that certain.
    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto("/everyday/time-zone-converter/");
    await page.locator("#tz-when").evaluate((i) => { i.style.fontFamily = "Verdana, 'DejaVu Sans', sans-serif"; i.style.fontSize = "24px"; });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  });
});

test.describe("theme, search, sorting, likes and stats", () => {
  test.skip(({ isMobile }) => isMobile, "run once, on desktop");

  test("theme choice sticks across pages", async ({ page }) => {
    await page.goto("/");
    await page.click('[data-theme-set="dark"]');
    await page.goto("/pdf/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.click('[data-theme-set="system"]');
    await page.reload();
    await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/);
  });

  test("search understands other words and typos", async ({ page }) => {
    await page.goto("/");
    await page.fill("#find", "combine pdf");
    await expect(page.locator("#search-results a").first()).toContainText("Merge PDFs");
    await page.fill("#find", "compres");
    await expect(page.locator("#search-results a").first()).toContainText("Compress");
    await page.fill("#find", "make a pdf smaller");
    await expect(page.locator("#search-results a").first()).toContainText("Compress PDF");
  });

  test("A–Z sorts each group, not-built-yet last", async ({ page }) => {
    await page.goto("/");
    await page.click('label[for="sort-az"]');
    for (const g of ["pdf", "images"]) {
      const rows = page.locator(`.gcard[data-g="${g}"] [data-sortable] > li`);
      const names = await rows.locator("xpath=self::li[not(contains(@class,'want'))]").evaluateAll((els) => els.map((e) => e.dataset.name));
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
      const want = await rows.evaluateAll((els) => els.map((e) => e.classList.contains("want")));
      expect(want).toEqual([...want].sort((a, b) => Number(a) - Number(b)));
    }
  });

  test("all four sorts show, with or without usage numbers", async ({ page }) => {
    const labels = ["Most used", "Newest", "Most liked", "A–Z"];
    await page.goto("/");
    for (const l of labels) await expect(page.locator(".segmented label", { hasText: l })).toBeVisible();
    await expect(page.locator("#all-sub")).toHaveText("Most used first in each group");

    // A branch preview has no stats database: the options stay, usage sorts fall back to A to Z,
    // and the label beside "All tools" says so. (An empty answer takes the same path as the
    // preview's 503, without a console error.)
    await page.route("**/api/stats/summary", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
    await page.reload();
    for (const l of labels) await expect(page.locator(".segmented label", { hasText: l })).toBeVisible();
    await page.click('label[for="sort-liked"]');
    await expect(page.locator("#all-sub")).toHaveText("A to Z in each group");
    const names = await page.locator('.gcard[data-g="pdf"] [data-sortable] > li:not(.want)').evaluateAll((els) => els.map((e) => e.dataset.name));
    expect(names).toEqual([...names].sort((x, y) => x.localeCompare(y)));
    await page.click('label[for="sort-new"]');
    await expect(page.locator("#all-sub")).toHaveText("Newest first in each group");
  });

  test("Most people come for shows four at a time, and More tools shows the rest", async ({ page }) => {
    await page.goto("/");
    const pops = page.locator("#pops");
    const whole = () => pops.evaluate((ul) => {
      const box = ul.getBoundingClientRect();
      return [...ul.children].filter((li) => { const r = li.getBoundingClientRect(); return r.left >= box.left - 1 && r.right <= box.right + 1; }).length;
    });
    expect(await whole()).toBe(4);
    const prev = page.getByRole("button", { name: "Previous tools" }), more = page.getByRole("button", { name: "More tools" });
    await expect(prev).toBeDisabled();
    await more.click();
    await expect(more).toBeDisabled();
    await expect(pops.locator("li").last()).toBeInViewport({ ratio: 0.9 });
    // The button that ran out hands keyboard focus to the other one.
    await expect(prev).toBeFocused();
    await prev.click();
    await expect(prev).toBeDisabled();
    await expect(more).toBeFocused();
  });

  test("Sort by sits on the All tools line, moves to a group's results, and hides for a text search", async ({ page }) => {
    await page.goto("/");
    const sort = page.getByRole("group", { name: "Sort by" });
    await expect(page.locator(".all-head #sortrow")).toBeVisible();
    const middle = (b) => b.y + b.height / 2;
    const heading = await page.locator("#all-h").boundingBox();
    expect(Math.abs(middle(await sort.boundingBox()) - middle(heading))).toBeLessThan(24);
    await page.click('.chip[data-cat="pdf"]');
    await expect(page.locator(".results-head #sortrow")).toBeVisible();
    // Search results are in best-match order, so there is nothing to sort.
    await page.fill("#find", "pdf");
    await expect(sort).toBeHidden();
    await page.fill("#find", "");
    await page.click('.chip[data-cat="all"]');
    await expect(page.locator(".all-head #sortrow")).toBeVisible();
  });

  test("nothing found is centred under the search box", async ({ page }) => {
    await page.goto("/");
    await page.fill("#find", "zzzz");
    await expect(page.locator("#results-empty")).toBeVisible();
    await expect(page.locator("#results")).toHaveCSS("text-align", "center");
    const centre = (b) => b.x + b.width / 2;
    const box = await page.locator(".find-box").boundingBox();
    expect(Math.abs(centre(await page.locator("#results-clear").boundingBox()) - centre(box))).toBeLessThan(4);
  });

  test("a favourite is remembered and counted as a like", async ({ page }) => {
    await page.goto("/text/case-converter/");
    await page.click("#tool-like");
    await expect(page.locator("#tool-like")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#tool-like-count")).toHaveText(/^[1-9]/);
    await page.reload();
    await expect(page.locator("#tool-like")).toHaveAttribute("aria-pressed", "true");
    await page.click("#tool-like"); // leave the shared test database as we found it
  });

  test("stats API accepts events from the site and rejects other origins", async ({ page, request, baseURL }) => {
    const ok = await request.post("/api/stats/event", { headers: { Origin: baseURL }, data: { tool: "pdf/merge", kind: "view" } });
    expect(ok.status()).toBe(204);
    const foreign = await request.post("/api/stats/event", { headers: { Origin: "https://evil.example" }, data: { tool: "pdf/merge", kind: "view" } });
    expect(foreign.status()).toBe(403);
    const unknown = await request.post("/api/stats/event", { headers: { Origin: baseURL }, data: { tool: "nope/nope", kind: "view" } });
    expect(unknown.status()).toBe(400);
    const summary = await request.get("/api/stats/summary");
    expect(summary.ok()).toBe(true);
    expect((await summary.json()).tools).toBeTruthy();
    await page.goto("/stats/");
    await expect(page.locator("#st-table tbody tr").first()).toBeVisible();
  });

  test("a visit is counted once, with only a source name, country and device type", async ({ page, request, baseURL }) => {
    const visit = page.waitForRequest((r) => r.url().endsWith("/api/stats/visit") && r.method() === "POST");
    await page.goto("/");
    expect(Object.keys((await visit).postDataJSON()).sort()).toEqual(["device", "ref"]);
    let again = false;
    page.on("request", (r) => { if (r.url().endsWith("/api/stats/visit")) again = true; });
    await page.goto("/pdf/");
    await page.waitForLoadState("networkidle");
    expect(again).toBe(false);

    const res = await request.post("/api/stats/visit", { headers: { Origin: baseURL }, data: { ref: "news.ycombinator.com", device: "tablet" } });
    expect(res.status()).toBe(204);
    const { site } = await (await request.get(`/api/stats/summary?fresh=${Date.now()}`)).json();
    expect(site.visits30).toBeGreaterThan(0);
    expect(site.referrers.map(([k]) => k)).toContain("Hacker News");
    expect(site.devices.map(([k]) => k)).toContain("tablet");
    await page.goto("/stats/");
    await expect(page.locator("#st-referrers li").first()).not.toHaveText("");
    await expect(page.locator("#st-visits")).toHaveText(/\d+ visits?/);
  });

  test("copying a result counts a success for that tool", async ({ page }) => {
    await page.goto("/text/case-converter/");
    await page.fill("#cc-in", "hello there");
    const ev = page.waitForRequest((r) => r.url().endsWith("/api/stats/event") && r.postDataJSON()?.kind === "success");
    await page.click("#cc-copy");
    expect((await ev).postDataJSON()).toEqual({ tool: "text/case-converter", kind: "success" });
  });

  test("unknown pages get the 404 page", async ({ request }) => {
    const res = await request.get("/no-such-tool/");
    expect(res.status()).toBe(404);
    expect(await res.text()).toContain("isn't here");
  });
});

// ---- Fixes from the tools review ----

/** Count the times a node's text is written (even to the same words) from now on. */
async function watchWrites(page, selector) {
  await page.evaluate((sel) => {
    window.__writes = 0;
    new MutationObserver((m) => { window.__writes += m.length; }).observe(document.querySelector(sel), { childList: true, characterData: true, subtree: true });
  }, selector);
}
const writes = (page) => page.evaluate(() => window.__writes);

/** Focus a button and press a key; the file picker must open. Chromium sometimes drops a keypress
 *  on a busy machine, so press again if nothing happens. One listener covers every press: a picker
 *  can open after a short wait has given up, and a browser shows only one picker at a time. */
async function pickerFromKey(page, selector, key) {
  const chooser = page.waitForEvent("filechooser", { timeout: 20000 });
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.locator(selector).focus();
    await page.keyboard.press(key);
    if (await Promise.race([chooser.then(() => true, () => false), page.waitForTimeout(4000).then(() => false)])) break;
  }
  return chooser;
}

test.describe("Open a file button and live regions", () => {
  const OPENERS = [
    // The last column is something only the page's script fills in, so the click handler is wired.
    ["/text/markdown-to-html/", "#md-open", "#md-out"],
    ["/data/csv-to-json/", "#cj-open", "#cj-out"],
    ["/developer/base64/", "#b64-open", "#b64-out"],
    ["/developer/hash-generator/", "#hg-open", "#hg-list li"],
  ];
  for (const [path, button, ready] of OPENERS) {
    for (const key of ["Enter", "Space"]) {
      test(`${path} opens the file picker from the keyboard (${key})`, async ({ page }) => {
        await page.goto(path);
        await expect(page.locator(ready).first()).not.toBeEmpty();
        await expect(page.locator(button)).toHaveJSProperty("tagName", "BUTTON");
        const chooser = await pickerFromKey(page, button, key === "Space" ? " " : "Enter");
        expect(chooser.isMultiple()).toBe(false);
      });
    }
  }

  test("Markdown to HTML: a file chosen with the button is loaded", async ({ page }) => {
    await page.goto("/text/markdown-to-html/");
    await expect(page.locator("#md-out")).not.toBeEmpty();
    const chooser = await pickerFromKey(page, "#md-open", "Enter");
    await chooser.setFiles({ name: "note.md", mimeType: "text/markdown", buffer: Buffer.from("# From a file") });
    await expect(page.locator("#md-in")).toHaveValue("# From a file");
    await expect(page.locator("#md-out")).toContainText("<h1>From a file</h1>");
  });

  test("Markdown to HTML: the result box is not live, and the status is written only when it changes", async ({ page }) => {
    await page.goto("/text/markdown-to-html/");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("#md-out")).not.toHaveAttribute("aria-live", /.+/);
    const live = page.locator("#md-live");
    await expect(live).toHaveAttribute("role", "status");
    await expect(live).toHaveText("HTML ready, cleaned");
    await watchWrites(page, "#md-live");
    await page.locator("#md-in").pressSequentially(" more words", { delay: 10 });
    expect(await writes(page)).toBe(0);
    await page.locator("#md-clean").uncheck();
    await expect(live).toHaveText("HTML ready, exactly as written");
    expect(await writes(page)).toBeGreaterThan(0);
  });

  test("Markdown to HTML: an error is announced once, not on every keystroke", async ({ page }) => {
    await page.goto("/text/markdown-to-html/");
    await page.waitForLoadState("networkidle");
    await page.fill("#md-in", "");
    await expect(page.locator("#md-live")).toContainText("Type or paste some Markdown");
    await watchWrites(page, "#md-live");
    await page.locator("#md-in").pressSequentially("   ", { delay: 10 });
    expect(await writes(page)).toBe(0);
  });

  test("Regex Tester writes its alert only when the message changes", async ({ page }) => {
    await page.goto("/developer/regex-tester/");
    await page.waitForLoadState("networkidle");
    await page.fill("#rx-pattern", "(");
    const err = page.locator("#rx-err");
    await expect(err).toBeVisible();
    await watchWrites(page, "#rx-err");
    await page.locator("#rx-text").pressSequentially("abc", { delay: 10 });
    expect(await writes(page)).toBe(0);
    await page.fill("#rx-pattern", "a");
    await expect(err).toBeHidden();
  });

  test("JWT Decoder writes its alert only when the message changes", async ({ page }) => {
    await page.goto("/developer/jwt-decoder/");
    await page.waitForLoadState("networkidle");
    await page.fill("#jwt-in", "abc");
    await expect(page.locator("#jwt-err")).toBeVisible();
    await watchWrites(page, "#jwt-err");
    await page.locator("#jwt-in").pressSequentially("def", { delay: 10 });
    expect(await writes(page)).toBe(0);
  });

  test("QR Code Maker writes its alert only when the message changes", async ({ page }) => {
    await page.goto("/developer/qr-code-maker/");
    await page.waitForLoadState("networkidle");
    await page.fill("#qr-in", "");
    await expect(page.locator("#qr-err")).toBeVisible();
    await watchWrites(page, "#qr-err");
    await page.locator("label[for=qr-H]").click();
    await page.locator("label[for=qr-Q]").click();
    await page.waitForTimeout(100);
    expect(await writes(page)).toBe(0);
  });
});

test.describe("File Converter text files", () => {
  const row = (page, name) => page.locator("#fc-list li").filter({ hasText: name });

  test("a semicolon CSV in Windows-1252 becomes columns with the accent intact, and the row says so", async ({ page }) => {
    await page.goto("/everyday/file-converter/");
    await page.setInputFiles("#fc-file", { name: "cities.csv", mimeType: "text/csv", buffer: Buffer.from("name;city\nAda;Zürich", "latin1") });
    const r = row(page, "cities.csv");
    await expect(r).toContainText("semicolon separated");
    await expect(r).toContainText("Windows-1252");
    const json = JSON.parse((await download(page, () => r.locator("a[download]").click())).toString());
    expect(json).toEqual([{ name: "Ada", city: "Zürich" }]);
  });

  test("a UTF-16 text file with a byte order mark converts", async ({ page }) => {
    await page.goto("/everyday/file-converter/");
    const buffer = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("a,b\n1,2", "utf16le")]);
    await page.setInputFiles("#fc-file", { name: "wide.csv", mimeType: "text/csv", buffer });
    const r = row(page, "wide.csv");
    await expect(r).toContainText("CSV table");
    expect(JSON.parse((await download(page, () => r.locator("a[download]").click())).toString())).toEqual([{ a: "1", b: "2" }]);
  });

  test("repeated column names are reported in the row", async ({ page }) => {
    await page.goto("/everyday/file-converter/");
    await page.setInputFiles("#fc-file", { name: "dup.csv", mimeType: "text/csv", buffer: Buffer.from("a,a\n1,2") });
    await expect(row(page, "dup.csv")).toContainText("renamed");
  });

  test("a .txt file becomes escaped paragraphs, not Markdown", async ({ page }) => {
    await page.goto("/everyday/file-converter/");
    await page.setInputFiles("#fc-file", { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("* star\nsecond line\n\nnew <b>paragraph</b>") });
    const html = (await download(page, () => row(page, "notes.txt").locator("a[download]").click())).toString();
    expect(html).toContain("<p>* star<br>\nsecond line</p>");
    expect(html).toContain("<p>new &lt;b&gt;paragraph&lt;/b&gt;</p>");
    expect(html).not.toContain("<li>");
  });

  test("very long audio waits for a go-ahead before it is decoded", async ({ page }) => {
    await page.goto("/everyday/file-converter/");
    // About 40 MB at a typical MP3 rate is over half an hour.
    const buffer = Buffer.concat([Buffer.from("ID3"), Buffer.alloc(40 * 1024 * 1024)]);
    await page.setInputFiles("#fc-file", { name: "long.mp3", mimeType: "audio/mpeg", buffer });
    const r = row(page, "long.mp3");
    await expect(r).toContainText("minutes long");
    await expect(r.getByRole("button", { name: /Convert long.mp3 anyway/ })).toBeVisible();
    await expect(r.locator("a[download]")).toHaveCount(0);
  });
});

test.describe("home search status", () => {
  test.skip(({ isMobile }) => isMobile, "run once, on desktop");

  test("the arrow-key hint is spoken once per search, and the selected result reads as name, group and position", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const status = page.locator("#find-status");
    await page.locator("#find").focus();
    await page.keyboard.type("p");
    await expect(status).toContainText("arrow keys");
    await page.keyboard.type("df");
    await expect(status).toHaveText(/^\d+ tools?\.$/);
    await page.keyboard.press("ArrowDown");
    const row = page.locator("#search-results > li").nth(1);
    const name = await row.getAttribute("data-name");
    const group = await page.locator(`.chip[data-cat="${await row.getAttribute("data-g")}"]`).getAttribute("data-label");
    const total = await page.locator("#search-results a").count();
    await expect(status).toHaveText(`${name}, ${group}, 2 of ${total}`);
    // A new search says the hint again.
    await page.fill("#find", "");
    await page.keyboard.type("m");
    await expect(status).toContainText("arrow keys");
  });

  test("typing more letters that give the same results does not rewrite the status", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.locator("#find").focus();
    await page.keyboard.type("zzzz");
    await expect(page.locator("#find-status")).toContainText(/no tool matches/i);
    await watchWrites(page, "#find-status");
    await page.keyboard.type("zz");
    expect(await writes(page)).toBe(0);
  });

  test("a group chip says what it shows", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.locator('.chip[data-cat="text"]').click();
    await expect(page.locator("#find-status")).toHaveText(/^Showing Text tools: \d+ tools?\.$/);
  });
});

test.describe("without JavaScript", () => {
  test.skip(({ isMobile }) => !isMobile, "phone only");
  test.use({ javaScriptEnabled: false });

  test("the top bar works and every tool is linked from the home page", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("navigation", { name: "Site" }).getByRole("link", { name: "About" })).toBeVisible();
    const linked = await page.locator("[data-sortable] > li:not(.want) a").evaluateAll((as) => as.map((a) => new URL(a.href).pathname));
    for (const path of TOOLS) expect(linked, `${path} is linked`).toContain(path);
  });
});

test.describe("a click opens the file picker", () => {
  test.skip(({ isMobile }) => isMobile, "runs once, on desktop");
  // Every drop area shows a Choose button; tools without one have an "Open a file" button.
  const PICKERS = [
    ["/pdf/merge/", ".drop .drop-btn"], ["/pdf/split/", ".drop .drop-btn"], ["/pdf/rotate/", ".drop .drop-btn"],
    ["/pdf/fill-form/", ".drop .drop-btn"], ["/pdf/images-to-pdf/", ".drop .drop-btn"], ["/pdf/to-images/", ".drop .drop-btn"],
    ["/pdf/compress/", ".drop .drop-btn"], ["/images/compress/", ".drop .drop-btn"], ["/images/convert/", ".drop .drop-btn"],
    ["/images/resize/", ".drop .drop-btn"], ["/images/remove-location/", ".drop .drop-btn"], ["/everyday/file-converter/", ".drop .drop-btn"],
    ["/text/markdown-to-html/", "#md-open"], ["/data/csv-to-json/", "#cj-open"], ["/developer/base64/", "#b64-open"], ["/developer/hash-generator/", "#hg-open"],
  ];
  for (const [path, button] of PICKERS) {
    test(`${path}: clicking ${button} opens the file picker`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await expect(page.locator(button)).toBeVisible();
      // One listener for every try: a picker can open after a short wait gives up.
      const chooser = page.waitForEvent("filechooser", { timeout: 20000 });
      for (let i = 0; i < 3; i++) {
        await page.locator(button).click();
        if (await Promise.race([chooser.then(() => true, () => false), page.waitForTimeout(4000).then(() => false)])) break;
      }
      expect(await chooser).toBeTruthy();
    });
  }
});
