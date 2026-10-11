// The full-screen viewer (src/lib/viewer.ts) and the bigger previews: PDF pages, photos, Compare,
// "Show all N pages", page pictures in Compress PDF, PDF to Images and Unlock PDF.
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PDFDocument } from "pdf-lib";
import { withRestrictions } from "../tools/pdf/unlock/tests/helpers.js";
import { deflateSync, crc32 } from "node:zlib";

const PDF = "tools/pdf/compress/tests/fixtures/sample.pdf"; // 3 pages
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

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

async function pdfWithPages(n, name = "long.pdf") {
  const doc = await PDFDocument.create();
  for (let i = 1; i <= n; i++) doc.addPage([400, 520]).drawText(`Page ${i}`, { x: 60, y: 440, size: 40 });
  return { name, mimeType: "application/pdf", buffer: Buffer.from(await doc.save()) };
}

const viewer = (page) => page.locator("dialog#fv");
const pageCanvas = (page) => page.locator("#fv-stage canvas.fv-pic");

/** Open Merge PDF with the sample twice and return the first row's expand button. */
async function mergeWithViewer(page) {
  await page.goto("/pdf/merge/");
  await page.setInputFiles("#pdfm-file", [PDF, PDF]);
  const open = page.locator("#pdfm-list li").first().getByRole("button", { name: "View page 1 full screen" });
  await expect(open).toBeVisible();
  return open;
}

