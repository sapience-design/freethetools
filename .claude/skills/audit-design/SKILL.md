---
name: audit-design
description: Visual and accessibility audit of changed pages. Takes screenshots on desktop and phone in light and dark themes and checks them against the project's design system and WCAG 2.2 AA. Use before opening a PR with any visible change.
argument-hint: "[page path, e.g. /text/word-counter/]"
---

# Design audit

1. Build and serve the site the way the project's e2e tests do (see `playwright.config.*`). Reuse its `webServer` and never start a second server.
2. Use Playwright (already installed; never run `playwright install`) to capture the changed pages:
   - at 1440×1000 and on a Pixel 7
   - in the light and dark themes
   - in the empty state and after the page's example runs
3. Save the screenshots to the scratchpad, then look at them. Check:
   - **Consistency:** shared components and design tokens used rather than new CSS, spacing on the grid, the same visual weight as sibling pages.
   - **Layout:** no sideways scroll, nothing cut off, sticky bars don't hide the focus ring.
   - **Accessibility:** run axe where the project has it. Keyboard order, visible focus, labels that match visible text, contrast in both themes.
   - **Writing:** plain language, sentence case, and error messages that say what to do.
4. Fix what is clearly wrong within the PR's scope. List the rest.
5. Attach the before and after screenshots to the PR description.
