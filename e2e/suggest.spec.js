import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// "Suggest a tool" in three steps (src/components/SuggestDialog.astro). The POST is intercepted:
// no email is sent. The body must match what the form at /suggest/ sends.
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

test.beforeEach(async ({ page }) => {
  const offsite = [];
  const violations = [];
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.protocol.startsWith("http") && u.hostname !== new URL(test.info().project.use.baseURL).hostname) offsite.push(r.url());
  });
  page.on("console", (m) => { if (/Content Security Policy/i.test(m.text())) violations.push(m.text()); });
  page.__checks = { offsite, violations };
});
test.afterEach(async ({ page }) => {
  expect(page.__checks.offsite, "requests to other origins").toEqual([]);
  expect(page.__checks.violations, "CSP violations").toEqual([]);
});

async function openFromHome(page) {
  await page.goto("/");
  const opener = page.locator("footer").getByRole("link", { name: "Suggest a tool" });
  await expect(opener).toHaveAttribute("href", "/suggest/");
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "Suggest a tool" });
  await expect(dialog).toBeVisible();
  return { dialog, opener };
}

test("three steps send the same body as the /suggest/ form, and nothing is sent before Send", async ({ page }) => {
  const posts = [];
  await page.route("**/api/feedback", (route) => {
    posts.push({ headers: route.request().headers(), body: route.request().postDataJSON() });
    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  const { dialog } = await openFromHome(page);

  // Step 1: first field has focus; a short line is refused and tied to the field.
  const message = dialog.getByRole("textbox", { name: "What should the tool do?" });
  await expect(message).toBeFocused();
  await expect(dialog.getByText("Step 1 of 3")).toBeVisible();
  await dialog.getByRole("button", { name: "Next" }).click();
  await expect(message).toHaveAttribute("aria-invalid", "true");
  await expect(message).toHaveAccessibleDescription(/Please write at least 10 characters/);
  await message.fill("Merge two PDF files into one");
  await dialog.getByRole("button", { name: "Next" }).click();

  // Step 2: focus goes to its first field, not the heading; the step is announced instead.
  await expect(dialog.getByLabel("What do you use today?")).toBeFocused();
  await expect(page.locator("#sg-live")).toHaveText("Step 2 of 3 Anything else?");
  await expect(dialog.getByRole("heading", { name: /Step 2 of 3/ })).not.toHaveAttribute("tabindex");
  await dialog.getByLabel("What do you use today?").fill("A website");
  await dialog.getByLabel("Your email, if you want a reply").fill("nope");
  await dialog.getByRole("button", { name: "Next" }).click();
  await expect(dialog.getByLabel("Your email, if you want a reply")).toHaveAccessibleDescription(/does not look right/);
  await dialog.getByLabel("Your email, if you want a reply").fill("me@example.com");
  await dialog.getByRole("button", { name: "Next" }).click();

  // Step 3: focus is on Send; sponsoring is optional and goes to the support page.
  await expect(dialog.getByRole("button", { name: "Send suggestion" })).toBeFocused();
  await expect(page.locator("#sg-live")).toHaveText("Step 3 of 3 Want it sooner?");
  // It lists what goes with the message before anything is sent.
  await expect(dialog.locator("#sg-ctx li")).toHaveText(["The page you were on: /", "The site language: English"]);
  await expect(dialog.getByRole("link", { name: /Sponsor a tool/ })).toHaveAttribute("href", "/support/#company-h");
  // Back keeps what was typed.
  await dialog.getByRole("button", { name: "Back" }).click();
  await expect(dialog.getByLabel("What do you use today?")).toHaveValue("A website");
  await expect(dialog.getByLabel("What do you use today?")).toBeFocused();
  await dialog.getByRole("button", { name: "Back" }).click();
  await expect(dialog.getByRole("textbox", { name: "What should the tool do?" })).toBeFocused();
  await dialog.getByRole("button", { name: "Next" }).click();
  await dialog.getByRole("button", { name: "Next" }).click();
  expect(posts).toHaveLength(0);

  await dialog.getByRole("button", { name: "Send suggestion" }).click();
  // Thanks: focus goes to Close, not the heading; the thanks is announced.
  await expect(dialog.getByRole("heading", { name: "Thank you!" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Close" }).last()).toBeFocused();
  await expect(page.locator("#sg-live")).toHaveText(/^Thank you! We read every message\./);
  expect(await page.locator("#sg [tabindex='-1']:not(input)").count(), "no heading takes focus").toBe(0);
  expect(posts).toHaveLength(1);
  expect(posts[0].headers["content-type"]).toBe("application/json");
  expect(posts[0].body).toEqual({ kind: "suggestion", message: "Merge two PDF files into one", use: "A website", tool: "", email: "me@example.com", website: "", page: "/", search: "", lang: "en" });
  await dialog.getByRole("button", { name: "Close" }).last().click();
  await expect(dialog).toBeHidden();
});

test("a wanted-page link keeps its tool in the payload", async ({ page }) => {
  let body;
  await page.route("**/api/feedback", (route) => { body = route.request().postDataJSON(); return route.fulfill({ status: 200, body: "{}" }); });
  await page.goto("/developer/cron-explainer/");
  await page.getByRole("link", { name: "Tell us what you need" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "What should the tool do?" }).fill("Explain a cron schedule");
  await dialog.getByRole("button", { name: "Next" }).click();
  await dialog.getByRole("button", { name: "Next" }).click();
  await dialog.getByRole("button", { name: "Send suggestion" }).click();
  await expect(dialog.getByRole("heading", { name: "Thank you!" })).toBeVisible();
  expect(body).toEqual({ kind: "suggestion", message: "Explain a cron schedule", use: "", tool: "developer/cron-explainer", email: "", website: "", page: "/developer/cron-explainer/", search: "", lang: "en" });
});

test("on a failed send the text stays and a plain message says what to do", async ({ page }) => {
  await page.route("**/api/feedback", (route) => route.fulfill({ status: 500, body: "no" }));
  const { dialog } = await openFromHome(page);
  await dialog.getByRole("textbox", { name: "What should the tool do?" }).fill("Compare two text files");
  await dialog.getByRole("button", { name: "Next" }).click();
  await dialog.getByRole("button", { name: "Next" }).click();
  await dialog.getByRole("button", { name: "Send suggestion" }).click();
  await expect(dialog.getByRole("alert").filter({ hasText: "could not send" })).toContainText("Your text is still here");
  await expect(dialog.getByRole("alert").filter({ hasText: "could not send" })).toContainText("Error 500");
  await expect(dialog.getByRole("link", { name: /email it to hello@freethetools.com/ })).toHaveAttribute("href", /^mailto:hello@freethetools\.com\?/);
  await dialog.getByRole("button", { name: "Back" }).click();
  await dialog.getByRole("button", { name: "Back" }).click();
  await expect(dialog.getByRole("textbox", { name: "What should the tool do?" })).toHaveValue("Compare two text files");
});

test("a failed send is tried once more after 2 seconds", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/feedback", (route) => { calls++; return route.fulfill({ status: calls === 1 ? 502 : 204 }); });
  const { dialog } = await openFromHome(page);
  await dialog.getByRole("textbox", { name: "What should the tool do?" }).fill("Compare two text files");
  await dialog.getByRole("button", { name: "Next" }).click();
  await dialog.getByRole("button", { name: "Next" }).click();
  await dialog.getByRole("button", { name: "Send suggestion" }).click();
  await expect(dialog.getByRole("heading", { name: "Thank you!" })).toBeVisible({ timeout: 8000 });
  expect(calls).toBe(2);
});

test("Escape closes the dialog and focus returns to the link; nothing is stored", async ({ page }) => {
  const { dialog, opener } = await openFromHome(page);
  await dialog.getByRole("textbox", { name: "What should the tool do?" }).fill("Something typed here");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + document.cookie + JSON.stringify({ ...sessionStorage }));
  expect(stored).not.toContain("Something typed here");
  // The Close button works too.
  await opener.click();
  await dialog.getByRole("button", { name: "Close" }).first().click();
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});

test("a search with no results offers to suggest it, with the term in step 1", async ({ page }) => {
  await page.goto("/");
  const term = `zzzz <b>qq</b> nothing`;
  await page.locator("#find").fill(term);
  const none = page.locator("#results-none");
  await expect(none).toBeVisible();
  await expect(page.locator("#results-title")).toContainText(`Nothing found for “${term}”`);
  expect(await page.locator("#results .results-head b").count()).toBe(0);
  await none.getByRole("button", { name: "Suggest it" }).click();
  const dialog = page.getByRole("dialog", { name: "Suggest a tool" });
  await expect(dialog.getByRole("textbox", { name: "What should the tool do?" })).toHaveValue(term);
  await expect(dialog.getByRole("textbox", { name: "What should the tool do?" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Suggest it" })).toBeFocused();
});

test("the search words go with a suggestion made from a search with no results, and the dialog says so", async ({ page }) => {
  let body;
  await page.route("**/api/feedback", (route) => { body = route.request().postDataJSON(); return route.fulfill({ status: 200, body: "{}" }); });
  await page.goto("/nb/");
  await page.locator("#find").fill("zzqx   qqyy");
  await page.locator("#results-none").getByRole("button").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox").first().fill("Endre størrelse på passbilder for visum");
  await dialog.getByRole("button", { name: "Neste" }).click();
  await dialog.getByRole("button", { name: "Neste" }).click();
  await expect(dialog.locator("#sg-ctx li")).toHaveText(["Siden du var på: /nb/", "Det du søkte etter: zzqx qqyy", "Språket på nettstedet: norsk bokmål"]);
  await dialog.getByRole("button", { name: "Send forslag" }).click();
  await expect.poll(() => body).toBeTruthy();
  expect(body).toMatchObject({ message: "Endre størrelse på passbilder for visum", page: "/nb/", search: "zzqx qqyy", lang: "nb" });
  // A later suggestion from a plain link does not carry the old search.
  await dialog.getByRole("button", { name: "Lukk" }).last().click();
  await page.locator("footer").getByRole("link", { name: "Foreslå et verktøy" }).click();
  await dialog.getByRole("textbox").first().fill("Noe helt annet her");
  await dialog.getByRole("button", { name: "Neste" }).click();
  await dialog.getByRole("button", { name: "Neste" }).click();
  await dialog.getByRole("button", { name: "Send forslag" }).click();
  await expect.poll(() => body.message).toBe("Noe helt annet her");
  expect(body.search).toBe("");
});

test("Enter in a search with no results opens the dialog", async ({ page }) => {
  await page.goto("/");
  await page.locator("#find").fill("zzzz nothing");
  await page.locator("#find").press("Enter");
  await expect(page.getByRole("dialog", { name: "Suggest a tool" })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/");
});

test("the Norwegian dialog speaks Norwegian", async ({ page }) => {
  await page.goto("/nb/");
  await page.locator("footer").getByRole("link", { name: "Foreslå et verktøy" }).click();
  const dialog = page.getByRole("dialog", { name: "Foreslå et verktøy" });
  await expect(dialog.getByText("Trinn 1 av 3")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Neste" })).toBeVisible();
});

test("without the dialog the link still goes to the /suggest/ page", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/");
  await page.locator("footer").getByRole("link", { name: "Suggest a tool" }).click();
  await expect(page).toHaveURL(/\/suggest\/$/);
  await context.close();
});

for (const theme of ["light", "dark"]) {
  for (const stepNo of [1, 2, 3]) {
    test(`${theme} theme, step ${stepNo}: WCAG 2.2 AA and no sideways scroll at 320 px`, async ({ page }) => {
      await page.addInitScript((t) => { try { localStorage.setItem("ftt:theme", t); } catch {} }, theme);
      await page.setViewportSize({ width: 320, height: 700 });
      const { dialog } = await openFromHome(page);
      if (stepNo > 1) {
        await dialog.getByRole("textbox", { name: "What should the tool do?" }).fill("Merge two PDF files");
        await dialog.getByRole("button", { name: "Next" }).click();
      }
      if (stepNo > 2) await dialog.getByRole("button", { name: "Next" }).click();
      await page.waitForTimeout(300);
      const { violations } = await new AxeBuilder({ page })
        .options({ runOnly: { type: "tag", values: WCAG }, rules: { "label-content-name-mismatch": { enabled: true } } })
        .analyze();
      const summary = violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).slice(0, 4).join(" | ")}`);
      expect(summary, summary.join("\n")).toEqual([]);
      const overflow = await page.evaluate(() => {
        const d = document.getElementById("sg");
        return { page: document.documentElement.scrollWidth - innerWidth, dialog: d.scrollWidth - d.clientWidth };
      });
      expect(overflow.page).toBeLessThanOrEqual(0);
      expect(overflow.dialog).toBeLessThanOrEqual(0);
      // Buttons are at least 44 px tall.
      for (const b of await dialog.getByRole("button").all()) {
        if (!(await b.isVisible())) continue;
        expect((await b.boundingBox()).height, await b.innerText()).toBeGreaterThanOrEqual(44);
      }
    });
  }
}

for (const theme of ["light", "dark"]) {
  test(`${theme} theme, failed send: the error box is readable (WCAG 2.2 AA)`, async ({ page }) => {
    await page.addInitScript((t) => { try { localStorage.setItem("ftt:theme", t); } catch {} }, theme);
    await page.route("**/api/feedback", (route) => route.fulfill({ status: 502 }));
    await page.setViewportSize({ width: 320, height: 800 });
    const { dialog } = await openFromHome(page);
    await dialog.getByRole("textbox", { name: "What should the tool do?" }).fill("Merge two PDF files");
    await dialog.getByRole("button", { name: "Next" }).click();
    await dialog.getByRole("button", { name: "Next" }).click();
    await dialog.getByRole("button", { name: "Send suggestion" }).click();
    await expect(dialog.getByRole("alert").filter({ hasText: "Error 502" })).toBeVisible({ timeout: 8000 });
    const { violations } = await new AxeBuilder({ page }).options({ runOnly: { type: "tag", values: WCAG } }).analyze();
    const summary = violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).slice(0, 4).join(" | ")}`);
    expect(summary, summary.join("; ")).toEqual([]);
  });
}
