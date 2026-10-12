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
    await expect(page.locator("#fv-level")).not.toHaveValue("page");
    const zoomed = await pageCanvas(page).evaluate((c) => c.getBoundingClientRect().width);
    expect(zoomed).toBeGreaterThan(fit * 1.2);
    await page.keyboard.press("+");
    expect(await pageCanvas(page).evaluate((c) => c.getBoundingClientRect().width)).toBeGreaterThan(zoomed * 1.2);
    await page.keyboard.press("-");
    expect(Math.abs((await pageCanvas(page).evaluate((c) => c.getBoundingClientRect().width)) - zoomed)).toBeLessThan(4);
    await page.keyboard.press("0");
    await expect(page.locator("#fv-level")).toHaveValue("page");
    // Zoomed in far enough to need scrolling, the stage pans.
    for (let i = 0; i < 4; i++) await page.keyboard.press("+");
    expect(await page.locator("#fv-stage").evaluate((s) => s.scrollWidth > s.clientWidth || s.scrollHeight > s.clientHeight)).toBe(true);
    await page.locator("#fv-fit").click();
    await expect(page.locator("#fv-level")).toHaveValue("page");

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

/** Open Split PDF with an n-page file and open page 1 in the viewer. */
async function openLong(page, n) {
  await page.goto("/pdf/split/");
  await page.setInputFiles("#pdfs-file", await pdfWithPages(n));
  const open = page.locator("#pdfs-pages .page-tile").first().getByRole("button", { name: "View page 1 full screen" });
  await expect(open).toBeVisible();
  await open.click();
  await expect(viewer(page)).toBeVisible();
  await expect(pageCanvas(page).first()).toBeVisible();
  return open;
}
const layoutRadio = (page, name) => page.getByRole("radio", { name });
const pos = (page) => page.locator("#fv-pos");

