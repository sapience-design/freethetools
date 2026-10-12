# How to build with Claude Code

This repository ships the shared [Sapience Design playbook](https://github.com/sapience-design/claude-playbook) in `.claude/`. The playbook explains why the workflow looks like this. This page covers how to use it here, on your machine and in cloud sessions.

## What is in `.claude/`

| Path | What it is | Owner |
|---|---|---|
| `skills/spec-first`, `audit-security`, `audit-design`, `ship-pr` | Shared skills | Playbook (synced; don't edit here) |
| `hooks/playbook/`, `settings.json` | SessionStart setup and the protected-path guard | Playbook (synced) |
| `playbook.json` | The synced playbook version | Playbook (synced) |
| `skills/new-tool` | Builds a tool end to end | This repo |
| `rules/tools.md` | Rules that load only when Claude touches `tools/**` | This repo |
| `setup.sh` | `npm ci` in cloud sessions | This repo |
| `protected-paths` | Files Claude must not edit: the CSP, safety tests, security CI | This repo |

The guard blocks edits to the files listed in `protected-paths`. Claude explains the change it needs, and a maintainer makes it by hand. [REVIEW.md](../../REVIEW.md) tells reviewers and review bots what is blocking.

## Build a tool

1. Pick an accepted tool request, for example issue 123.
2. `/spec-first 123`. Claude writes a short spec and failing tests, then stops. Read them; this is the cheapest point to steer.
3. Approve, then `/clear` and `/new-tool 123`. Claude scaffolds the tool, makes the tests pass, fills `tool.json`, `Tool.astro` and `agent.js`, and runs `npm run check` and both audits.
4. `/ship-pr`. Read the diff, the screenshots and the audit findings before you sign off. The sign-off is your Developer Certificate of Origin.

Keep at most two or three tool PRs open at a time. Translations follow in one weekly batch PR.

## On your machine

```bash
npm ci
claude                    # auto mode or plan mode (Shift+Tab)
claude -w word-counter    # a separate worktree to run tasks side by side
```

The skills and hooks come from the committed `.claude/`, so you don't need to install the plugin. If you have also installed the playbook plugin globally, turn it off here so the skills don't appear twice: in `.claude/settings.local.json`, set `"enabledPlugins": { "playbook@sapience-design": false }`.

## In the cloud (claude.ai/code)

- Start one session per issue: `claude --cloud "/spec-first 123"`, or start one at claude.ai/code.
- The SessionStart hook runs `.claude/setup.sh`, so tests work from the first prompt. Chromium is already installed; never run `playwright install`.
- Once the PR is open, ask the session to watch it. It fixes CI failures and answers review comments.

## Keep usage down

- Default to Sonnet. Use `/model opusplan` for a hard tool, and a high `/effort` only for audits.
- Run `/clear` between tasks, and start a fresh session for each tool.
- Check `/usage` for what each skill and MCP server costs. Turn off unused MCP servers with `/mcp`.

## Update the playbook

In a clone of `sapience-design/claude-playbook`, run `node scripts/sync.mjs ../freethetools`. Commit the result as `chore(claude): sync playbook <version>`.
