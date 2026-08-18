#!/usr/bin/env bash
# Runs the Playwright suite in the same Linux image CI uses, so committed
# screenshots match byte-for-byte regardless of the developer's machine.
set -euo pipefail

cd "$(dirname "$0")/.."
[ -d node_modules ] || npm ci

version=$(node -p "require('./node_modules/@playwright/test/package.json').version")

exec docker run --rm --ipc=host \
  -v "$PWD":/work -w /work \
  "mcr.microsoft.com/playwright:v${version}-noble" \
  npx playwright test "$@"
