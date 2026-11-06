#!/bin/bash
set -e

ensure_github_token() {
  if [ -n "${GITHUB_TOKEN:-}" ]; then
    return
  fi

  if [ -n "${GH_TOKEN:-}" ]; then
    export GITHUB_TOKEN="$GH_TOKEN"
    return
  fi

  if command -v gh >/dev/null 2>&1; then
    local token
    token="$(gh auth token 2>/dev/null || true)"
    if [ -n "$token" ]; then
      export GITHUB_TOKEN="$token"
      return
    fi
  fi

  echo "error: GITHUB_TOKEN is required to create the GitHub release automatically." >&2
  echo "Run 'gh auth login' or export a GitHub token with repo scope before running this release script." >&2
  exit 1
}

echo "Starting the release process..."
echo "Provided options: $*"

ensure_github_token

echo "Building all packages before publishing"
bun run build

for pkg in packages/*; do
  [ -d "$pkg" ] || continue
  echo "Publishing '$(basename "$pkg")' to NPM"
  (cd "$pkg" && bun release "$@")
done

echo "Creating a Git bump commit and GitHub release"
bun run release-it "$@"

echo "Successfully released VisionCamera!"
