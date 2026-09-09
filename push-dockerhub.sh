#!/usr/bin/env bash
# Build the three compose images from the committed tree and push to Docker Hub
# (https://hub.docker.com/u/yokozu). Tags match ./push-github.sh: moving
# `latest` plus a release tag (date by default, or the version from the
# optional message).
#
# Usage:
#   docker login
#   ./push-dockerhub.sh
#   ./push-dockerhub.sh "Release 0.2.0"
#
# Override namespace: DOCKERHUB_NS=yokozu ./push-dockerhub.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=git-publish-lib.sh
source "$ROOT/git-publish-lib.sh"
cd "$ROOT"

atlas_publish_check_tracked
atlas_publish_warn_dirty

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is not on PATH." >&2
  exit 1
fi

NS="${DOCKERHUB_NS:-yokozu}"
MSG="$(atlas_publish_release_message "${1:-}")"
TAG="$(atlas_publish_docker_tag "${1:-}")"
IMAGES=(atlas-ui atlas-ui-hub atlas-ui-worker)

WORKDIR="$(mktemp -d)"
cleanup() { rm -rf "$WORKDIR"; }
trap cleanup EXIT

echo "Exporting committed tree to $WORKDIR"
git archive HEAD | tar -x -C "$WORKDIR"

build_one() {
  local name="$1" file="$2"
  local dest="${NS}/${name}"
  echo "Building ${dest}:${TAG}  (${file})"
  docker build \
    -f "$WORKDIR/$file" \
    -t "${dest}:${TAG}" \
    -t "${dest}:latest" \
    --label "org.opencontainers.image.title=${name}" \
    --label "org.opencontainers.image.version=${TAG}" \
    --label "org.opencontainers.image.revision=$(git -C "$ROOT" rev-parse HEAD)" \
    --label "org.opencontainers.image.description=${MSG}" \
    "$WORKDIR"
}

build_one atlas-ui Dockerfile
build_one atlas-ui-hub hub/Dockerfile
build_one atlas-ui-worker hub/Dockerfile.worker

for name in "${IMAGES[@]}"; do
  dest="${NS}/${name}"
  echo "Pushing ${dest}:${TAG}"
  docker push "${dest}:${TAG}"
  if [ "$TAG" != "latest" ]; then
    echo "Pushing ${dest}:latest"
    docker push "${dest}:latest"
  fi
done

tags="$TAG"
if [ "$TAG" != "latest" ]; then
  tags="${TAG}, latest"
fi
echo "Docker Hub: https://hub.docker.com/u/${NS}"
echo "Release: $MSG"
echo "Tags: $tags"
for name in "${IMAGES[@]}"; do
  echo "  ${NS}/${name}:${TAG}"
done
