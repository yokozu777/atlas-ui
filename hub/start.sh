#!/bin/bash
# Start hub FastAPI (gateway.py) from the atlas-ui repo.

set -e
cd "$(dirname "$0")"
ROOT="$(cd .. && pwd)"
# Inspect (Logs / Workspace) runs in this process. Compose and Next.js read
# repo .env; without this, ATLAS_CLUSTER_ROOT is empty and those pages 400.
if [ -f "$ROOT/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  # shellcheck disable=SC1090
  . "$ROOT/.env"
  set +a
fi
export DATA_DIR="${DATA_DIR:-$ROOT/data}"
export ATLAS_UI_ROOT="${ATLAS_UI_ROOT:-$ROOT}"
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
# Not 6000: browsers and Node fetch() treat it as a blocked X11 port ("bad port").
export PORT="${PORT:-8000}"
mkdir -p "$DATA_DIR"

echo "=========================================="
echo "atlas-ui hub API"
echo "=========================================="
echo ""

if ! command -v python3 &> /dev/null; then
    echo "Python3 not found."
    exit 1
fi

if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# shellcheck disable=SC1091
source venv/bin/activate
pip install -q -r requirements.txt

echo "API: http://localhost:${PORT}"
echo "DATA_DIR=$DATA_DIR"
echo ""

python3 lab_secrets.py
if [ -z "${JWT_SECRET_KEY:-}" ] && [ -f "$DATA_DIR/auth/jwt_secret" ]; then
  export JWT_SECRET_KEY="$(tr -d '\n\r' < "$DATA_DIR/auth/jwt_secret")"
fi
if [ -z "${GLOBAL_SECRETS_ENCRYPTION_KEY:-}" ] && [ -f "$DATA_DIR/auth/encryption_key" ]; then
  export GLOBAL_SECRETS_ENCRYPTION_KEY="$(tr -d '\n\r' < "$DATA_DIR/auth/encryption_key")"
fi

python3 gateway.py
