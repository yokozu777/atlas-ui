# Shared preflight for ./push-gitea.sh and ./push-github.sh.
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

atlas_publish_warn_dirty() {
  if [ -n "$(git status --porcelain)" ]; then
    echo "Note: uncommitted changes stay on this machine; only existing commits are pushed." >&2
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
