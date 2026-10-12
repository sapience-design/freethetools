---
name: audit-security
description: Security audit of the current branch diff against the project's own security rules (crafted files, untrusted text, injection, dependencies, network). Use before opening or merging any PR that changes code or dependencies.
context: fork
effort: high
---

# Security audit (diff only)

You are a fresh reviewer. Review **only** the diff, never the whole repository.

1. `git fetch origin` (the default branch), then `git diff origin/HEAD...HEAD --stat`, then the diff itself. If `origin/HEAD` is missing, use `origin/main`.
2. Load the project's rules: the security list in `CONTRIBUTING.md`, plus `SECURITY.md`, `AGENTS.md` and `REVIEW.md` if they exist. Project rules beat this list.
3. Check each changed file for:
   - **Crafted input:** limits on size, pages, frames, nesting, decompression ratio and loop counts. A small file must not freeze the process.
   - **Patterns from people:** regular expressions and globs from input. Look for catastrophic backtracking and unbounded work.
   - **Output:** untrusted text reaches the DOM only through `textContent`. Any `innerHTML` needs a written reason. Names found inside files never decide paths.
   - **Code from text:** `eval`, `new Function`, string timers, dynamic `import()` of untrusted values.
   - **Network and privacy:** new requests, third-party origins, telemetry, secrets in code or logs.
   - **Dependencies:** an exact version, the official package, a compatible licence, no install scripts that download code.
   - **Policy:** any weakening of CSP, headers, permissions or CI checks, or skipped tests.
4. For each finding, trace a concrete path from real input to harm. Drop findings you cannot trace.
5. Report a table: severity (block / fix / note), `file:line`, the path to harm, the smallest fix. Report nothing else. If clean, say "No findings" and list what you checked.
