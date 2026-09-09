#!/bin/bash
# Docker: persist JWT/encryption keys under DATA_DIR, then start the hub.
set -euo pipefail
export DATA_DIR="${DATA_DIR:-/app/data}"
mkdir -p "$DATA_DIR"
python3 lab_secrets.py
if [ -z "${JWT_SECRET_KEY:-}" ] && [ -f "$DATA_DIR/auth/jwt_secret" ]; then
  export JWT_SECRET_KEY="$(tr -d '\n\r' < "$DATA_DIR/auth/jwt_secret")"
fi
if [ -z "${GLOBAL_SECRETS_ENCRYPTION_KEY:-}" ] && [ -f "$DATA_DIR/auth/encryption_key" ]; then
  export GLOBAL_SECRETS_ENCRYPTION_KEY="$(tr -d '\n\r' < "$DATA_DIR/auth/encryption_key")"
fi
exec python3 gateway.py
