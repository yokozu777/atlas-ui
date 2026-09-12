#!/bin/bash
# Start hub worker (claim/execute against local FastAPI).

set -e
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
HUB="$ROOT/hub"
export DATA_DIR="${DATA_DIR:-$ROOT/data}"
export PYTHONPATH="$HUB${PYTHONPATH:+:$PYTHONPATH}"
export WORKER_SERVER_URL="${WORKER_SERVER_URL:-http://127.0.0.1:8000}"
export WORKER_TOKEN_FILE="${WORKER_TOKEN_FILE:-$DATA_DIR/worker.token}"
# requests follows HTTP_PROXY; Privoxy then 500s localhost (proxyon in the shell).
_local_no_proxy="127.0.0.1,localhost,::1"
export NO_PROXY="${NO_PROXY:+$NO_PROXY,}${_local_no_proxy}"
export no_proxy="${no_proxy:+$no_proxy,}${_local_no_proxy}"
if [ -z "${ATLAS_CLUSTER_ROOT:-}" ]; then
    nested="$ROOT/atlas-clusterctl"
    sibling="$(cd "$ROOT/.." && pwd)/atlas-clusterctl"
    if [ -x "$nested/cluster" ]; then
        export ATLAS_CLUSTER_ROOT="$nested"
    elif [ -x "$sibling/cluster" ]; then
        export ATLAS_CLUSTER_ROOT="$sibling"
    else
        export ATLAS_CLUSTER_ROOT="$nested"
    fi
fi
export ATLAS_UI_ROOT="${ATLAS_UI_ROOT:-$ROOT}"
mkdir -p "$DATA_DIR"

if [ ! -d "$HUB/venv" ]; then
    python3 -m venv "$HUB/venv"
fi
# shellcheck disable=SC1091
source "$HUB/venv/bin/activate"
pip install -q -r "$HUB/worker/requirements.txt"

exec python -m worker.main --poll-interval 5 --max-concurrency 1 "$@"
