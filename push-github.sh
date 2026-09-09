#!/usr/bin/env bash
# Snapshot the current committed tree as one release commit and push to GitHub.
# Lab history on Gitea is left untouched. First run creates an orphan release
# commit; later runs parent onto the previous GitHub tip (fast-forward).
#
# Usage:
#   git remote add github git@github.com:ORG/atlas-ui.git   # once
#   ./push-github.sh
#   ./push-github.sh "Release 0.2.0"
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=git-publish-lib.sh
source "$ROOT/git-publish-lib.sh"
cd "$ROOT"

atlas_publish_check_tracked
atlas_publish_warn_dirty

REMOTE="${GITHUB_REMOTE:-github}"
RELEASE_REF="${GITHUB_RELEASE_BRANCH:-release}"
GITHUB_BRANCH="${GITHUB_HEAD_BRANCH:-main}"
MSG="${1:-Release $(date +%Y-%m-%d)}"

if ! git remote get-url "$REMOTE" >/dev/null 2>&1; then
  echo "Remote '$REMOTE' is missing. Add it once, then retry:" >&2
  echo "  git remote add github git@github.com:ORG/atlas-ui.git" >&2
  exit 1
fi

url="$(git remote get-url "$REMOTE")"
case "$url" in
  *github.com*) ;;
  *)
    echo "Remote '$REMOTE' does not look like GitHub: $url" >&2
    exit 1
    ;;
esac

tree="$(git rev-parse 'HEAD^{tree}')"
git fetch "$REMOTE" "$GITHUB_BRANCH" >/dev/null 2>&1 || true

if git show-ref --verify --quiet "refs/heads/$RELEASE_REF"; then
  parent="$(git rev-parse "$RELEASE_REF")"
elif git show-ref --verify --quiet "refs/remotes/$REMOTE/$GITHUB_BRANCH"; then
  git branch "$RELEASE_REF" "$REMOTE/$GITHUB_BRANCH"
  parent="$(git rev-parse "$RELEASE_REF")"
else
  parent=""
fi

if [ -n "$parent" ] && [ "$(git rev-parse "${parent}^{tree}")" = "$tree" ]; then
  echo "GitHub tree already matches HEAD; pushing $RELEASE_REF -> $REMOTE/$GITHUB_BRANCH"
else
  if [ -n "$parent" ]; then
    commit="$(git commit-tree "$tree" -p "$parent" -m "$MSG")"
  else
    commit="$(git commit-tree "$tree" -m "$MSG")"
  fi
  git update-ref "refs/heads/$RELEASE_REF" "$commit"
  echo "Release commit $commit"
  echo "$MSG"
fi

git push "$REMOTE" "$RELEASE_REF:refs/heads/$GITHUB_BRANCH"
git branch -u "$REMOTE/$GITHUB_BRANCH" "$RELEASE_REF" >/dev/null 2>&1 || true
echo "GitHub: $url  $RELEASE_REF -> $GITHUB_BRANCH"
