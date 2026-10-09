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
    await expect(page.locator("#pdfs-meta")).toContainText(/^3 pages · .+ · \d+ KB$/);
    await page.click("#pdfs-go");
    await expect(page.getByRole("link", { name: "Download" })).toHaveCount(3);
    const out = await download(page, () => page.getByRole("link", { name: "Download" }).first().click());
    expect(await pageCount(out)).toBe(1);
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
    await expect(page.getByRole("link", { name: "Download" })).toHaveCount(3);
    await page.click('label[for="pdfs-ranges"]');
    await expect(page.getByRole("link", { name: "Download" })).toHaveCount(0);
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

test.describe("PDF to images", () => {
  test.skip(({ isMobile }) => isMobile, "file flows run once, on desktop");
  test("renders every page as a PNG", async ({ page }) => {
    await page.goto("/pdf/to-images/");
    await page.setInputFiles("#p2i-file", PDF);
    await expect(page.locator("#p2i-thumb canvas")).toBeVisible();
    await expect(page.locator("#p2i-meta")).toContainText("3 pages ·");
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

test.describe("phone layout", () => {
  test.skip(({ isMobile }) => !isMobile, "phone only");
  for (const path of ["/", "/pdf/", "/about/", ...TOOLS]) {
    test(`${path} doesn't scroll sideways`, async ({ page }) => {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
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

  test("liking a tool is remembered and counted", async ({ page }) => {
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
