# Shared preflight for ./push-gitea.sh, ./push-github.sh, ./push-dockerhub.sh.
# Not meant to be run directly.

atlas_publish_check_tracked() {
  local bad
  bad="$(
    git ls-files | grep -E -i \
      '(^|/)\.env($|\.[^/]*$)|^data/|(^|/)worker\.token$|(^|/)jwt_secret$|(^|/)encryption_key$|admin-initial|(^|/)id_rsa|\.pem$' \
      | grep -vE '(^|/)\.env\.example$' || true
  )"
  if [ -n "$bad" ]; then
    echo "Refusing to push: tracked paths look like lab data or secrets:" >&2
    echo "$bad" >&2
    echo "Untrack them (keep .gitignore) before publishing." >&2
    exit 1
  fi
}

atlas_publish_stage_and_commit() {
  local msg="$1"
  git add -A -- .
  atlas_publish_check_tracked
  if git diff --cached --quiet; then
    echo "Nothing new to commit."
    return 0
  fi
  git commit -m "$msg"
}

atlas_publish_warn_dirty() {
  if [ -n "$(git status --porcelain)" ]; then
    echo "Note: uncommitted changes stay on this machine; only existing commits are pushed." >&2
  fi
}

atlas_publish_ensure_remote() {
  local name="$1"
  local url="$2"
  local current
  if git remote get-url "$name" >/dev/null 2>&1; then
    current="$(git remote get-url "$name")"
    if [ "$current" != "$url" ]; then
      echo "Updating remote $name: $current -> $url"
      git remote set-url "$name" "$url"
    fi
  else
    echo "Adding remote $name $url"
    git remote add "$name" "$url"
  fi
}

atlas_publish_require_branch() {
  local branch
  branch="$(git rev-parse --abbrev-ref HEAD)"
  if [ "$branch" = "HEAD" ]; then
    echo "Detached HEAD; checkout a branch first." >&2
    exit 1
  fi
  printf '%s' "$branch"
}

atlas_publish_release_message() {
  printf '%s' "${1:-Release $(date +%Y-%m-%d)}"
}

atlas_publish_release_tag() {
  local raw tag
  raw="$(atlas_publish_release_message "${1:-}")"
  case "$raw" in
    [Rr]elease\ *) raw="${raw#* }" ;;
  esac
  tag="$(
    printf '%s' "$raw" \
      | tr '[:upper:]' '[:lower:]' \
      | sed -E 's/[^a-z0-9._-]+/-/g; s/^[-.]+//; s/[-.]+$//'
  )"
  if [ -z "$tag" ]; then
    echo "Cannot derive a release tag from: ${1:-}" >&2
    exit 1
  fi
  printf '%s' "$tag"
}

atlas_publish_docker_tag() {
  atlas_publish_release_tag "${1:-}"
}
