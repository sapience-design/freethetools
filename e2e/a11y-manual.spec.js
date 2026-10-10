// Accessibility checks that axe-core cannot make, written as browser tests (TODO B9). Covers:
//   1. a keyboard-only walk through the top bar, group pages, search, sorting and one tool per group;
//   2. roles, names and live regions on those paths (a stand-in for a screen reader pass);
//   3. reflow at 320 and 640 CSS px (WCAG 1.4.10) and text spacing (1.4.12);
//   4. focus that no sticky or fixed bar hides (WCAG 2.4.11).
// These tests use the keyboard only where they say so. They do not replace a pass with NVDA and
// VoiceOver: see "Not covered by automated tools" in docs/research/2026-09-28-accessibility-speed-audit.md.
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const paths = [...readFileSync("dist/sitemap.xml", "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
const toolPaths = paths.filter((p) => p.split("/").filter(Boolean).length === 2 && !p.startsWith("/api/"));
// One tool per group, as the audit asks. PDF and Images use a drop zone; the rest use fields.
const GROUP_TOOLS = ["/pdf/merge/", "/images/compress/", "/text/case-converter/", "/data/json-formatter/", "/developer/uuid-generator/", "/everyday/unit-converter/"];
const FOCUS_PAGES = ["/", "/pdf/", "/saved/", "/about/", "/how-it-works/", "/pdf/merge/", "/text/case-converter/", "/data/json-formatter/", "/developer/regex-tester/", "/everyday/unit-converter/"];

// ---- helpers ----

/** Open a page and wait until its scripts have run, so key presses reach their handlers. */
async function ready(page, path) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}

/** Press Tab until the focused element matches `selector` (and `text`, if given). Fails after `max` presses. */
async function tabTo(page, selector, { text, max = 120 } = {}) {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press("Tab");
    const hit = await page.evaluate(([sel, txt]) => {
      const el = document.activeElement;
      if (!el || !el.matches(sel)) return false;
      if (!txt) return true;
      return new RegExp(txt).test((el.getAttribute("aria-label") || el.textContent || "").trim());
    }, [selector, text ? text.source : null]);
    if (hit) return;
  }
  throw new Error(`Tab never reached ${selector}${text ? ` ${text}` : ""} in ${max} presses`);
}

const FOCUSABLE = 'a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"])';

/** Where the focused element sits and whether something else covers it. Runs in the page. */
function inspectFocus() {
  let el = document.activeElement;
  if (!el || el === document.body) return null;
  // Visually hidden radios and checkboxes show their focus on the label, so test the label.
  if (el.matches('input[type="radio"], input[type="checkbox"]') && getComputedStyle(el).opacity === "0" && el.labels?.[0]) el = el.labels[0];
  const r = el.getBoundingClientRect();
  const vw = document.documentElement.clientWidth, vh = window.innerHeight;
  const cx = r.left + r.width / 2, cy = Math.min(Math.max(r.top + r.height / 2, 0), vh - 1);
  const inView = r.width > 0 && r.height > 0 && cx >= 0 && cx < vw && r.top < vh && r.bottom > 0;
  const hit = inView ? document.elementFromPoint(cx, cy) : null;
  const covered = inView && !(hit && (el.contains(hit) || hit.contains(el)));
  const name = `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""} "${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 30)}"`;
  return { name, inView, covered, by: covered && hit ? `${hit.tagName.toLowerCase()}${hit.id ? "#" + hit.id : ""}.${String(hit.className).split(" ")[0]}` : "", rect: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)] };
}

/** Tab through a page and list every stop that is outside the window or covered by another element. */
async function obscuredStops(page, max) {
  const problems = [];
  let stops = 0;
  for (let i = 0; i < max; i++) {
    await page.keyboard.press("Tab");
    const f = await page.evaluate(inspectFocus);
    if (!f) break; // focus left the page: the cycle is complete
    stops++;
    if (!f.inView) problems.push(`${f.name} is outside the window at ${f.rect}`);
    else if (f.covered) problems.push(`${f.name} is covered by ${f.by}`);
  }
  return { problems, stops };
}

