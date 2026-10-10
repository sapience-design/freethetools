# 11. Which pages we build for search

Date: 2026-10-10 · Status: accepted (decided by Sapience Design)

## Context

Most visitors will arrive from a search for a job, in their own language. The head terms ("compress pdf") are held by services that process files on their servers. Sites that compete for those terms often build one page per keyword, which search engines treat as thin content and visitors treat as spam. The vision ([vision.md](../explanation/vision.md)) rules out thin pages but does not say what a page must have to exist.

## Decision

Pages are limited to six kinds: tool, group, guide, preset, language and comparison. The conditions for each are in [the search policy](../explanation/seo-policy.md). In short:

- A page must run a tool, explain how to do a job with a tool, or explain the project.
- A preset page needs Search Console evidence, a real preset applied on open, its own explanation, and links both ways with its tool page. At most three per tool.
- Guides are one per job, 300 to 600 words, with the tool embedded.
- Language pages are full translations with `hreflang`, and machine drafts say so until a person reviews them.
- Comparison pages make only claims with a source and a date, and never use another company's logo.
- Keyword-variation pages, link pages and untestable claims are refused.

Search Console is read monthly. A preset or language page with no impressions after 90 days is removed or merged.

## Consequences

- Fewer pages than a content-farm competitor, each with a reason to exist. Growth comes from guides, languages and the agent channel, not from page count.
- Every new page kind needs a build-time test (title, description, canonical, policy, inbound links), so the policy is checked by the build and not by memory.
- Contributors can propose a guide or a preset page in a pull request by showing the four conditions in its description.
- The policy will be revisited when Search Console has 90 days of data.
