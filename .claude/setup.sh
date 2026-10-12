#!/usr/bin/env bash
# Cloud-session setup, run by the playbook's SessionStart hook (only when CLAUDE_CODE_REMOTE=true).
# Installs dependencies so `npm run check` works from the first prompt. Chromium is preinstalled.
set -euo pipefail
cd "$(dirname "$0")/.."
if [ ! -d node_modules ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  npm ci --no-audit --no-fund --loglevel=error
fi
