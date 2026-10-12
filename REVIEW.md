# Review guide

For people and review bots reviewing pull requests here. The full rules are in [AGENTS.md](AGENTS.md) and
[CONTRIBUTING.md](CONTRIBUTING.md).

## Always blocking

- Anything that sends data off the device: requests to other sites, third-party scripts, fonts, images or analytics.
- A weaker Content Security Policy (`astro.config.mjs`, `public/_headers`), or a test that was skipped, deleted or loosened.
- `eval`, `new Function`, string timers, or an `innerHTML` write without a `safe-html:` comment.
- Network access, Node built-ins or `process` in `core.js` or `agent.js`.
- No limits on file size, pages, frames, decompression or patterns from people, so a crafted file can hang the tab.
- A dependency without an exact version, with an incompatible licence, or with an install script that downloads code.
- Unsigned commits (DCO).

## Check, then fix or explain

- Inline `style`, ids without the slug prefix, hard-coded interface text that belongs in `src/i18n/en.json`.
- WCAG 2.2 AA: labels, keyboard order, visible focus, contrast in both themes.
- Plain language in interface text and error messages.
- A changelog entry in `changelog.d/`, and screenshots for anything visible.

## Nits

At most five per review, marked "(optional)". Never block on style the formatter or tests don't enforce.
