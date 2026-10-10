import { test, expect } from "@playwright/test";

// Pages for tools that are not built yet, and the suggestion form.
// Like every other test, these watch for requests to other origins and CSP violations.
test.beforeEach(async ({ page }) => {
  const offsite = [];
  const violations = [];
  page.on("request", (r) => {
    const u = new URL(r.url());
    const own = new URL(test.info().project.use.baseURL).hostname;
    if (u.protocol.startsWith("http") && u.hostname !== own) offsite.push(r.url());
  });
  page.on("console", (m) => { if (/Content Security Policy/i.test(m.text())) violations.push(m.text()); });
  page.__checks = { offsite, violations };
});

test.afterEach(async ({ page }) => {
  expect(page.__checks.offsite, "requests to other origins").toEqual([]);
  expect(page.__checks.violations, "CSP violations").toEqual([]);
});

test("a wanted page says what the tool will do, is noindex, and links to the form, sponsorship and the issue", async ({ page }) => {
  await page.goto("/pdf/page-delete/");
  await expect(page.locator("h1")).toHaveText("Delete or reorder PDF pages");
  await expect(page.locator("main .tag")).toContainText("Not built yet");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");
  await expect(page.getByText("What goes in")).toBeVisible();
  await expect(page.getByText("What comes out")).toBeVisible();
  await expect(page.getByRole("link", { name: "Tell us what you need" })).toHaveAttribute("href", "/suggest/?tool=pdf%2Fpage-delete");
  await expect(page.getByRole("link", { name: "Sponsor this tool" })).toHaveAttribute("href", "/support/#company-h");
  await expect(page.getByRole("link", { name: "For developers: build it" })).toHaveAttribute("href", /github\.com\/.*\/issues\/63$/);
  // The breadcrumb for search engines still names the group.
  const ld = await page.locator('script[type="application/ld+json"]').allTextContents();
  expect(ld.join(" ")).toContain("BreadcrumbList");
});

test("wanted pages are not in the sitemap or the llms files", async ({ request }) => {
  for (const file of ["/sitemap.xml", "/llms.txt", "/llms-full.txt"]) {
    const text = await (await request.get(file)).text();
    expect(text, file).not.toContain("/pdf/page-delete/");
  }
});

test("the group page and the home page link a wanted row to its own page, not to GitHub", async ({ page }) => {
  await page.goto("/pdf/");
  const row = page.locator('li.want[data-want-id="pdf/page-delete"] a.row');
  await expect(row).toHaveAttribute("href", "/pdf/page-delete/");
  await expect(row).not.toContainText("GitHub");
  await expect(page.locator("main .more").getByRole("link", { name: "Suggest a tool" })).toHaveAttribute("href", "/suggest/");
  await page.goto("/");
  await expect(page.locator('li.want[data-want-id="pdf/page-delete"] a.row')).toHaveAttribute("href", "/pdf/page-delete/");
  await expect(page.locator("footer").getByRole("link", { name: "Suggest a tool" })).toHaveAttribute("href", "/suggest/");
});

test("I want this sends one vote, shows the new count, and a reload does not vote again", async ({ page }) => {
  const posts = [];
  page.on("request", (r) => { if (r.url().endsWith("/api/stats/want") && r.method() === "POST") posts.push(r.postDataJSON()); });
  await page.goto("/everyday/zip/");
  const button = page.getByRole("button", { name: "I want this" });
  await expect(button).toBeEnabled();
  const [res] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith("/api/stats/want")),
    button.click(),
  ]);
  const { wants } = await res.json();
  expect(wants).toBeGreaterThan(0);
  await expect(page.locator("#want-count")).toContainText(wants === 1 ? "1 person wants this." : `${wants} people want this.`);
  await expect(page.getByRole("button", { name: "You want this" })).toBeDisabled();
  expect(posts).toEqual([{ tool: "everyday/zip" }]);
  expect(await page.evaluate(() => localStorage.getItem("ftt:wanted"))).toBe('["everyday/zip"]');

  await page.reload();
  await expect(page.getByRole("button", { name: "You want this" })).toBeDisabled();
  await page.waitForTimeout(500);
  expect(posts).toHaveLength(1);
});

test("the Worker counts a vote only for a planned tool, and only from this site", async ({ page, request, baseURL }) => {
  const url = "/api/stats/want";
  expect((await request.post(url, { headers: { Origin: baseURL }, data: { tool: "pdf/merge" } })).status()).toBe(400);
  expect((await request.post(url, { headers: { Origin: baseURL }, data: { tool: "nope/nope" } })).status()).toBe(400);
  expect((await request.post(url, { headers: { Origin: "https://example.org" }, data: { tool: "pdf/page-delete" } })).status()).toBe(403);
  expect((await request.get(url)).status()).toBe(405);
});

