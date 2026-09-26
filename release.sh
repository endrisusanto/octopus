#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  ./release.sh [patch|minor|major] [commit message]

Examples:
  ./release.sh
  ./release.sh patch "Fix device bridge auto-reconnect"
  ./release.sh minor "Add batch firmware flashing support"

Environment Variables:
  REMOTE   Git remote name (default: origin)
  BRANCH   Git target branch (default: main)
  REPO_URL Repository URL (default: https://github.com/endrisusanto/octopus)
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

BUMP="${1:-patch}"
if [[ "$BUMP" != "patch" && "$BUMP" != "minor" && "$BUMP" != "major" ]]; then
  echo "ERROR: bump must be one of: patch, minor, major" >&2
  usage >&2
  exit 1
fi

COMMIT_MESSAGE="${2:-chore(release): bump version and publish artifacts}"
REMOTE="${REMOTE:-origin}"
PREFIX="v"

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Initializing git repository..."
  git init
  git remote add origin https://github.com/endrisusanto/octopus.git || true
fi

CURRENT_BRANCH="$(git branch --show-current || true)"
BRANCH="${BRANCH:-${CURRENT_BRANCH:-main}}"

echo "=================================================="
echo " Octopus Automated Release Pipeline"
echo " Remote : $REMOTE"
echo " Branch : $BRANCH"
echo " Bump   : $BUMP"
echo "=================================================="

# Fetch latest tags
git fetch "$REMOTE" --tags --prune >/dev/null 2>&1 || true

LOCAL_TAGS="$(git tag --list "${PREFIX}[0-9]*.[0-9]*.[0-9]*" || true)"
REMOTE_TAGS="$(git ls-remote --tags --refs "$REMOTE" "${PREFIX}[0-9]*.[0-9]*.[0-9]*" 2>/dev/null \
  | awk '{print $2}' \
  | sed 's#refs/tags/##' || true)"

LATEST_TAG="$(printf '%s\n%s\n' "$LOCAL_TAGS" "$REMOTE_TAGS" \
  | sed '/^$/d' \
  | sort -V \
  | tail -n 1 || true)"

if [[ -z "$LATEST_TAG" ]]; then
  LATEST_TAG="${PREFIX}1.0.0"
fi

VERSION="${LATEST_TAG#"$PREFIX"}"
IFS='.' read -r MAJOR MINOR PATCH <<< "$VERSION"

case "$BUMP" in
  major)
    MAJOR=$((MAJOR + 1))
    MINOR=0
    PATCH=0
    ;;
  minor)
    MINOR=$((MINOR + 1))
    PATCH=0
    ;;
  patch)
    PATCH=$((PATCH + 1))
    ;;
esac

NEXT_VERSION="${MAJOR}.${MINOR}.${PATCH}"
NEXT_TAG="${PREFIX}${NEXT_VERSION}"

echo "[Release] Current Version : $LATEST_TAG"
echo "[Release] Next Version    : $NEXT_TAG"

# Update version files across web-hub and agent-bridge
node scripts/bump-version.mjs --version "$NEXT_VERSION"

# Generate brief release notes from git log
CHANGELOG="$(git log "${LATEST_TAG}..HEAD" --oneline 2>/dev/null || git log -n 5 --oneline)"
echo "----------------------------------------"
echo "Release Notes Preview for $NEXT_TAG:"
echo "$CHANGELOG"
echo "----------------------------------------"

# Stage all files
git add -A

# Commit if there are changes
if git diff --cached --quiet; then
  echo "[Release] No uncommitted changes, tagging current HEAD."
else
  git commit -m "chore(release): $NEXT_TAG - $COMMIT_MESSAGE"
fi

# Create annotated tag
git tag -a "$NEXT_TAG" -m "Octopus Release $NEXT_TAG"

echo "[Release] Pushing $BRANCH to $REMOTE..."
git push "$REMOTE" "HEAD:$BRANCH" || true

echo "[Release] Pushing tag $NEXT_TAG to trigger GitHub Actions build..."
git push "$REMOTE" "$NEXT_TAG" || true

echo "=================================================="
echo " Release $NEXT_TAG Dispatched Successfully!"
echo " GitHub Actions is now building:"
echo "  - Linux DEB & RPM with .sig signatures"
echo "  - Windows NSIS setup.exe with .sig signatures"
echo "  - latest.json manifest for silent updater"
echo " Repository: https://github.com/endrisusanto/octopus/releases/tag/$NEXT_TAG"
echo "=================================================="