test.describe("full-screen viewer", () => {
  test.skip(({ isMobile }) => isMobile, "file flows run once, on desktop");

  test("Merge PDF: a page picture opens, Next and Previous change the page, zoom works, Escape returns focus", async ({ page }) => {
    const open = await mergeWithViewer(page);
    await open.click();
    await expect(viewer(page)).toBeVisible();
    await expect(viewer(page)).toHaveAttribute("aria-label", "Page 1 of 3, sample.pdf");
    await expect(pageCanvas(page)).toBeVisible();
    // Drawn sharp for the screen: more pixels than the 112 px thumbnail.
    expect((await pageCanvas(page).evaluate((c) => c.width))).toBeGreaterThan(400);
    await expect(page.locator("#fv-pos")).toHaveText("Page 1 of 3");
    await expect(page.locator("#fv-prev")).toBeDisabled();

    await page.locator("#fv-next").click();
    await expect(page.locator("#fv-pos")).toHaveText("Page 2 of 3");
    await expect(page.locator("#fv-live")).toHaveText("Page 2 of 3");
    await expect(viewer(page)).toHaveAttribute("aria-label", "Page 2 of 3, sample.pdf");
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("#fv-pos")).toHaveText("Page 3 of 3");
    await expect(page.locator("#fv-next")).toBeDisabled();
    await page.locator("#fv-prev").click();
    await expect(page.locator("#fv-pos")).toHaveText("Page 2 of 3");
    await page.keyboard.press("ArrowLeft");
    await expect(page.locator("#fv-pos")).toHaveText("Page 1 of 3");

    // Zoom: buttons and keys. The picture grows, "Fit" shows the zoom, 0 and Fit go back.
    await expect(pageCanvas(page)).toBeVisible();
    const fit = await pageCanvas(page).evaluate((c) => c.getBoundingClientRect().width);
    await page.getByRole("button", { name: "Zoom in" }).click();
    await expect(page.locator("#fv-fit")).toHaveText("125%");
    expect(await pageCanvas(page).evaluate((c) => c.getBoundingClientRect().width)).toBeGreaterThan(fit * 1.2);
    await page.keyboard.press("+");
    await expect(page.locator("#fv-fit")).toHaveText("156%");
    await page.keyboard.press("-");
    await expect(page.locator("#fv-fit")).toHaveText("125%");
    await page.keyboard.press("0");
    await expect(page.locator("#fv-fit")).toHaveText("Fit");
    // Zoomed in far enough to need scrolling, the stage pans.
    for (let i = 0; i < 4; i++) await page.keyboard.press("+");
    expect(await page.locator("#fv-stage").evaluate((s) => s.scrollWidth > s.clientWidth || s.scrollHeight > s.clientHeight)).toBe(true);
    await page.locator("#fv-fit").click();

    await page.keyboard.press("Escape");
    await expect(viewer(page)).toBeHidden();
    await expect(open).toBeFocused();
    // Object URLs and pages are let go: opening again starts clean.
    await open.click();
    await expect(page.locator("#fv-pos")).toHaveText("Page 1 of 3");
    await page.locator("#fv-close").click();
    await expect(open).toBeFocused();
  });

  test("Compress Images: the Compare slider opens at full size", async ({ page }) => {
    await page.goto("/images/compress/");
    await page.setInputFiles("#cmi-file", { name: "gradient.png", mimeType: "image/png", buffer: gradientPng(900, 600) });
    await page.click("#cmi-go");
    const full = page.locator("#cmi-list").getByRole("button", { name: "View the comparison full screen" });
    await expect(full).toBeVisible();
    await full.click();
    await expect(viewer(page)).toBeVisible();
    await expect(page.locator("#fv-stage .cmp-range")).toBeVisible();
    await expect(page.locator("#fv-stage .cmp-stage")).toBeVisible();
    // Bigger than the 520 px the inline slider stops at, up to the room there is.
    const box = await page.locator("#fv-stage .cmp-stage").boundingBox();
    expect(box.width).toBeGreaterThan(560);
    await page.locator("#fv-stage .cmp-range").fill("20");
    await page.keyboard.press("Escape");
    await expect(full).toBeFocused();
    // The photo thumbnails open too.
    const thumb = page.locator("#cmi-list li").first().getByRole("button", { name: "View photo full screen" });
    await thumb.click();
    await expect(page.locator("#fv-stage img.fv-pic")).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("Compress PDF shows the first page of the original and of the result, both openable", async ({ page }) => {
    await page.goto("/pdf/compress/");
    await page.setInputFiles("#pdfc-file", PDF);
    await page.click("#pdfc-go");
    const sides = page.locator("#pdfc-results .pdf-side");
    await expect(sides).toHaveCount(2, { timeout: 60000 });
    await expect(sides.nth(0).locator("figcaption")).toContainText(/^Original · /);
    await expect(sides.nth(1).locator("figcaption")).toContainText(/^Compressed · /);
    for (let i = 0; i < 2; i++) {
      await expect(sides.nth(i).locator("canvas")).toBeVisible();
      await sides.nth(i).getByRole("button", { name: /View page 1 full screen/ }).click();
      await expect(pageCanvas(page)).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(viewer(page)).toBeHidden();
    }
  });

  test("PDF to Images: thumbnails open and browse with Previous and Next", async ({ page }) => {
    await page.goto("/pdf/to-images/");
    await page.setInputFiles("#p2i-file", PDF);
    await page.click("#p2i-go");
    await expect(page.locator("#p2i-files li")).toHaveCount(3, { timeout: 60000 });
    await expect(page.locator("#p2i-files li .fthumb img").first()).toBeVisible();
    await page.locator("#p2i-files li").nth(1).getByRole("button", { name: "View page 2 full screen" }).click();
    await expect(page.locator("#fv-pos")).toHaveText("Image 2 of 3");
    await expect(page.locator("#fv-stage img.fv-pic")).toBeVisible();
    await page.locator("#fv-next").click();
    await expect(page.locator("#fv-pos")).toHaveText("Image 3 of 3");
    await page.locator("#fv-prev").click();
    await page.locator("#fv-prev").click();
    await expect(page.locator("#fv-pos")).toHaveText("Image 1 of 3");
    await page.keyboard.press("Escape");
  });

  test("Fill PDF Form: the page picture opens full screen", async ({ page }) => {
    const doc = await PDFDocument.create();
    const p = doc.addPage([400, 300]);
    doc.getForm().createTextField("full_name").addToPage(p, { x: 50, y: 200, width: 200, height: 24 });
    doc.addPage([400, 300]);
    await page.goto("/pdf/fill-form/");
    await page.setInputFiles("#pff-file", { name: "form.pdf", mimeType: "application/pdf", buffer: Buffer.from(await doc.save()) });
    const open = page.locator("#pff-picked").getByRole("button", { name: "View page 1 full screen" });
    await expect(open).toBeVisible();
    await open.click();
    await expect(viewer(page)).toHaveAttribute("aria-label", "Page 1 of 2, form.pdf");
    await expect(pageCanvas(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(open).toBeFocused();
  });

  test("Unlock PDF shows the pages of the unlocked file", async ({ page }) => {
    await page.goto("/pdf/unlock/");
    // Print-restricted but openable: qpdf removes the limits at once.
    await page.setInputFiles("#unlk-file", { name: "limited.pdf", mimeType: "application/pdf", buffer: Buffer.from(withRestrictions) });
    const tiles = page.locator("#unlk-list .page-tile");
    await expect(tiles.first()).toBeVisible({ timeout: 60000 });
    await expect(tiles.first().locator("canvas")).toBeVisible();
    await tiles.first().getByRole("button", { name: "View page 1 full screen" }).click();
    await expect(pageCanvas(page)).toBeVisible();
    await page.keyboard.press("Escape");
  });
});

test.describe("page pictures", () => {
  test.skip(({ isMobile }) => isMobile, "file flows run once, on desktop");

  test("Split PDF: 'Show all 59 pages' draws the rest as they scroll into view; marking and the viewer reach every page", async ({ page }) => {
    await page.goto("/pdf/split/");
    await page.setInputFiles("#pdfs-file", await pdfWithPages(59));
    const tiles = page.locator("#pdfs-pages .page-tile");
    await expect(tiles).toHaveCount(59);
    // Only the first twelve show, drawn at a readable size, and nothing else is drawn yet.
    await expect(page.locator("#pdfs-pages .page-tile:not([hidden])")).toHaveCount(12);
    await expect(tiles.first().locator("canvas")).toBeVisible();
    const tile = await tiles.first().locator(".page-pic").boundingBox();
    expect(tile.width).toBeGreaterThanOrEqual(150);
    expect(await page.locator("#pdfs-pages canvas").count()).toBeLessThanOrEqual(14);

    const showAll = page.getByRole("button", { name: "Show all 59 pages" });
    await expect(showAll).toHaveAttribute("aria-expanded", "false");
    await showAll.click();
    await expect(page.locator("#pdfs-pages .page-tile:not([hidden])")).toHaveCount(59);
    await expect(page.getByRole("button", { name: "Show fewer pages" })).toHaveAttribute("aria-expanded", "true");
    // A tile far down is drawn only once it scrolls into view.
    const last = tiles.nth(58);
    expect(await last.locator("canvas").count()).toBe(0);
    await last.scrollIntoViewIfNeeded();
    await expect(last.locator("canvas")).toBeVisible();

    // Marking works on an expanded tile.
    await page.click('label[for="pdfs-ranges"]');
    await page.fill("#pdfs-range", "50-52, 59");
    await expect(tiles.nth(49)).toHaveClass(/pick/);
    await expect(tiles.nth(58)).toHaveClass(/pick/);
    await expect(tiles.nth(2)).toHaveClass(/dim/);
    await expect(tiles.nth(53)).toHaveClass(/dim/);

    // The viewer browses all pages, not only the shown ones.
    await tiles.nth(49).getByRole("button", { name: "View page 50 full screen" }).click();
    await expect(viewer(page)).toHaveAttribute("aria-label", "Page 50 of 59, long.pdf");
    await expect(pageCanvas(page)).toBeVisible();
    for (let i = 0; i < 9; i++) await page.keyboard.press("ArrowRight");
    await expect(page.locator("#fv-pos")).toHaveText("Page 59 of 59");
    await page.keyboard.press("Escape");
    await page.locator("#pdfs-pages .page-more button").click();
    await expect(page.locator("#pdfs-pages .page-tile:not([hidden])")).toHaveCount(12);
  });

  test("Rotate PDF: turning shows on an expanded tile", async ({ page }) => {
    await page.goto("/pdf/rotate/");
    await page.setInputFiles("#pdfr-file", await pdfWithPages(30));
    await page.getByRole("button", { name: "Show all 30 pages" }).click();
    const tiles = page.locator("#pdfr-pages .page-tile");
    await expect(tiles).toHaveCount(30);
    await expect(tiles.nth(25)).toBeAttached();
    await expect.poll(() => tiles.nth(25).evaluate((t) => /\bt(90|180|270)\b/.test(t.className))).toBe(true);
  });
});

test.describe("accessibility and reflow with the viewer open", () => {
  test.skip(({ isMobile }) => isMobile, "run once, on desktop");

  for (const theme of ["light", "dark"]) {
    test(`${theme}: no WCAG 2.2 AA violations with a PDF page open`, async ({ page, context }) => {
      await context.addInitScript((t) => { try { localStorage.setItem("ftt:theme", t); } catch {} }, theme);
      const open = await mergeWithViewer(page);
      await open.click();
      await expect(pageCanvas(page)).toBeVisible();
      await page.getByRole("button", { name: "Zoom in" }).click();
      const { violations } = await new AxeBuilder({ page })
        .options({ runOnly: { type: "tag", values: WCAG }, rules: { "label-content-name-mismatch": { enabled: true } } })
        .analyze();
      const summary = violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).slice(0, 4).join(" | ")}`);
      expect(summary, summary.join("\n")).toEqual([]);
    });

    test(`${theme}: no violations with the Compare slider open`, async ({ page, context }) => {
      await context.addInitScript((t) => { try { localStorage.setItem("ftt:theme", t); } catch {} }, theme);
      await page.goto("/images/compress/");
      await page.setInputFiles("#cmi-file", { name: "gradient.png", mimeType: "image/png", buffer: gradientPng(900, 600) });
      await page.click("#cmi-go");
      await page.locator("#cmi-list").getByRole("button", { name: "View the comparison full screen" }).click();
      await expect(page.locator("#fv-stage .cmp-stage")).toBeVisible();
      const { violations } = await new AxeBuilder({ page })
        .options({ runOnly: { type: "tag", values: WCAG }, rules: { "label-content-name-mismatch": { enabled: true } } })
        .analyze();
      const summary = violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).slice(0, 4).join(" | ")}`);
      expect(summary, summary.join("\n")).toEqual([]);
    });
  }

  test("at 320 px the viewer and the page pictures do not scroll sideways; buttons are 44 px", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto("/pdf/split/");
    await page.setInputFiles("#pdfs-file", await pdfWithPages(20));
    await page.getByRole("button", { name: "Show all 20 pages" }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    // Two tiles to a row on a phone.
    const a = await page.locator("#pdfs-pages .page-tile").nth(0).boundingBox();
    const b = await page.locator("#pdfs-pages .page-tile").nth(1).boundingBox();
    const c = await page.locator("#pdfs-pages .page-tile").nth(2).boundingBox();
    expect(Math.abs(a.y - b.y)).toBeLessThan(2);
    expect(c.y).toBeGreaterThan(a.y + 50);
    const expand = page.locator("#pdfs-pages .page-tile").nth(0).getByRole("button", { name: "View page 1 full screen" });
    expect((await expand.boundingBox()).width).toBeGreaterThanOrEqual(44);
    await expand.click();
    await expect(pageCanvas(page)).toBeVisible();
    expect(await viewer(page).evaluate((d) => d.scrollWidth <= d.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    for (const name of ["Close", "Next", "Zoom in", "Zoom out", "Fit to screen"]) {
      const box = await page.getByRole("button", { name }).first().boundingBox();
      expect(box.height, name).toBeGreaterThanOrEqual(44);
      expect(box.width, name).toBeGreaterThanOrEqual(44);
    }
  });
});

test.describe("on a touch screen", () => {
  test.skip(({ isMobile }) => !isMobile, "touch only");
  test("the expand button is shown without hovering", async ({ page }) => {
    await page.goto("/pdf/merge/");
    await page.setInputFiles("#pdfm-file", [PDF, PDF]);
    const open = page.locator("#pdfm-list li").first().getByRole("button", { name: "View page 1 full screen" });
    await expect(open).toBeVisible();
    expect(await open.evaluate((b) => getComputedStyle(b).opacity)).toBe("1");
    expect((await open.boundingBox()).height).toBeGreaterThanOrEqual(44);
  });
});
