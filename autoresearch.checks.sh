#!/usr/bin/env bash
set -euo pipefail

run() {
  local name="$1"
  shift
  mkdir -p .autoresearch-tmp
  local log=".autoresearch-tmp/${name}.log"
  if "$@" >"$log" 2>&1; then
    return 0
  fi
  echo "CHECK_FAILED $name"
  tail -80 "$log"
  return 1
}

if command -v bunx >/dev/null 2>&1 && command -v bun >/dev/null 2>&1; then
  run typecheck just typecheck
  run unit just unit
else
  run typecheck ./node_modules/.bin/tsc --noEmit
fi