test("the form sends the right JSON and then says thanks", async ({ page }) => {
  const sent = [];
  await page.route("**/api/feedback", async (route) => {
    sent.push(route.request().postDataJSON());
    await route.fulfill({ status: 204 });
  });
  await page.goto("/suggest/");
  await expect(page).toHaveTitle("Suggest a tool or report a problem | Free the Tools");
  await expect(page.locator("#fb-status")).toHaveAttribute("role", "status");
  await expect(page.getByLabel("What should it do?")).toBeVisible();
  await expect(page.getByLabel("What do you use today?")).toBeVisible();
  await expect(page.getByText("No account needed.").first()).toBeVisible();
  await page.getByLabel("What should it do?").fill("Join two pictures side by side.");
  await page.getByLabel("What do you use today?").fill("Paint");
  await page.getByLabel("Which tool?").fill("images/join");
  await page.getByLabel("Your email, if you want a reply").fill("ada@example.org");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.locator("#fb-status")).toHaveText("Thanks. We read every message.");
  expect(sent).toEqual([{ kind: "suggestion", message: "Join two pictures side by side.", use: "Paint", tool: "images/join", email: "ada@example.org", website: "" }]);
});

test("the hidden field cannot be reached by keyboard or screen reader", async ({ page }) => {
  await page.goto("/suggest/");
  const trap = page.locator("#fb-website");
  await expect(trap).toHaveAttribute("tabindex", "-1");
  expect(await trap.evaluate((el) => !!el.closest("[inert]") && !!el.closest('[aria-hidden="true"]'))).toBe(true);
});

test("the form checks the message length and the email before it sends", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/feedback", (route) => { calls++; return route.fulfill({ status: 204 }); });
  await page.goto("/suggest/");
  await page.getByLabel("What should it do?").fill("short");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("alert")).toContainText("at least 10 characters");
  await page.getByLabel("What should it do?").fill("This one is long enough.");
  await page.getByLabel("Your email, if you want a reply").fill("not an email");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("alert")).toContainText("email address");
  expect(calls).toBe(0);
});

test("when the Worker cannot send, the page offers an email with the message filled in", async ({ page }) => {
  await page.route("**/api/feedback", (route) => route.fulfill({ status: 503 }));
  await page.goto("/suggest/?kind=problem&tool=pdf/merge");
  await expect(page.getByLabel("What went wrong?")).toBeVisible();
  await expect(page.getByLabel("What do you use today?")).toBeHidden();
  await expect(page.getByLabel("Which tool?")).toHaveValue("pdf/merge");
  await page.getByLabel("What went wrong?").fill("The merge button does nothing & I lost my files.");
  await page.getByRole("button", { name: "Send" }).click();
  const link = page.locator("#fb-status a");
  await expect(link).toBeVisible();
  const href = await link.getAttribute("href");
  expect(href.startsWith("mailto:hello@freethetools.com?")).toBe(true);
  const q = new URLSearchParams(href.split("?")[1]);
  expect(q.get("subject")).toBe("Problem: pdf/merge");
  expect(q.get("body")).toContain("The merge button does nothing & I lost my files.");
  // Nothing typed is lost.
  await expect(page.getByLabel("What went wrong?")).toHaveValue("The merge button does nothing & I lost my files.");
});

test("a network error gives the same email fallback", async ({ page }) => {
  await page.route("**/api/feedback", (route) => route.abort());
  await page.goto("/suggest/");
  await page.getByLabel("What should it do?").fill("A tool that does something useful.");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.locator("#fb-status a")).toHaveAttribute("href", /^mailto:hello@freethetools\.com\?subject=Suggestion%3A%20new%20tool&body=/);
});

test("Report a problem on a tool page opens the form with that tool filled in", async ({ page }) => {
  await page.goto("/pdf/merge/");
  await page.getByRole("link", { name: "Report a problem" }).click();
  await expect(page).toHaveURL(/\/suggest\/\?tool=pdf%2Fmerge&kind=problem$/);
  await expect(page.getByLabel("Which tool?")).toHaveValue("pdf/merge");
  await expect(page.getByLabel("Report a problem")).toBeChecked();
  await expect(page.getByLabel("What went wrong?")).toBeVisible();
});

test("the real Worker answers the form: 204 with the mail binding, 400 for a bad body", async ({ request, baseURL }) => {
  const headers = { Origin: baseURL };
  const bad = await request.post("/api/feedback", { headers, data: { kind: "problem", message: "short" } });
  expect(bad.status()).toBe(400);
  const trap = await request.post("/api/feedback", { headers, data: { kind: "problem", message: "short", website: "x" } });
  expect(trap.status()).toBe(204);
  const elsewhere = await request.post("/api/feedback", { headers: { Origin: "https://example.org" }, data: { kind: "problem", message: "long enough here" } });
  expect(elsewhere.status()).toBe(403);
  const big = await request.post("/api/feedback", { headers, data: { kind: "problem", message: "x".repeat(7000) } });
  expect(big.status()).toBe(413);
});
