# 16. Several tools, one shared screen

Date: 2026-10-15 · Status: proposed · Extends [ADR 0004](0004-one-folder-per-tool.md) and [ADR 0015](0015-shared-pdf-editor.md)

## Context

The site has 36 tools in six groups, and 7 more are requested. Several of them do jobs on the same input that people do one after another:

- Merge, Split and Rotate all work on the pages of a PDF. Deleting and reordering pages (requested) is the same kind of work.
- Compress, Resize, Convert and HEIC to JPG all save a photo in a new form. Crop (requested) is one more setting on the same photo.
- Fill PDF Form and View and Edit PDF both write on a PDF. Watermark and page numbers (requested) also writes on every page.
- Protect PDF and Unlock PDF both handle a PDF's password.

Each of these tools has its own screen, with its own way of taking files and saving results. A job that needs two of them, such as rotating a page and then deleting another, means choosing the file twice on two pages. Every request adds one more screen to build, test and translate, and the same step behaves a little differently from tool to tool.

Each tool page is also how people find the site. They search for the job, such as "rotate pdf" ([ADR 0011](0011-search-pages.md)), and they scan the lists for the job's name. The folder is the URL, and moving a URL is a breaking change ([ADR 0004](0004-one-folder-per-tool.md)). Usage totals are counted per tool id ([ADR 0006](0006-anonymous-usage-totals.md), [ADR 0007](0007-visits-and-outcomes.md)). AI assistants work best with small tools that do one thing ([ADR 0008](0008-tools-for-ai-agents.md)).

[ADR 0015](0015-shared-pdf-editor.md) already did this once: one PDF editor in the shared viewer, which every PDF tool uses.

## Decision

**Share the screen, keep the pages.**

- Tools whose jobs meet the three conditions below share one screen. Its code lives in `src/lib/<screen>/`, as the PDF editor does in `src/lib/pdf-edit/`. Each tool's `Tool.astro` shows that screen, opened for its own job. For example, `/pdf/split/` opens the page screen ready to split.
- Each tool keeps everything else: its folder and URL, its texts, FAQ and translations, its `core.js`, `agent.js` and tests, its usage totals and its share image.
- The lists keep a row for every job, so people find a job by its own name. Tools that share a screen name it in their `tool.json` (`"screen": "<name>"`). Their rows sit together in their section, and each of their pages links to the others ("Also here: Merge · Rotate · Delete pages").
- No page is added just to hold a shared screen.

**When to share a screen.** All three must hold. Sharing a group or a word is not enough.

1. **Same input:** the same kind of file or text.
2. **Same sitting:** people do the jobs one after another on the same file, such as rotating, deleting and reordering pages, or resizing, cropping and compressing a photo.
3. **One job at a time:** the shared screen opens on the page's own job and keeps the other jobs one step away, so it is never busier than the tool it replaces.

**One page is not the goal.** Many jobs are better on a screen of their own: when the input differs, when people rarely do the jobs together, or when a shared screen would be busier than the separate ones. Keeping them apart is a good result, not a missed merge. When in doubt, keep them apart.

**Requested tools.** Before a requested tool is built, check whether it can open on an existing shared screen. If it can, it gets its own page and row at the address it has now, so its page and its votes carry over, but no new screen. If it cannot, it is built as its own tool, as before. The planned shared screens are in [TODO.md](../../TODO.md).

## Consequences

- Fewer screens to build, test and learn. When the planned shared screens are done and five requests are met, 41 tools run on about 28 screens instead of 41.
- The lists still show every job, and no URL is removed or hidden.
- Two jobs on one file no longer mean choosing the file twice, and the same step works the same way in every tool on a screen.
- Each tool page still has its own title, description and FAQ, so the [search policy](../explanation/seo-policy.md) treats it as a tool page. The build test for unique titles still applies.
- A shared screen is bigger than any one tool. If it shows every control at once, it is worse than the tools it replaces. Each shared screen is reviewed against the three conditions above, one pull request at a time.
- The `screen` field and the "Also here" links come once, in their own pull request, before any tool uses them.

## Options not chosen

- **One row per shared screen in the lists.** The list is shorter, but a job such as "Merge PDFs" is harder to find when its name sits under another one. People recognise their job's name more easily than they recall which tool holds it (Nielsen, 1994).
- **Remove the merged pages and redirect them.** This loses the pages people search for, breaks links (ADR 0004) and renames the AI tools.
- **One page per group that does everything.** This hides each job behind modes, and every page would load the code for every job.
- **A separate screen for every tool, as now.** Every request adds a screen to build, test and translate, and the same step behaves differently from tool to tool.

## References

- Nielsen, J. (1994). Enhancing the explanatory power of usability heuristics. *Proceedings of the SIGCHI Conference on Human Factors in Computing Systems (CHI '94)*, 152–158.
