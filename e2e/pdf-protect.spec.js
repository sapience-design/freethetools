// Protect PDF: lock the sample PDF in the browser with qpdf, download it, and check in Node that it
// is encrypted and opens only with the password. Fixtures come from tools/pdf/unlock/tests/helpers.js.
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { unlockPdf } from "../tools/pdf/unlock/core.js";
import { plain, qpdf, withPassword } from "../tools/pdf/unlock/tests/helpers.js";

const PW = "correct-horse-battery";
const pdfFile = (name, bytes) => ({ name, mimeType: "application/pdf", buffer: Buffer.from(bytes) });
const sample = pdfFile("sample.pdf", plain);

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
  return new Uint8Array(readFileSync(await d.path()));
}

const fill = async (page, a, b = a) => {
  await page.locator("#ppw-pw").fill(a);
  await page.locator("#ppw-pw2").fill(b);
};
const protect = async (page) => {
  await expect(page.locator("#ppw-go")).toBeEnabled();
  await page.locator("#ppw-go").click();
};
const encryption = async (bytes, password) => (await qpdf(["--show-encryption", `--password=${password}`, "/in.pdf"], bytes)).lines.join("\n");

test("Protect PDF locks the sample, and the result opens only with the password", async ({ page }) => {
  await page.goto("/pdf/protect/");
  await page.setInputFiles("#ppw-file", sample);
  await expect(page.locator("#ppw-name")).toHaveText("sample.pdf");
  await expect(page.locator("#ppw-pw")).toHaveAttribute("type", "password");
  await expect(page.locator("#ppw-pw")).toHaveAttribute("autocomplete", "off");
  await expect(page.getByText("If you forget this password, nobody can open the file again.")).toBeVisible();
  // Printing is on by default; copying and changing are off.
  await expect(page.locator("#ppw-print")).toBeChecked();
  await expect(page.locator("#ppw-copy")).not.toBeChecked();
  await expect(page.locator("#ppw-edit")).not.toBeChecked();

  await fill(page, PW);
  await protect(page);
  const link = page.getByRole("link", { name: "Download sample_protected.pdf" });
  await expect(link).toBeVisible();
  await expect(page.locator("#ppw-pw")).toHaveValue("");
  await expect(page.locator("#ppw-pw2")).toHaveValue("");
  expect(await page.content()).not.toContain(PW);
  // A locked file can't be drawn without its password: the preview is a lock, not a broken picture.
  await expect(page.locator("#ppw-result .out-row .fthumb svg")).toBeVisible();
  await expect(page.locator("#ppw-result .out-row canvas")).toHaveCount(0);

  const out = await download(page, () => link.click());
  await expect(PDFDocument.load(out)).rejects.toThrow(/encrypted/i);
  const text = await encryption(out, PW);
  expect(text).toMatch(/R = 6/);
  expect(text).toMatch(/AESv3/);
  expect(text).toMatch(/print high resolution: allowed/);
  expect(text).toMatch(/extract for any purpose: not allowed/);
  expect(text).toMatch(/modify other: not allowed/);
  expect((await unlockPdf(qpdf, out, "")).status).toBe("needs-password");
  expect((await unlockPdf(qpdf, out, "nope")).status).toBe("wrong-password");
  const opened = await unlockPdf(qpdf, out, PW);
  expect(opened.status).toBe("unlocked");
  expect((await PDFDocument.load(opened.bytes)).getPageCount()).toBe(3);
});

test("the choices change what people may do", async ({ page }) => {
  await page.goto("/pdf/protect/");
  await page.setInputFiles("#ppw-file", sample);
  await page.locator("#ppw-print").uncheck();
  await page.locator("#ppw-copy").check();
  await page.locator("#ppw-edit").check();
  await fill(page, PW);
  await protect(page);
  const out = await download(page, () => page.getByRole("link", { name: "Download sample_protected.pdf" }).click());
  const text = await encryption(out, PW);
  expect(text).toMatch(/print high resolution: not allowed/);
  expect(text).toMatch(/extract for any purpose: allowed/);
  expect(text).toMatch(/modify other: allowed/);
});

test("two passwords that differ, or none, are refused with a reason", async ({ page }) => {
  await page.goto("/pdf/protect/");
  await page.setInputFiles("#ppw-file", sample);
  await protect(page);
  await expect(page.locator("#ppw-err")).toContainText("Type a password first.");
  await expect(page.locator("#ppw-pw")).toBeFocused();
  await fill(page, "one-password", "another-one");
  await protect(page);
  await expect(page.locator("#ppw-err")).toContainText("don't match");
  await expect(page.locator("#ppw-pw")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("link", { name: /Download/ })).toHaveCount(0);
  // Nothing was cleared, so the person can fix it.
  await expect(page.locator("#ppw-pw")).toHaveValue("one-password");
});

test("the show toggle reveals both fields, and clears after use", async ({ page }) => {
  await page.goto("/pdf/protect/");
  await page.setInputFiles("#ppw-file", sample);
  await page.getByLabel("Show the password").check();
  await expect(page.locator("#ppw-pw")).toHaveAttribute("type", "text");
  await expect(page.locator("#ppw-pw2")).toHaveAttribute("type", "text");
  await fill(page, PW);
  await protect(page);
  await expect(page.getByRole("link", { name: "Download sample_protected.pdf" })).toBeVisible();
  await expect(page.locator("#ppw-pw")).toHaveAttribute("type", "password");
  await expect(page.getByLabel("Show the password")).not.toBeChecked();
});

test("a PDF that is already locked is refused, with a link to Unlock PDF", async ({ page }) => {
  await page.goto("/pdf/protect/");
  await page.setInputFiles("#ppw-file", pdfFile("locked.pdf", withPassword));
  const note = page.locator("#ppw-locked");
  await expect(note).toContainText("locked.pdf is already locked");
  await expect(note.getByRole("link", { name: "Use Unlock PDF." })).toHaveAttribute("href", "/pdf/unlock/");
  await expect(page.locator("#ppw-go")).toBeDisabled();
  await expect(page.locator("#ppw-picked")).toBeHidden();
});

test("Protect PDF works from the keyboard and passes axe", async ({ page }) => {
  const AxeBuilder = (await import("@axe-core/playwright")).default;
  await page.goto("/pdf/protect/");
  await page.setInputFiles("#ppw-file", sample);
  await expect(page.locator("#ppw-go")).toBeEnabled();
  await expect(page.locator("#ppw-pw")).toBeFocused(); // focus moves to the password once the file is read
  await page.keyboard.type(PW);
  await page.keyboard.press("Tab");
  await page.keyboard.type(PW);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("link", { name: "Download sample_protected.pdf" })).toBeFocused();
  const { violations } = await new AxeBuilder({ page })
    .options({ runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } })
    .analyze();
  const summary = violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).slice(0, 4).join(" | ")}`);
  expect(summary, summary.join("\n")).toEqual([]);
});
