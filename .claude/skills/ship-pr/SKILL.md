---
name: ship-pr
description: Final gate before pushing - run the project's checks, re-read the diff adversarially, write a Conventional Commit with sign-off, and open a small PR from the template. Use when work is ready to push.
disable-model-invocation: true
---

# Ship a PR

1. Run the project's full check (`npm run check` or what `AGENTS.md` names). On failure, show only the failing lines, fix, and rerun. Never skip, delete or loosen a test.
2. Re-read `git diff` as a hostile reviewer. Ask what CI or a maintainer would reject: stray files, debug output, unrelated changes, missing changelog entry, missing translations. Fix these.
3. If code changed, run the `audit-security` skill. If something visible changed, run the `audit-design` skill.
4. Commit as a Conventional Commit with `git commit -s`. The person whose name signs off must have reviewed the change.
5. Open the PR. Mirror the template's headings, link the issue, attach the screenshots, and keep it to one change.
6. Offer to watch the PR for CI and review events.
