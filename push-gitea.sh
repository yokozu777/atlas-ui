#!/usr/bin/env bash
# Push the current branch to Gitea (origin) with full commit history.
# Does not rewrite history. Uncommitted files are not included.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=git-publish-lib.sh
source "$ROOT/git-publish-lib.sh"
cd "$ROOT"

atlas_publish_check_tracked
atlas_publish_warn_dirty

REMOTE="${GITEA_REMOTE:-origin}"
if ! git remote get-url "$REMOTE" >/dev/null 2>&1; then
  echo "Remote '$REMOTE' is missing. Example:" >&2
  echo "  git remote add origin git@gitea.mxhash.com:root/atlas-ui.git" >&2
  exit 1
fi

BRANCH="$(atlas_publish_require_branch)"
echo "Pushing $BRANCH -> $REMOTE ($REMOTE/$(git remote get-url "$REMOTE"))"
git push -u "$REMOTE" "HEAD:refs/heads/$BRANCH"
echo "Gitea: $(git remote get-url "$REMOTE")  branch $BRANCH"
