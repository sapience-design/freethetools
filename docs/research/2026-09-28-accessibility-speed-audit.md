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

## The manual pass (TODO B9), as far as it can be automated

`e2e/a11y-manual.spec.js` runs on desktop and phone in CI. It checks the points below.

| Item | What the tests do |
|---|---|
| Keyboard only | Tab, Enter, Escape and arrow keys only. They drill into a group and back, search ("/", type, arrows, Enter), sort, and use one tool per group. Every control in those six tools must be reachable and show a focus indicator. Drop zones must open the file chooser. |
| Screen reader (partly) | Roles and names: landmarks, search box, current page, theme buttons, sort group, Save buttons, tool fields. Live regions: every tool result area exists before it changes, and every error box is announced. Search and sorting announce through a status region. |
| Reflow (1.4.10) | Every page in the sitemap at 320 and 640 CSS px: no horizontal page scroll. |
| Text spacing (1.4.12) | Eleven representative pages at 1280 and 360 px with the four spacing values applied: no element may clip its text. |
| Focus not obscured (2.4.11) | Tab through nine representative pages, and a 320 by 256 px window. Each focused element must be inside the window and must be the topmost element at its centre. |

### Fixed

| Issue | WCAG | Fix |
|---|---|---|
| On a phone, the closed menu drawer sat off screen but stayed in the tab order. Tab moved focus to 19 invisible links. | 2.4.3, 2.4.7, 2.4.11 | The closed drawer is `inert` (`Sidebar.astro`). Desktop is unchanged. |
| The open drawer did not take focus, did not trap it, and Escape did not return it. | 2.4.3 | Opening moves focus into the drawer. Tab wraps inside it, the page behind it is `inert`, and closing returns focus to the Menu button. |
| Search results appeared in a list that started hidden, so screen readers did not announce them. Arrow keys moved a highlight that was visual only. | 4.1.3 | A permanent status region says how many results there are and which one is selected. |
| Sorting reordered the cards without a word to screen readers. | 4.1.3 | A status region says "Sorted by A–Z" (`SortBar.astro`). |
| The error boxes in JWT Decoder, QR Code Maker and Regex Tester appeared silently. | 4.1.3 | They are `role="alert"`. |

### Passed with no change

Reflow at 320 and 640 px, text spacing, and focus-not-obscured on desktop. The sticky sidebar is a grid column, so it never covers content. The phone header bar is not sticky.

### Still needs a person

Run these with NVDA on Windows (Firefox and Chrome) and VoiceOver on iOS (Safari).

1. Search: type a word, press the arrow keys, and check that the status text is spoken once and not twice.
2. Sort: check that "Sorted by" is spoken and that the radio group reads as a group.
3. Phone drawer: open it, and check that focus lands on Close and that the page behind is silent. Close it, and check that focus returns to Menu.
4. One tool per group: add a real file in PDF and Images, and check that the result and any error are spoken.
5. Regex Tester: type a bad pattern, and check that the alert is spoken once and not on every key.
6. Case Converter, JSON Formatter and Unit Converter: check that the result is read after each change, and not read too often.
7. Check that the decorative product shots are skipped and the "Made to order" cards read sensibly.

### Open decisions for the owner

- **"/" opens search (WCAG 2.1.4, level A).** A single-key shortcut that is always on needs a way to turn it off, remap it, or limit it to when search has focus. The fix changes behaviour, so it is not made. Options: require a modifier key, or add a switch.
- **No "Skip to content" link (2.4.1).** The landmarks satisfy the criterion, but keyboard users pass about 25 sidebar links on every page. A link shown only on focus would help. It adds a visual element, so the theme owner should style it.
