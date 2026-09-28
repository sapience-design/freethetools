// Read-only check of the live site: opens every page in the sitemap on desktop and phone and fails
// on page errors, Content Security Policy violations, requests to other origins, or sideways scroll.
// Catches problems that only exist in production, such as a script injected by a Cloudflare setting.
//
//   node scripts/live-check.mjs [https://freethetools.com]
//
// It writes nothing: the browser sends Global Privacy Control, so no views, uses or visits are
// counted, and any POST to /api/stats is itself reported as a failure.
import { chromium, devices } from "@playwright/test";

const BASE = (process.argv[2] ?? process.env.BASE_URL ?? "https://freethetools.com").replace(/\/$/, "");
const origin = new URL(BASE).origin;
const PROFILES = {
  desktop: { viewport: { width: 1440, height: 1000 } },
  phone: devices["Pixel 7"],
};
const CONCURRENCY = 4;
const reportOnly = new Set(); // where report-only CSP reports would be sent

async function pagesFromSitemap() {
  const res = await fetch(`${BASE}/sitemap.xml`);
  if (!res.ok) throw new Error(`sitemap.xml returned ${res.status}`);
  const xml = await res.text();
  // The sitemap lists canonical URLs; check them on the site under test.
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => BASE + new URL(m[1]).pathname);
}

async function checkPage(context, url) {
  const problems = [];
  const page = await context.newPage();
  page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (!["http:", "https:"].includes(u.protocol)) return; // data:, blob:
    if (u.origin !== origin) problems.push(`outside request: ${r.url()}`);
    else if (r.method() === "POST" && u.pathname.startsWith("/api/stats")) problems.push(`stats write despite GPC: ${u.pathname}`);
  });
  try {
    const res = await page.goto(url, { waitUntil: "networkidle", timeout: 45_000 });
    if (!res || res.status() !== 200) problems.push(`status ${res?.status()}`);
    const { csp, wide } = await page.evaluate(() => ({
      csp: window.__cspViolations ?? [],
      wide: document.documentElement.scrollWidth > window.innerWidth + 1,
    }));
    // Report-only policies don't block anything; they come from Cloudflare features such as
    // client-side script monitoring. They are counted and shown, but only enforced ones fail.
    for (const v of csp) {
      if (v.disposition === "report") reportOnly.add(v.reporter);
      else problems.push(`CSP violation: ${v.text}`);
    }
    if (wide) problems.push("scrolls sideways");
  } catch (e) {
    problems.push(`load failed: ${e.message.split("\n")[0]}`);
  } finally {
    await page.close();
  }
  return problems;
}

const urls = await pagesFromSitemap();
const browser = await chromium.launch();
let failed = 0;
for (const [name, profile] of Object.entries(PROFILES)) {
  const context = await browser.newContext(profile);
  await context.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, "globalPrivacyControl", { get: () => true });
    window.__cspViolations = [];
    document.addEventListener("securitypolicyviolation", (e) => {
      const reportUri = /report-uri\s+([^\s;]+)/.exec(e.originalPolicy)?.[1];
      window.__cspViolations.push({
        disposition: e.disposition,
        text: `${e.violatedDirective} blocked ${e.blockedURI || "inline"}`,
        reporter: reportUri ? new URL(reportUri).origin + new URL(reportUri).pathname : "no report-uri",
      });
    });
  });
  const queue = [...urls];
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    for (let url; (url = queue.shift()); ) {
      const path = new URL(url).pathname;
      const first = await checkPage(context, url);
      if (!first.length) continue;
      // One retry, so a deploy swapping files mid-check doesn't fail the run. A problem that
      // clears on retry is still reported, as a warning.
      await new Promise((r) => setTimeout(r, 5000));
      const again = await checkPage(context, url);
      if (again.length) {
        failed++;
        for (const p of again) console.log(`::error title=${name} ${path}::${p}`);
      } else {
        for (const p of first) console.log(`::warning title=${name} ${path} (cleared on retry)::${p}`);
      }
    }
  }));
  await context.close();
  console.log(`${name}: checked ${urls.length} pages`);
}
await browser.close();

for (const r of reportOnly) {
  console.log(`::warning title=Report-only CSP::Some pages carry a report-only policy that sends reports to ${r}. It blocks nothing, but visitors' browsers contact that server. Cloudflare's client-side script monitoring adds it; turn it off to keep the no-outside-connections pledge exact.`);
}
if (failed) {
  console.log(`${failed} page checks failed on ${BASE}`);
  process.exit(1);
}
console.log(`All pages on ${BASE} are clean on desktop and phone.`);