test.describe("viewer page layouts", () => {
  test.skip(({ isMobile }) => isMobile, "file flows run once, on desktop");

  test("the layout control is a radio group with four named options, shown for PDFs", async ({ page }) => {
    await openLong(page, 9);
    const group = page.getByRole("radiogroup", { name: "Page layout" });
    await expect(group).toBeVisible();
    await expect(group.getByRole("radio")).toHaveCount(4);
    for (const n of ["One page", "Two pages", "Grid", "Scroll"]) await expect(layoutRadio(page, n)).toBeAttached();
    await expect(layoutRadio(page, "One page")).toBeChecked();
  });

  test("each layout shows the right number of pages and Previous and Next step by 1, 2 and 4", async ({ page }) => {
    await openLong(page, 9);
    await expect(pageCanvas(page)).toHaveCount(1);
    await page.locator("#fv-next").click();
    await expect(pos(page)).toHaveText("Page 2 of 9");

    await page.getByText("Two pages", { exact: true }).click();
    await expect(layoutRadio(page, "Two pages")).toBeChecked();
    await expect(pageCanvas(page)).toHaveCount(2);
    await expect(pos(page)).toHaveText("Pages 1–2 of 9");
    // Two canvases side by side.
    const [a, b] = await pageCanvas(page).evaluateAll((cs) => cs.map((c) => c.getBoundingClientRect()).map((r) => ({ x: r.x, y: r.y })));
    expect(b.x).toBeGreaterThan(a.x + 50);
    expect(Math.abs(a.y - b.y)).toBeLessThan(2);
    await page.locator("#fv-next").click();
    await expect(pos(page)).toHaveText("Pages 3–4 of 9");
    await expect(pageCanvas(page)).toHaveCount(2);
    await page.locator("#fv-prev").click();
    await expect(pos(page)).toHaveText("Pages 1–2 of 9");
    await expect(page.locator("#fv-prev")).toBeDisabled();

    await page.getByText("Grid", { exact: true }).click();
    await expect(page.locator("#fv-stage .fv-cell")).toHaveCount(4);
    await expect(pos(page)).toHaveText("Pages 1–4 of 9");
    await expect(page.locator("#fv-stage canvas.fv-pic")).toHaveCount(4);
    await page.locator("#fv-next").click();
    await expect(pos(page)).toHaveText("Pages 5–8 of 9");
    await page.locator("#fv-next").click();
    await expect(pos(page)).toHaveText("Page 9 of 9");
    await expect(page.locator("#fv-stage .fv-cell")).toHaveCount(1);
    await expect(page.locator("#fv-next")).toBeDisabled();

    await page.getByText("Scroll", { exact: true }).click();
    await expect(page.locator("#fv-stage .fv-cell")).toHaveCount(9);
    await page.getByText("One page", { exact: true }).click();
    await expect(page.locator("#fv-stage .fv-cell")).toHaveCount(1);
  });

  test("keys 1, 2, 4 and S switch layouts", async ({ page }) => {
    await openLong(page, 9);
    await page.keyboard.press("2");
    await expect(layoutRadio(page, "Two pages")).toBeChecked();
    await page.keyboard.press("4");
    await expect(layoutRadio(page, "Grid")).toBeChecked();
    await page.keyboard.press("s");
    await expect(layoutRadio(page, "Scroll")).toBeChecked();
    await page.keyboard.press("1");
    await expect(layoutRadio(page, "One page")).toBeChecked();
  });

  test("Grid: selecting a page opens it in One page", async ({ page }) => {
    await openLong(page, 9);
    await page.keyboard.press("4");
    await expect(page.locator("#fv-stage canvas.fv-pic")).toHaveCount(4);
    await page.getByRole("button", { name: "Open page 3" }).click();
    await expect(pos(page)).toHaveText("Page 3 of 9");
    await expect(layoutRadio(page, "One page")).toBeChecked();
    await expect(pageCanvas(page)).toHaveCount(1);
  });

  test("Scroll: pages are drawn as they come into view, let go when far, and the page label follows", async ({ page }) => {
    await openLong(page, 59);
    await page.keyboard.press("s");
    await expect(page.locator("#fv-stage .fv-cell")).toHaveCount(59);
    await expect(pageCanvas(page).first()).toBeVisible();
    const drawn = () => page.locator("#fv-stage canvas.fv-pic").count();
    await expect.poll(drawn).toBeGreaterThan(0);
    expect(await drawn()).toBeLessThanOrEqual(10);
    await expect(pos(page)).toHaveText("Page 1 of 59");

    // The arrows and Page Down scroll.
    const top = () => page.locator("#fv-stage").evaluate((s) => s.scrollTop);
    await page.keyboard.press("ArrowDown");
    await expect.poll(top).toBeGreaterThan(0);
    const t1 = await top();
    await page.keyboard.press("PageDown");
    await expect.poll(top).toBeGreaterThan(t1 + 200);

    // Far down: the label follows, the page there is drawn, and page 1 has been let go.
    await page.locator("#fv-stage").evaluate((s) => { s.scrollTop = s.scrollHeight * 0.5; });
    await expect.poll(async () => Number(/Page (\d+) of 59/.exec((await pos(page).textContent()) ?? "")?.[1])).toBeGreaterThan(20);
    await page.locator("#fv-stage").evaluate((s) => { s.scrollTop = s.scrollHeight; });
    await expect(pos(page)).toHaveText("Page 59 of 59");
    await expect(page.locator('#fv-stage .fv-cell[data-i="59"] canvas')).toHaveCount(1);
    await expect(page.locator('#fv-stage .fv-cell[data-i="1"] canvas')).toHaveCount(0);
    expect(await drawn()).toBeLessThanOrEqual(12);
    await expect(page.locator("#fv-next")).toBeDisabled();
    await page.locator("#fv-prev").click();
    await expect(pos(page)).toHaveText("Page 58 of 59");
  });

  test("the zoom menu sizes pages in every layout; Fit width fits the column", async ({ page }) => {
    await openLong(page, 5);
    const level = page.getByRole("combobox", { name: "Zoom level" });
    await expect(level.locator("option")).toHaveText(["Fit page", "Fit width", "50%", "75%", "100%", "125%", "150%", "200%"]);
    const w = () => pageCanvas(page).first().evaluate((c) => c.getBoundingClientRect().width);
    await level.selectOption("50");
    await expect.poll(w).toBeLessThan(280);
    await level.selectOption("200");
    await expect.poll(w).toBeGreaterThan(700);
    // 100% is the page's own size: a 400 pt page is 533 CSS pixels wide.
    await level.selectOption("100");
    await expect.poll(async () => Math.round(await w())).toBe(533);
    await page.keyboard.press("2");
    await level.selectOption("50");
    await expect(pageCanvas(page)).toHaveCount(2);
    await expect.poll(w).toBeLessThan(280);
    await page.keyboard.press("s");
    await level.selectOption("width");
    const room = await page.locator("#fv-stage").evaluate((s) => { const cs = getComputedStyle(s); return s.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight); });
    await expect.poll(async () => Math.abs((await w()) - room)).toBeLessThan(3);
    await level.selectOption("page");
    await expect.poll(async () => (await w()) < room).toBe(true);
  });

  test("the last layout and zoom are remembered for the next file", async ({ page }) => {
    await openLong(page, 9);
    await page.keyboard.press("2");
    await page.getByRole("combobox", { name: "Zoom level" }).selectOption("75");
    await page.keyboard.press("Escape");
    await expect(viewer(page)).toBeHidden();
    // Same page, then after a reload: sessionStorage keeps it for the tab.
    await page.locator("#pdfs-pages .page-tile").first().getByRole("button", { name: "View page 1 full screen" }).click();
    await expect(layoutRadio(page, "Two pages")).toBeChecked();
    await expect(page.getByRole("combobox", { name: "Zoom level" })).toHaveValue("75");
    await page.keyboard.press("Escape");
    await page.goto("/pdf/split/");
    await page.setInputFiles("#pdfs-file", await pdfWithPages(4, "other.pdf"));
    await page.locator("#pdfs-pages .page-tile").first().getByRole("button", { name: "View page 1 full screen" }).click();
    await expect(layoutRadio(page, "Two pages")).toBeChecked();
    await expect(page.getByRole("combobox", { name: "Zoom level" })).toHaveValue("75");
    await expect(pageCanvas(page)).toHaveCount(2);
  });

  test("Two pages is unavailable on a narrow window and falls back to One page", async ({ page }) => {
    await openLong(page, 9);
    await page.keyboard.press("2");
    await expect(pageCanvas(page)).toHaveCount(2);
    await page.setViewportSize({ width: 600, height: 900 });
    await expect(layoutRadio(page, "Two pages")).toBeDisabled();
    await expect(layoutRadio(page, "One page")).toBeChecked();
    await expect(pageCanvas(page)).toHaveCount(1);
    await page.keyboard.press("2");
    await expect(pageCanvas(page)).toHaveCount(1);
    // Wide again: the choice comes back.
    await page.setViewportSize({ width: 1200, height: 900 });
    await expect(layoutRadio(page, "Two pages")).toBeEnabled();
    await expect(layoutRadio(page, "Two pages")).toBeChecked();
    await expect(pageCanvas(page)).toHaveCount(2);
  });

  test("PDF to Images: Grid and Scroll arrange the picture set", async ({ page }) => {
    await page.goto("/pdf/to-images/");
    await page.setInputFiles("#p2i-file", PDF);
    await page.click("#p2i-go");
    await expect(page.locator("#p2i-files li")).toHaveCount(3, { timeout: 60000 });
    await page.locator("#p2i-files li").first().getByRole("button", { name: "View page 1 full screen" }).click();
    await expect(pos(page)).toHaveText("Image 1 of 3");
    await page.keyboard.press("4");
    await expect(page.locator("#fv-stage img.fv-pic")).toHaveCount(3);
    await expect(pos(page)).toHaveText("Images 1–3 of 3");
    await page.getByRole("button", { name: "Open image 2" }).click();
    await expect(pos(page)).toHaveText("Image 2 of 3");
    await page.keyboard.press("s");
    await expect(page.locator("#fv-stage .fv-cell")).toHaveCount(3);
    await page.keyboard.press("Escape");
  });

  for (const theme of ["light", "dark"]) {
    test(`${theme}: no WCAG 2.2 AA violations with each layout open`, async ({ page, context }) => {
      await context.addInitScript((t) => { try { localStorage.setItem("ftt:theme", t); } catch {} }, theme);
      await openLong(page, 9);
      for (const key of ["1", "2", "4", "s"]) {
        await page.keyboard.press(key);
        await expect(page.locator("#fv-stage canvas.fv-pic").first()).toBeVisible();
        const { violations } = await new AxeBuilder({ page })
          .options({ runOnly: { type: "tag", values: WCAG }, rules: { "label-content-name-mismatch": { enabled: true } } })
          .analyze();
        const summary = violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).slice(0, 4).join(" | ")}`);
        expect(summary, `${key}\n${summary.join("\n")}`).toEqual([]);
      }
    });
  }

  test("at 320 px every layout fits without sideways scroll; the control is icons with 44 px buttons", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await openLong(page, 9);
    for (const name of ["One page", "Grid", "Scroll"]) {
      const radio = layoutRadio(page, name);
      await expect(radio).toBeAttached();
      const box = await page.locator(`label[for="${await radio.getAttribute("id")}"]`).boundingBox();
      expect(box.width, name).toBeGreaterThanOrEqual(44);
      expect(box.height, name).toBeGreaterThanOrEqual(44);
    }
    // Labels are kept for assistive technology, not shown.
    expect((await page.locator("#fv-ll-grid .fv-lbl").boundingBox()).width).toBeLessThan(3);
    for (const key of ["1", "4", "s"]) {
      await page.keyboard.press(key);
      await expect(page.locator("#fv-stage canvas.fv-pic").first()).toBeVisible();
      expect(await viewer(page).evaluate((d) => d.scrollWidth <= d.clientWidth), key).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), key).toBe(true);
      expect(await page.locator("#fv-bar, .fv-bar").first().evaluate((b) => b.scrollWidth <= b.clientWidth), key).toBe(true);
    }
    expect((await page.getByRole("combobox", { name: "Zoom level" }).boundingBox()).height).toBeGreaterThanOrEqual(44);
    await page.keyboard.press("2");
    await expect(layoutRadio(page, "Two pages")).toBeDisabled();
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
    for (const name of ["Close", "Next"]) {
      const box = await page.getByRole("button", { name }).first().boundingBox();
      expect(box.height, name).toBeGreaterThanOrEqual(44);
      expect(box.width, name).toBeGreaterThanOrEqual(44);
    }
    // On a phone the zoom buttons give way to the menu; Close is an icon.
    for (const name of ["Zoom in", "Zoom out", "Fit to screen"]) await expect(page.getByRole("button", { name })).toBeHidden();
    expect((await page.locator("#fv-close").boundingBox()).width).toBeLessThan(60);
    // Two rows at most: the name and Close, then the layout and zoom menu.
    expect((await page.locator(".fv-bar").boundingBox()).height).toBeLessThan(140);
    await page.keyboard.press("+");
    await expect(page.locator("#fv-level")).not.toHaveValue("page");
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

// ---- Scrolling, swiping and the other ways to move around ----
const stageBox = async (page) => (await page.locator("#fv-stage").boundingBox());
async function overStage(page) {
  const b = await stageBox(page);
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
}
const settle = (page) => page.waitForTimeout(450);
/** A trackpad swipe: n small wheel events, 8 ms apart, sent from inside the page so a slow test machine cannot stretch it. */
const burst = (page, n, dy) => page.locator("#fv-stage").evaluate(async (s, [n, dy]) => {
  const r = s.getBoundingClientRect();
  for (let i = 0; i < n; i++) {
    s.dispatchEvent(new WheelEvent("wheel", { deltaY: dy, bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }));
    await new Promise((ok) => setTimeout(ok, 8));
  }
}, [n, dy]);

test.describe("viewer: wheel, keys, jump, rotate", () => {
  test.skip(({ isMobile }) => isMobile, "file flows run once, on desktop");

  test("one wheel turn moves one page; down and right go on, up and left go back", async ({ page }) => {
    await openLong(page, 9);
    await overStage(page);
    await page.mouse.wheel(0, 120);
    await expect(pos(page)).toHaveText("Page 2 of 9");
    await expect(page.locator("#fv-live")).toHaveText("Page 2 of 9");
    await settle(page);
    await page.mouse.wheel(120, 0);
    await expect(pos(page)).toHaveText("Page 3 of 9");
    await settle(page);
    await page.mouse.wheel(0, -120);
    await expect(pos(page)).toHaveText("Page 2 of 9");
    await settle(page);
    await page.mouse.wheel(-120, 0);
    await expect(pos(page)).toHaveText("Page 1 of 9");
    // Nothing before the first page.
    await settle(page);
    await page.mouse.wheel(0, -120);
    await settle(page);
    await expect(pos(page)).toHaveText("Page 1 of 9");
  });

  test("a trackpad burst of 20 small events turns exactly one page, and a later swipe turns the next", async ({ page }) => {
    await openLong(page, 9);
    await overStage(page);
    await burst(page, 20, 8);
    await expect(pos(page)).toHaveText("Page 2 of 9");
    await settle(page);
    await expect(pos(page)).toHaveText("Page 2 of 9");
    await burst(page, 20, 8);
    await expect(pos(page)).toHaveText("Page 3 of 9");
    await settle(page);
    await expect(pos(page)).toHaveText("Page 3 of 9");
  });

  test("zoomed in, the wheel scrolls the page first and turns it only after the edge", async ({ page }) => {
    await openLong(page, 9);
    for (let i = 0; i < 5; i++) await page.keyboard.press("+");
    await overStage(page);
    const top = () => page.locator("#fv-stage").evaluate((s) => Math.round(s.scrollTop));
    const before = await top();
    await page.mouse.wheel(0, 100);
    await expect.poll(top).toBeGreaterThan(before);
    await expect(pos(page)).toHaveText("Page 1 of 9");
    // Go to the bottom, wait for the swipe to end, then one more turns the page.
    await page.locator("#fv-stage").evaluate((s) => { s.scrollTop = s.scrollHeight; });
    await settle(page);
    await page.mouse.wheel(0, 120);
    await expect(pos(page)).toHaveText("Page 2 of 9");
  });

  test("Ctrl and wheel zoom and do not turn pages", async ({ page }) => {
    await openLong(page, 9);
    await overStage(page);
    await expect(page.locator("#fv-level")).toHaveValue("page");
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, -100);
    await page.keyboard.up("Control");
    await expect(page.locator("#fv-level")).not.toHaveValue("page");
    await expect(pos(page)).toHaveText("Page 1 of 9");
  });

  test("Two pages: the wheel turns one spread; Grid and Scroll keep scrolling", async ({ page }) => {
    await openLong(page, 9);
    await page.keyboard.press("2");
    await overStage(page);
    await page.mouse.wheel(0, 120);
    await expect(pos(page)).toHaveText("Pages 3–4 of 9");
    await page.keyboard.press("4");
    await settle(page);
    await page.mouse.wheel(0, 300);
    await settle(page);
    await expect(pos(page)).toHaveText("Pages 1–4 of 9");
    await page.keyboard.press("s");
    await expect(page.locator("#fv-stage .fv-cell")).toHaveCount(9);
    await page.mouse.wheel(0, 1500);
    await expect.poll(() => page.locator("#fv-stage").evaluate((s) => s.scrollTop)).toBeGreaterThan(500);
    await expect.poll(async () => (await pos(page).textContent()) !== "Page 1 of 9").toBe(true);
  });

  test("keys: Page Down, Space, Shift+Space, arrows, Home and End turn pages; Space on a button still presses it", async ({ page }) => {
    await openLong(page, 9);
    await page.locator("#fv-stage").focus();
    await page.keyboard.press("PageDown");
    await expect(pos(page)).toHaveText("Page 2 of 9");
    await page.keyboard.press("Space");
    await expect(pos(page)).toHaveText("Page 3 of 9");
    await page.keyboard.press("Shift+Space");
    await expect(pos(page)).toHaveText("Page 2 of 9");
    await page.keyboard.press("ArrowDown");
    await expect(pos(page)).toHaveText("Page 3 of 9");
    await page.keyboard.press("ArrowUp");
    await expect(pos(page)).toHaveText("Page 2 of 9");
    await page.keyboard.press("PageUp");
    await expect(pos(page)).toHaveText("Page 1 of 9");
    await page.keyboard.press("End");
    await expect(pos(page)).toHaveText("Page 9 of 9");
    await page.keyboard.press("Home");
    await expect(pos(page)).toHaveText("Page 1 of 9");
    await page.locator("#fv-next").focus();
    await page.keyboard.press("Space");
    await expect(pos(page)).toHaveText("Page 2 of 9");
    // Zoomed in, Page Down scrolls the page before it turns it.
    await page.locator("#fv-stage").focus();
    for (let i = 0; i < 5; i++) await page.keyboard.press("+");
    await page.keyboard.press("PageDown");
    await expect(pos(page)).toHaveText("Page 2 of 9");
    expect(await page.locator("#fv-stage").evaluate((s) => s.scrollTop)).toBeGreaterThan(0);
  });

  test("Go to page: type a number, Enter; G focuses the box; out-of-range numbers are held to the ends", async ({ page }) => {
    await openLong(page, 9);
    const box = page.getByLabel("Go to page");
    await expect(box).toHaveValue("1");
    await box.fill("7");
    await box.press("Enter");
    await expect(pos(page)).toHaveText("Page 7 of 9");
    await expect(page.locator("#fv-live")).toHaveText("Page 7 of 9");
    await box.fill("99");
    await box.press("Enter");
    await expect(pos(page)).toHaveText("Page 9 of 9");
    await page.locator("#fv-stage").focus();
    await page.keyboard.press("g");
    await expect(box).toBeFocused();
    // Typing in the box does not trigger the viewer's shortcuts.
    await page.keyboard.type("4");
    await expect(layoutRadio(page, "One page")).toBeChecked();
    await page.keyboard.press("Enter");
    await expect(pos(page)).toHaveText("Page 4 of 9");
  });

  test("double-click zooms in at that spot and back to fit", async ({ page }) => {
    await openLong(page, 9);
    await pageCanvas(page).first().dblclick();
    await expect(page.locator("#fv-level")).not.toHaveValue("page");
    await pageCanvas(page).first().dblclick();
    await expect(page.locator("#fv-level")).toHaveValue("page");
  });

  test("Rotate turns the view a quarter; R and Shift+R do too; it resets on the next open", async ({ page }) => {
    await openLong(page, 9);
    const shape = () => pageCanvas(page).first().evaluate((c) => { const r = c.getBoundingClientRect(); return r.width / r.height; });
    const upright = await shape();
    expect(upright).toBeLessThan(1);
    await page.getByRole("button", { name: "Rotate" }).click();
    await expect(page.locator("#fv-live")).toHaveText("Rotated to 90°");
    await expect.poll(shape).toBeGreaterThan(1);
    await page.keyboard.press("r");
    await expect(page.locator("#fv-live")).toHaveText("Rotated to 180°");
    await expect.poll(async () => Math.abs((await shape()) - upright)).toBeLessThan(0.02);
    await page.keyboard.press("Shift+R");
    await page.keyboard.press("Shift+R");
    await page.keyboard.press("Shift+R");
    await expect(page.locator("#fv-live")).toHaveText("Rotated to 270°");
    // The turned page is still drawn and still fits the room.
    await expect.poll(shape).toBeGreaterThan(1);
    const s = await stageBox(page);
    await expect.poll(async () => { const b = await pageCanvas(page).first().boundingBox(); return !!b && b.width <= s.width && b.height <= s.height; }).toBe(true);
    await page.keyboard.press("Escape");
    await page.locator("#pdfs-pages .page-tile").first().getByRole("button", { name: "View page 1 full screen" }).click();
    await expect.poll(shape).toBeLessThan(1);
  });

  test("the layout is kept in this browser", async ({ page }) => {
    await openLong(page, 9);
    await page.keyboard.press("2");
    expect(await page.evaluate(() => localStorage.getItem("ftt:viewer-layout"))).toBe("two");
  });

  test("a page turn slides in only when motion is allowed", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openLong(page, 9);
    await page.locator("#fv-next").click();
    await expect(pos(page)).toHaveText("Page 2 of 9");
    expect(await page.locator(".fv-fig").evaluate((f) => getComputedStyle(f).animationName)).toBe("none");
  });
});

test.describe("viewer: touch swipe", () => {
  test.skip(({ isMobile }) => isMobile, "file flows run once, on desktop");
  test.use({ hasTouch: true });

  /** A one-finger drag on the picture area, sent as touch events. */
  async function swipe(page, dx, dy = 0) {
    await page.locator("#fv-stage").evaluate(async (s, [dx, dy]) => {
      const r = s.getBoundingClientRect();
      const x = r.x + r.width / 2, y = r.y + r.height / 2;
      const mk = (type, px, py) => new TouchEvent(type, {
        bubbles: true, cancelable: true,
        touches: type === "touchend" ? [] : [new Touch({ identifier: 1, target: s, clientX: px, clientY: py })],
        changedTouches: [new Touch({ identifier: 1, target: s, clientX: px, clientY: py })],
      });
      s.dispatchEvent(mk("touchstart", x, y));
      s.dispatchEvent(mk("touchmove", x + dx / 2, y + dy / 2));
      await new Promise((ok) => setTimeout(ok, 30));
      s.dispatchEvent(mk("touchend", x + dx, y + dy));
    }, [dx, dy]);
  }

  test("a sideways swipe turns the page; a short or vertical one does not; zoomed in sideways it pans", async ({ page }) => {
    await openLong(page, 9);
    await swipe(page, -120);
    await expect(pos(page)).toHaveText("Page 2 of 9");
    await swipe(page, 120);
    await expect(pos(page)).toHaveText("Page 1 of 9");
    await swipe(page, 20);
    await swipe(page, -30, 150);
    await page.waitForTimeout(200);
    await expect(pos(page)).toHaveText("Page 1 of 9");
    for (let i = 0; i < 6; i++) await page.keyboard.press("+");
    expect(await page.locator("#fv-stage").evaluate((s) => s.scrollWidth > s.clientWidth + 1)).toBe(true);
    await swipe(page, -120);
    await page.waitForTimeout(200);
    await expect(pos(page)).toHaveText("Page 1 of 9");
  });
});