// ---- 1. Keyboard only ----

test.describe("keyboard only", () => {
  test("a group card leads into the group, a tool, and back", async ({ page }) => {
    await ready(page, "/");
    await tabTo(page, '.gcard[data-g="pdf"] .gcard-head');
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/pdf\/$/);
    await tabTo(page, "main a.row", { text: /^Make a PDF smaller/ });
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/pdf\/compress\/$/);
    await expect(page.locator("h1")).toBeVisible();
    await tabTo(page, "main a.back");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/pdf\/$/);
    await tabTo(page, "main a.back");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/$/);
  });

  test("search: type, arrow keys, Enter", async ({ page }) => {
    await ready(page, "/");
    // "/" is the documented shortcut. It focuses the search box.
    await page.keyboard.press("/");
    await expect(page.locator("#find")).toBeFocused();
    await page.keyboard.type("pdf");
    const links = page.locator("#search-results a");
    expect(await links.count()).toBeGreaterThan(1);
    await expect(links.first()).toHaveClass(/sel/);
    await page.keyboard.press("ArrowDown");
    await expect(links.nth(1)).toHaveClass(/sel/);
    await page.keyboard.press("ArrowUp");
    await expect(links.first()).toHaveClass(/sel/);
    await page.keyboard.press("ArrowDown");
    const href = await links.nth(1).getAttribute("href");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`${href.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}$`));
  });

  test("from any page, \"/\" takes the keyboard to search", async ({ page }) => {
    await ready(page, "/pdf/merge/");
    await page.keyboard.press("/");
    await expect(page).toHaveURL(/\/#find$/);
    await expect(page.locator("#find")).toBeFocused();
  });

  test("the \"/\" shortcut can be turned off, and the choice is kept (WCAG 2.1.4)", async ({ page }) => {
    await ready(page, "/pdf/merge/");
    const box = page.getByLabel(/to jump to search/);
    await expect(box).toBeChecked();
    await box.uncheck();
    expect(await page.evaluate(() => localStorage.getItem("ftt:slash"))).toBe("off");
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("/");
    await expect(page).toHaveURL(new RegExp("/pdf/merge/$"));
    // Still off after a reload.
    await ready(page, "/pdf/merge/");
    await expect(page.getByLabel(/to jump to search/)).not.toBeChecked();
    await page.keyboard.press("/");
    await expect(page).toHaveURL(new RegExp("/pdf/merge/$"));
    // Turning it on again brings the shortcut back.
    await page.getByLabel(/to jump to search/).check();
    expect(await page.evaluate(() => localStorage.getItem("ftt:slash"))).toBeNull();
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("/");
    await expect(page).toHaveURL(new RegExp("/#find$"));
  });

  test("typing \"/\" in a text field never jumps to search", async ({ page }) => {
    await ready(page, "/text/case-converter/");
    const field = page.locator("textarea").first();
    await field.focus();
    await page.keyboard.type("a/b");
    await expect(page).toHaveURL(new RegExp("/text/case-converter/$"));
    await expect(field).toBeFocused();
  });

  test("sorting with arrow keys reorders the shelf", async ({ page }) => {
    await ready(page, "/");
    await tabTo(page, 'input[name="sort"]');
    await expect(page.locator('input[name="sort"]:focus')).toBeChecked();
    for (let i = 0; i < 5 && (await page.locator('input[name="sort"]:checked').getAttribute("value")) !== "az"; i++) await page.keyboard.press("ArrowRight");
    await expect(page.locator('input[name="sort"]:checked')).toHaveValue("az");
    const names = await page.locator('.gcard[data-g="pdf"] [data-sortable] > li:not(.want)').evaluateAll((li) => li.map((l) => l.dataset.name));
    expect(names.length).toBeGreaterThan(1);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  for (const path of GROUP_TOOLS) {
    test(`${path}: every control is reachable by Tab and shows focus`, async ({ page }) => {
      await ready(page, path);
      const total = await page.evaluate((sel) => {
        const items = [...document.querySelectorAll("main .tool *")].filter((e) => e.matches(sel))
          .filter((e) => !e.disabled && !e.closest("[hidden]") && (e.getClientRects().length || e.matches('input[type="radio"], input[type="checkbox"]')) && getComputedStyle(e).visibility !== "hidden");
        // A radio group is one tab stop.
        const seen = new Set();
        let n = 0;
        items.forEach((e) => {
          if (e.type === "radio") { if (seen.has(e.name)) return; seen.add(e.name); }
          e.dataset.stop = String(++n);
        });
        return n;
      }, FOCUSABLE);
      expect(total).toBeGreaterThan(0);
      const reached = new Set();
      const noRing = [];
      for (let i = 0; i < 160 && reached.size < total; i++) {
        await page.keyboard.press("Tab");
        const stop = await page.evaluate(() => {
          const el = document.activeElement;
          // For a radio group the browser focuses the checked radio, which may not be the tagged one.
          const tagged = el?.dataset?.stop ?? (el?.type === "radio" ? document.querySelector(`input[type="radio"][name="${el.name}"][data-stop]`)?.dataset.stop : undefined);
          let t = el;
          if (t.matches('input[type="radio"], input[type="checkbox"]') && getComputedStyle(t).opacity === "0" && t.labels?.[0]) t = t.labels[0];
          const cs = getComputedStyle(t);
          const ring = (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== "none";
          return { stop: tagged, ring, name: `${el?.tagName}#${el?.id}` };
        });
        if (stop.stop) { reached.add(stop.stop); if (!stop.ring) noRing.push(stop.name); }
      }
      expect(reached.size, `tab stops reached in ${path}`).toBe(total);
      expect(noRing, "focused controls with no visible focus indicator").toEqual([]);
    });
  }

  for (const path of ["/pdf/merge/", "/images/compress/"]) {
    test(`${path}: the drop zone opens the file chooser from the keyboard`, async ({ page }) => {
      await ready(page, path);
      await tabTo(page, ".drop");
      // The tool script may still be wiring the zone, so press again if no chooser opens. One
      // listener covers every press: a chooser can open after a short wait has given up, and a
      // browser shows only one chooser at a time, so later presses would open nothing.
      const chooser = page.waitForEvent("filechooser", { timeout: 20000 });
      for (let i = 0; i < 4; i++) {
        await page.keyboard.press("Enter");
        if (await Promise.race([chooser.then(() => true, () => false), page.waitForTimeout(3000).then(() => false)])) break;
      }
      expect(await chooser, "file chooser opened").toBeTruthy();
    });
  }

  test("text, data, developer and everyday tools work from the keyboard", async ({ page }) => {
    await ready(page, "/text/case-converter/");
    await tabTo(page, 'input[name="cc-case"]');
    const before = await page.locator("#cc-out").textContent();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("#cc-out")).not.toHaveText(before);

    await ready(page, "/data/json-formatter/");
    await tabTo(page, 'input[name="jf-indent"]');
    const jf = await page.locator("#jf-out").textContent();
    await page.keyboard.press("ArrowRight");
    // Whitespace is the change, and toHaveText ignores whitespace, so compare the raw text.
    await expect.poll(() => page.locator("#jf-out").textContent()).not.toBe(jf);

    await ready(page, "/developer/uuid-generator/");
    await tabTo(page, "#uu-go");
    await page.keyboard.press("Enter");
    await expect(page.locator("#uu-out")).toHaveText(/[0-9a-f]{8}-[0-9a-f]{4}-/);

    await ready(page, "/everyday/unit-converter/");
    await tabTo(page, "#uc-val");
    await page.keyboard.press("Control+A");
    await page.keyboard.type("7");
    await expect(page.locator("#uc-out")).toContainText("7");
  });
});

// ---- 2. Roles, names and live regions (what a screen reader reads) ----

test.describe("roles, names and live regions", () => {
  test("the top bar exposes landmarks, the current page and the theme switch", async ({ page }) => {
    await ready(page, "/about/");
    const banner = page.getByRole("banner");
    await expect(banner.getByRole("link", { name: "Free the Tools" })).toBeVisible();
    const nav = page.getByRole("navigation", { name: "Site" });
    await expect(nav.getByRole("link", { name: "About" })).toHaveAttribute("aria-current", "page");
    await expect(nav.getByRole("link", { name: "Library" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "All tools" })).toBeVisible();
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("contentinfo")).toBeAttached();
    const theme = page.getByRole("group", { name: "Theme" });
    for (const n of ["System", "Light", "Dark"]) await expect(theme.getByRole("button", { name: n })).toHaveAttribute("aria-pressed", /true|false/);
    await ready(page, "/");
    await expect(page.getByRole("search")).toBeVisible();
    await expect(page.getByRole("searchbox", { name: "What do you need to do?" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Site" }).getByRole("link", { name: /^Favourites/ })).toBeVisible();
  });

  test("on a wide screen the top bar links to the source code, by name", async ({ page, isMobile }) => {
    test.skip(isMobile, "Hidden on phones; the footer links to it");
    await ready(page, "/");
    const gh = page.getByRole("navigation", { name: "Site" }).getByRole("link", { name: "Source code on GitHub" });
    await expect(gh).toBeVisible();
    await expect(gh).toHaveAttribute("href", "https://github.com/sapience-design/freethetools");
  });

  test("on a phone the top bar keeps every link, named, and at least 44 px", async ({ page, isMobile }) => {
    test.skip(!isMobile, "Phone only");
    for (const path of ["/", "/pdf/merge/"]) {
      await ready(page, path);
      const sizes = await page.evaluate(() => [...document.querySelectorAll(".bar a:not(.gh)")].map((a) => {
        const r = a.getBoundingClientRect();
        return { name: (a.getAttribute("aria-label") || a.textContent || "").trim(), w: Math.round(r.width), h: Math.round(r.height), shown: r.width > 0 };
      }));
      for (const z of sizes) {
        expect(z.shown, `${path}: ${z.name} is shown`).toBe(true);
        expect(Math.min(z.w, z.h), `${path}: ${z.name} is at least 44 px`).toBeGreaterThanOrEqual(44);
      }
      // The icon-only button still has its words for screen readers.
      const button = page.getByRole("banner").getByRole("link", { name: path === "/" ? /^Favourites/ : "All tools" });
      await expect(button).toBeVisible();
    }
  });

  test("search announces how many results there are and which one is selected", async ({ page }) => {
    await ready(page, "/");
    await page.keyboard.press("/");
    await page.keyboard.type("pdf");
    const status = page.locator("#find-status");
    await expect(status).toHaveAttribute("role", "status");
    await expect(status).toHaveText(/\d+ tools?/);
    await page.keyboard.press("ArrowDown");
    const second = await page.locator("#search-results > li").nth(1).getAttribute("data-name");
    await expect(status).toContainText(second);
    await page.keyboard.press("Control+A");
    await page.keyboard.type("zzzz nothing");
    await expect(status).toContainText(/no tool matches/i);
  });

  test("sorting is a labelled radio group and announces the new order", async ({ page }) => {
    await ready(page, "/");
    const group = page.getByRole("group", { name: "Sort by" });
    await expect(group.getByRole("radio", { name: "A–Z" })).toBeAttached();
    await expect(group.getByRole("radio", { name: "Most used" })).toBeChecked();
    await group.getByText("A–Z", { exact: true }).click();
    await expect(page.locator("#sort-status")).toHaveText(/A–Z/);
  });

  test("a tool's heart button names the tool and has a state", async ({ page }) => {
    await ready(page, "/pdf/compress/");
    const heart = page.locator(".tp-actions [data-save]");
    await expect(heart).toHaveAccessibleName(/^Add to favourites Compress PDF/);
    await expect(heart).toHaveAttribute("aria-pressed", "false");
    await heart.click();
    await expect(heart).toHaveAttribute("aria-pressed", "true");
    await expect(heart).toHaveAccessibleName(/^In favourites Compress PDF/);
    await heart.click(); // leave the shared test database as we found it
    await expect(heart).toHaveAttribute("aria-pressed", "false");
  });

  for (const path of GROUP_TOOLS) {
    test(`${path}: the tool is a named region and its fields have names`, async ({ page }) => {
      await ready(page, path);
      await expect(page.locator("main .tool").first()).toHaveAttribute("aria-label", /.+/);
      const unnamed = await page.evaluate(() => [...document.querySelectorAll("main .tool :is(input:not([type=hidden]), select, textarea, button, [role=button])")]
        .filter((e) => !e.closest("[hidden]") && !e.hidden)
        .filter((e) => !((e.labels && e.labels.length) || e.getAttribute("aria-label") || e.getAttribute("aria-labelledby") || (e.textContent || "").trim()))
        .map((e) => `${e.tagName}#${e.id}`));
      expect(unnamed, "controls with no accessible name").toEqual([]);
    });
  }

  test("every tool's result area is a live region that exists before it changes", async ({ page }) => {
    const bad = [];
    for (const path of toolPaths) {
      await ready(page, path);
      // (An error box with role=alert may start hidden: browsers announce alerts when they appear.)
      // A region that is display:none, or inside hidden content, is out of the accessibility tree,
      // so a screen reader misses the first change.
      const found = await page.evaluate(() => [...document.querySelectorAll('main .tool [aria-live], main .tool output, main .tool [role="status"]')]
        .map((e) => ({ id: e.id, hidden: !!e.closest("[hidden]") || getComputedStyle(e).display === "none" || !!e.closest('[aria-hidden="true"]') })));
      for (const f of found) if (f.hidden) bad.push(`${path} #${f.id}`);
    }
    expect(bad, "live regions that start hidden").toEqual([]);
  });

  test("error messages are announced", async ({ page }) => {
    const bad = [];
    for (const path of toolPaths) {
      await ready(page, path);
      const els = await page.evaluate(() => [...document.querySelectorAll("main .tool .tool-error")]
        .map((e) => ({ id: e.id, ok: e.matches('[role="alert"], [role="status"], [aria-live]') || !!e.closest('[aria-live], [role="alert"], [role="status"]') })));
      for (const e of els) if (!e.ok) bad.push(`${path} #${e.id}`);
    }
    expect(bad, ".tool-error elements that no screen reader will announce").toEqual([]);
  });

  test("tool results are written into their live regions", async ({ page }) => {
    await ready(page, "/text/case-converter/");
    await expect(page.locator("#cc-out")).toHaveText(/\w/);
    expect(await page.locator("#cc-out").evaluate((e) => e.tagName)).toBe("OUTPUT");
    await ready(page, "/developer/uuid-generator/");
    await expect(page.locator("#uu-out")).toHaveAttribute("aria-live", "polite");
    await page.click("#uu-go");
    await expect(page.locator("#uu-out")).toHaveText(/-/);
    await ready(page, "/everyday/unit-converter/");
    await expect(page.locator("#uc-out")).toHaveAttribute("aria-live", "polite");
    await expect(page.locator("#uc-out")).toHaveText(/\d/);
    await ready(page, "/data/json-formatter/");
    await expect(page.locator("#jf-out")).toHaveAttribute("aria-live", "polite");
    await expect(page.locator("#jf-out")).toHaveText(/Free the Tools/);
  });
});

// ---- 3. Reflow and text spacing ----

test.describe("reflow", () => {
  for (const path of paths) {
    test(`${path} has no horizontal scroll at 320 and 640 CSS px`, async ({ page }) => {
      for (const width of [320, 640]) {
        // 320 px is 400% zoom on a 1280 px window; 640 px is 200%.
        await page.setViewportSize({ width, height: 800 });
        await ready(page, path);
        const r = await page.evaluate(() => {
          const w = document.documentElement.clientWidth;
          const wide = [...document.querySelectorAll("body *")]
            .filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.right > w + 1 && getComputedStyle(e).position !== "fixed"; })
            .slice(0, 6).map((e) => `${e.tagName.toLowerCase()}${e.id ? "#" + e.id : ""}.${String(e.className).split(" ")[0]}`);
          return { scrollWidth: document.documentElement.scrollWidth, w, wide };
        });
        expect(r.scrollWidth, `${path} at ${width}px: page is wider than the window. Wide elements: ${r.wide.join(", ")}`).toBeLessThanOrEqual(r.w);
      }
    });
  }
});

test.describe("text spacing (WCAG 1.4.12)", () => {
  // The four values the criterion names, applied with !important as a user stylesheet would.
  // A constructed stylesheet is used because the Content Security Policy blocks <style> injection.
  const SPACING = "* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }";
  const REPRESENTATIVE = ["/", "/pdf/", "/pdf/merge/", "/text/case-converter/", "/data/json-formatter/", "/developer/regex-tester/", "/everyday/unit-converter/", "/saved/", "/about/", "/how-it-works/", "/stats/", "/licenses/"];

  for (const path of REPRESENTATIVE) {
    for (const width of [1280, 360]) {
      test(`${path} at ${width}px loses no text`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await ready(page, path);
        await page.evaluate((css) => { const s = new CSSStyleSheet(); s.replaceSync(css); document.adoptedStyleSheets = [...document.adoptedStyleSheets, s]; }, SPACING);
        const clipped = await page.evaluate(() => [...document.querySelectorAll("body *")].filter((e) => {
          if (e.closest('[aria-hidden="true"], .sr-only, svg')) return false;
          const cs = getComputedStyle(e);
          const clips = (v) => v === "hidden" || v === "clip";
          if (!(clips(cs.overflowX) || clips(cs.overflowY))) return false;
          if (e.clientWidth <= 1 || e.clientHeight <= 1) return false;
          if (!(e.textContent || "").trim()) return false;
          return (clips(cs.overflowY) && e.scrollHeight > e.clientHeight + 1) || (clips(cs.overflowX) && e.scrollWidth > e.clientWidth + 1);
        }).map((e) => `${e.tagName.toLowerCase()}${e.id ? "#" + e.id : ""}.${String(e.className).split(" ")[0]} (${e.scrollWidth}x${e.scrollHeight} in ${e.clientWidth}x${e.clientHeight})`));
        expect(clipped, "elements that clip their text").toEqual([]);
        // Nothing may push the page sideways at 360 px either.
        if (width === 360) expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      });
    }
  }
});

// ---- 4. Focus not obscured (WCAG 2.4.11) ----

test.describe("focus not obscured", () => {
  for (const path of FOCUS_PAGES) {
    test(`${path}: no focused element is hidden by a sticky or fixed bar`, async ({ page }) => {
      await ready(page, path);
      const { problems, stops } = await obscuredStops(page, 160);
      expect(stops, "tab stops visited").toBeGreaterThan(5);
      expect(problems.slice(0, 8), `focus hidden on ${path}`).toEqual([]);
    });
  }

  test("focus stays visible in a 320 x 256 px window (400% zoom)", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 256 });
    await ready(page, "/text/case-converter/");
    const { problems } = await obscuredStops(page, 60);
    expect(problems.slice(0, 8)).toEqual([]);
  });
});
