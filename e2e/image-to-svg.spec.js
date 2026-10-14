// Image to SVG: trace a small picture with two colour areas, check the file that comes out,
// and check the preview, the Compare slider and the full-screen viewer.
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { deflateSync, crc32 } from "node:zlib";
import { unzipSync } from "fflate";

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
// Skipped (phone) tests never ran the hook above, so there is nothing to check for them.
test.afterEach(async ({ page }) => expect(page.__problems ?? []).toEqual([]));
test.skip(({ isMobile }) => isMobile, "file flows run once, on desktop");

/** A PNG, w x h, whose left half is red and right half is blue. */
function twoColourPng(w, h) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = y * (w * 3 + 1) + 1 + x * 3;
    const left = x < w / 2;
    raw[o] = left ? 220 : 30; raw[o + 1] = 30; raw[o + 2] = left ? 30 : 220;
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const picture = (name = "flag.png", w = 120, h = 80) => ({ name, mimeType: "image/png", buffer: twoColourPng(w, h) });

async function download(page, trigger) {
  const [d] = await Promise.all([page.waitForEvent("download"), trigger()]);
  return readFileSync(await d.path());
}

/** Nothing but one <svg> of <path> shapes, with no script, link or text. */
function expectOnlyShapes(svg) {
  expect(svg.startsWith("<svg ")).toBe(true);
  expect(svg).toContain("<path");
  expect(svg).not.toMatch(/<script|<text|<style|<image|<use|<foreignObject|<a[\s>]|href|javascript:|\son\w+=/i);
  // The only web address is the SVG namespace.
  expect([...svg.matchAll(/https?:\/\/[^"'\s]+/g)].map((m) => m[0])).toEqual(["http://www.w3.org/2000/svg"]);
  expect([...svg.matchAll(/<(\/?[a-zA-Z]+)/g)].map((m) => m[1]).every((t) => ["svg", "/svg", "path"].includes(t))).toBe(true);
}

test.describe("Image to SVG", () => {
  test("traces a picture with two colour areas into a safe SVG", async ({ page }) => {
    await page.goto("/images/to-svg/");
    await page.setInputFiles("#i2s-file", picture());
    await expect(page.locator("#i2s-picked .fthumb img")).toBeVisible();
    await page.click("#i2s-go");
    await expect(page.locator("#i2s-list .fmeta")).toContainText("PNG → SVG");
    await expect(page.locator("#i2s-list .fmeta")).toContainText("2 colours");
    const svg = (await download(page, () => page.getByRole("link", { name: "Download" }).click())).toString("utf8");
    expectOnlyShapes(svg);
    expect(svg).toContain('width="120" height="80"');
    expect(svg).toContain("rgb(220,30,30)");
    expect(svg).toContain("rgb(30,30,220)");
  });

  test("shows the SVG as a picture, with Compare and the full-screen viewer", async ({ page }) => {
    await page.goto("/images/to-svg/");
    await page.setInputFiles("#i2s-file", picture());
    await page.click("#i2s-go");
    const row = page.locator("#i2s-list li").first();
    // The thumbnail is an <img> of the SVG, never inline SVG markup.
    const thumb = row.locator(".fthumb img");
    await expect(thumb).toBeVisible();
    await expect.poll(() => thumb.evaluate((i) => i.complete && i.naturalWidth > 0)).toBe(true);
    expect(await row.locator(".fthumb svg").count()).toBe(0);

    await row.getByRole("button", { name: "Compare", exact: true }).click();
    await expect(row.locator(".cmp-stage")).toBeVisible();
    await expect(row.locator(".cmp-tag.b")).toContainText("SVG");

    const full = row.getByRole("button", { name: "View the comparison full screen" });
    await full.click();
    await expect(page.locator("dialog#fv")).toBeVisible();
    await expect(page.locator("#fv-stage .cmp-range")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog#fv")).toBeHidden();

    await row.getByRole("button", { name: "View photo full screen" }).click();
    await expect(page.locator("#fv-stage img.fv-pic")).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("the presets change the result", async ({ page }) => {
    await page.goto("/images/to-svg/");
    // Choosing a preset fills in the options.
    await page.click('label[for="i2s-illustration"]');
    await page.locator("#i2s-more summary").click();
    await expect(page.locator("#i2s-colours")).toHaveValue("24");
    await expect(page.locator("#i2s-d-high")).toBeChecked();
    await page.click('label[for="i2s-bw"]');
    await expect(page.locator("#i2s-colours")).toHaveValue("2");
    await expect(page.locator("#i2s-colours")).toBeDisabled();

    await page.setInputFiles("#i2s-file", picture());
    await page.click("#i2s-go");
    // Red and blue are both dark, so both become black.
    await expect(page.locator("#i2s-list .fmeta")).toContainText("1 colour");
    const svg = (await download(page, () => page.getByRole("link", { name: "Download" }).click())).toString("utf8");
    expectOnlyShapes(svg);
    // Black and white: only black and white fills.
    const fills = new Set(svg.match(/fill="[^"]+"/g));
    expect(fills.size).toBeGreaterThan(0);
    for (const f of fills) expect(['fill="rgb(0,0,0)"', 'fill="rgb(255,255,255)"']).toContain(f);
  });

  test("offers a ZIP for several pictures", async ({ page }) => {
    await page.goto("/images/to-svg/");
    await page.setInputFiles("#i2s-file", [picture("one.png"), picture("two.png", 60, 40)]);
    await page.click("#i2s-go");
    const all = page.getByRole("link", { name: "Download all (2 files, ZIP)" });
    await expect(all).toBeVisible();
    const files = unzipSync(new Uint8Array(await download(page, () => all.click())));
    expect(Object.keys(files).sort()).toEqual(["one.svg", "two.svg"]);
    for (const bytes of Object.values(files)) expectOnlyShapes(Buffer.from(bytes).toString("utf8"));
  });

  test("a file that is not a picture is left out", async ({ page }) => {
    await page.goto("/images/to-svg/");
    await page.setInputFiles("#i2s-file", { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
    await expect(page.locator("#i2s-go")).toBeDisabled();
  });
});
