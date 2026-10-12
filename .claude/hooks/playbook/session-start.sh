#!/usr/bin/env bash
# SessionStart hook. In cloud sessions, run the project's own setup (.claude/setup.sh) so tests
# work from the first prompt. Locally, do nothing: your machine is already set up.
# Whatever this prints goes into Claude's context, so keep it short.
set -euo pipefail
dir="${CLAUDE_PROJECT_DIR:-$PWD}"
if [ "${CLAUDE_CODE_REMOTE:-}" = "true" ] && [ -x "$dir/.claude/setup.sh" ]; then
  if ! out=$("$dir/.claude/setup.sh" 2>&1); then
    echo "Project setup failed. Last lines:"; echo "$out" | tail -n 15
    exit 0
  fi
fi
cd "$dir"
echo "Branch: $(git branch --show-current 2>/dev/null || echo none). Uncommitted files: $(git status --porcelain 2>/dev/null | wc -l)."
