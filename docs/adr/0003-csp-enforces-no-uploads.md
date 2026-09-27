# 3. A Content Security Policy enforces "nothing is uploaded"

Date: 2026-09-27 · Status: accepted

## Context

"Your files never leave your device" is the core promise. With many contributors, a review can miss a stray `fetch`, analytics snippet or CDN import.

## Decision

Every page carries a CSP with `default-src 'self'` and `connect-src 'self'` (Astro `security.csp`, which hashes its own scripts). Worker scripts get the same policy through `public/_headers`. Third-party runtime files are vendored. Automated tests fail if a page references another origin, lacks the policy, makes an off-site request, or triggers a CSP violation.

## Consequences

- The promise is enforced by the browser, so visitors don't have to trust the review.
- No CDNs, hosted fonts, analytics or embeds. Fonts are self-hosted via Fontsource.
- Tools that need a library must vendor it, which adds a small step for contributors.
