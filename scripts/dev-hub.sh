#!/bin/bash
# Hub console: Next.js with HUB_API_URL → local FastAPI.
# Does not require pnpm to already be on PATH.

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
# shellcheck disable=SC1091
. "$ROOT/scripts/node-path.sh"

export HUB_API_URL="${HUB_API_URL:-${STARGATE_API_URL:-http://127.0.0.1:8000}}"

if command -v pnpm >/dev/null 2>&1; then
    exec pnpm dev
fi

if [ -x "$ROOT/node_modules/.bin/next" ]; then
    exec "$ROOT/node_modules/.bin/next" dev -H 127.0.0.1 -p 3000
fi

echo "pnpm/next not found. From this repo run: PATH=\"\$HOME/.local/node/bin:\$PATH\" pnpm install" >&2
exit 1
