#!/usr/bin/env bash
# Stages files (gitignore still applies) and commits on the current branch if
# needed, then snapshots that tree as a GitHub release commit + tag.
# Lab Gitea history is not rewritten. First GitHub run is an orphan commit;
# later runs parent onto the previous GitHub tip (fast-forward).
# Adds/updates remote `github` to yokozu777/atlas-ui if needed.
#
# Usage:
#   ./push-github.sh
#   ./push-github.sh "Release 0.2.0"
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=git-publish-lib.sh
source "$ROOT/git-publish-lib.sh"
cd "$ROOT"

REMOTE="${GITHUB_REMOTE:-github}"
RELEASE_REF="${GITHUB_RELEASE_BRANCH:-release}"
GITHUB_BRANCH="${GITHUB_HEAD_BRANCH:-main}"
GITHUB_URL="${GITHUB_URL:-git@github.com:yokozu777/atlas-ui.git}"
MSG="$(atlas_publish_release_message "${1:-}")"
TAG="$(atlas_publish_release_tag "${1:-}")"

atlas_publish_require_branch >/dev/null
atlas_publish_stage_and_commit "$MSG"
atlas_publish_warn_dirty

atlas_publish_ensure_remote "$REMOTE" "$GITHUB_URL"

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
git fetch "$REMOTE" "refs/tags/${TAG}:refs/tags/${TAG}" >/dev/null 2>&1 || true

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

release_commit="$(git rev-parse "$RELEASE_REF")"
if git show-ref --verify --quiet "refs/tags/$TAG"; then
  existing="$(git rev-parse "$TAG^{commit}")"
  if [ "$existing" != "$release_commit" ]; then
    echo "Tag $TAG already points at $existing, not $release_commit" >&2
    exit 1
  fi
  echo "Tag $TAG already on the release commit"
else
  git tag -a "$TAG" "$release_commit" -m "$MSG"
  echo "Tagged $TAG"
fi

git push "$REMOTE" "$RELEASE_REF:refs/heads/$GITHUB_BRANCH" "refs/tags/$TAG"
git branch -u "$REMOTE/$GITHUB_BRANCH" "$RELEASE_REF" >/dev/null 2>&1 || true
echo "GitHub: $url  $RELEASE_REF -> $GITHUB_BRANCH  tag $TAG"
