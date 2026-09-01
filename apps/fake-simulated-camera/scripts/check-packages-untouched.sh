#!/usr/bin/env bash
# The fake camera lives in the app only: fails if this change set touches packages/.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

if [[ $# -ge 1 ]]; then
  base="$1"
elif git rev-parse --verify --quiet upstream/main >/dev/null; then
  base="$(git merge-base upstream/main HEAD)"
else
  base="$(git merge-base origin/main HEAD)"
fi
status=0

if ! git diff --quiet "$base" HEAD -- packages/; then
  echo "error: committed changes under packages/ since ${base}:"
  git diff --stat "$base" HEAD -- packages/
  status=1
fi

if ! git diff --quiet -- packages/; then
  echo "error: unstaged changes under packages/:"
  git diff --stat -- packages/
  status=1
fi

if ! git diff --cached --quiet -- packages/; then
  echo "error: staged changes under packages/:"
  git diff --cached --stat -- packages/
  status=1
fi

untracked="$(git status --porcelain --untracked-files=all -- packages/)"
if [[ -n "$untracked" ]]; then
  echo "error: untracked files under packages/:"
  echo "$untracked"
  status=1
fi

if [[ "$status" -eq 0 ]]; then
  echo "packages/ untouched (base ${base})"
fi
exit "$status"
