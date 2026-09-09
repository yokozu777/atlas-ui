#!/usr/bin/env bash
# Stage tracked/untracked files (gitignore still applies), commit if needed,
# then push the current branch to Gitea with full history.
# Adds/updates remote `origin` to the lab Gitea repo if needed.
#
# Usage:
#   ./push-gitea.sh
#   ./push-gitea.sh "Update notes"
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=git-publish-lib.sh
source "$ROOT/git-publish-lib.sh"
cd "$ROOT"

MSG="${1:-Update $(date +%Y-%m-%d)}"
BRANCH="$(atlas_publish_require_branch)"
atlas_publish_stage_and_commit "$MSG"
atlas_publish_warn_dirty

REMOTE="${GITEA_REMOTE:-origin}"
GITEA_URL="${GITEA_URL:-git@gitea.mxhash.com:root/atlas-ui.git}"

atlas_publish_ensure_remote "$REMOTE" "$GITEA_URL"

echo "Pushing $BRANCH -> $REMOTE ($(git remote get-url "$REMOTE"))"
git push -u "$REMOTE" "HEAD:refs/heads/$BRANCH"
echo "Gitea: $(git remote get-url "$REMOTE")  branch $BRANCH"
