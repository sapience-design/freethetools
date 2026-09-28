# Accessibility and speed audit, 2026-09-28

B6 in TODO.md. Target: WCAG 2.2 AA, and Lighthouse on its mobile profile.

## Method

- **Speed and best practices:** Lighthouse 12 (Apache-2.0), mobile profile, run against the live site. Pages: home, `/pdf/`, Compress PDF, Resize Images, Base64.
- **Accessibility:** axe-core 4.13 via `@axe-core/playwright` (MPL-2.0), with the WCAG 2.0, 2.1 and 2.2 A and AA rules. "Label in name" (2.5.3) is switched on too; axe ships it as experimental. The check covers:
  - every page in the sitemap (34)
  - both themes (light and dark)
  - desktop and phone
  - 136 runs in total

  It now runs in CI as `e2e/a11y.spec.js`.

## Results before fixes

| Page (live, mobile) | Performance | Accessibility | Best practices | SEO | Largest paint | Blocking time | Layout shift |
|---|---|---|---|---|---|---|---|
| Home | 99 | 100 | 100 | 100 | 1.7 s | 30 ms | 0.018 |
| PDF group | 99 | 100 | 100 | 100 | 1.7 s | 10 ms | 0.029 |
| Compress PDF | 99 | 97 | 100 | 100 | 1.7 s | 70 ms | 0 |
| Resize Images | 99 | 100 | 100 | 100 | 1.7 s | 10 ms | 0 |
| Base64 | 99 | 100 | 100 | 100 | 1.8 s | 0 ms | 0.009 |

Speed needs no work. Three of the first Lighthouse runs failed with `NO_NAVSTART`, a known trace-recording error in Lighthouse; reruns succeeded.

axe found 13 failing runs out of 136, all colour contrast in the light theme. Lighthouse found one more rule.

## Found and fixed

| Issue | WCAG | Where | Fix |
|---|---|---|---|
| Muted text was 4.23:1 on grey surfaces (needs 4.5:1) | 1.4.3 | Hints in segmented controls (Compress PDF, Compress/Convert Images, UUID Generator), Password Generator strength line | The light theme's `--muted` token went from `oklch(55.6% 0 0)` to `oklch(52% 0 0)`: 4.9:1 on grey, 5.5:1 on white. It looks the same. |
| The example result was faded with `opacity: .6`, dropping its text to 2.3–2.5:1 | 1.4.3 | Compress PDF | The fade is removed. The "Example" tag gets a border, so it still reads as a sample. |
| Drop zones' accessible names didn't contain their visible text ("Choose PDF files" shown as "Drop PDFs here") | 2.5.3 | Every file tool (`DropZone.astro`) and Compress PDF | `aria-label` removed. The name now comes from the visible text. |
| Regex matches in dark mode: near-white text on a half-transparent yellow | 1.4.3 | Regex Tester | Solid yellow with dark text in both themes, 11:1 |

## Found but excluded

These were found and considered, but not changed as part of WCAG work:

- **axe `region` (best practice, not WCAG):** the phone header bar sat outside any landmark. It's fixed anyway: the bar is now a `<header>`, which also helps screen-reader navigation.
- **Local-dev noise:** Wrangler's "Network connection lost" errors while testing. These happen when a page navigates away during a `keepalive` stats request. It's a dev-server artefact and not visible to users.

## Not covered by automated tools

Automated checks find roughly a third of WCAG problems. Still to do by hand (TODO B9):

- A keyboard-only walk through the sidebar drill-down, search, sorting, and one tool per group.
- A screen reader pass with NVDA (Windows) and VoiceOver (iOS) on the same paths.
- Zoom to 200% and 400% (reflow, 1.4.10), and text spacing (1.4.12).
- Focus that isn't obscured by the sticky sidebar or phone header (2.4.11).
