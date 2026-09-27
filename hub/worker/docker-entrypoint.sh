#!/bin/bash
# Optional: if SSH_KEY points at a file (debug / leftover bind), copy it onto
# the overlay with 0700/0600, normalize CRLF/BOM, optionally convert to PEM.
# Atlas-ui injects the Secrets Manager key as SSH_KEY at claim time instead.
set -euo pipefail
export DATA_DIR="${DATA_DIR:-/app/data}"
if [ -z "${GLOBAL_SECRETS_ENCRYPTION_KEY:-}" ] && [ -f "$DATA_DIR/auth/encryption_key" ]; then
  export GLOBAL_SECRETS_ENCRYPTION_KEY="$(tr -d '\n\r' < "$DATA_DIR/auth/encryption_key")"
fi
if [ -n "${SSH_KEY:-}" ] && [ -f "${SSH_KEY}" ]; then
  src="${SSH_KEY}"
  mkdir -p /tmp/atlas-ssh
  chmod 700 /tmp/atlas-ssh
  dest=/tmp/atlas-ssh/id_rsa
  cp "${src}" "${dest}"
  python3 - <<'PY' || true
from pathlib import Path
p = Path("/tmp/atlas-ssh/id_rsa")
data = p.read_bytes()
out = None
try:
    import sys
    sys.path.insert(0, "/atlas/clusterctl")
    from clusterctl.git_ssh import normalize_openssh_private_key_bytes
    out = normalize_openssh_private_key_bytes(data)
except Exception:
    text = data.decode("utf-8", errors="replace").replace("\r\n", "\n").replace("\r", "\n")
    if text.startswith("\ufeff"):
        text = text.lstrip("\ufeff")
    if text and not text.endswith("\n"):
        text += "\n"
    out = text.encode("utf-8")
p.write_bytes(out)
p.chmod(0o600)
PY
  sed -i 's/\r$//' "${dest}" || true
  if [ -s "${dest}" ] && [ "$(tail -c 1 "${dest}" | wc -l)" -eq 0 ]; then
    printf '\n' >> "${dest}"
  fi
  chmod 600 "${dest}"
  export SSH_KEY="${dest}"
  if ssh-keygen -y -f "${dest}" >/dev/null 2>&1; then
    :
  elif ssh-keygen -p -P "" -N "" -m PEM -f "${dest}" >/dev/null 2>&1 \
    && ssh-keygen -y -f "${dest}" >/dev/null 2>&1; then
    chmod 600 "${dest}"
  else
    echo "worker: SSH_KEY copy at ${dest} is not a usable OpenSSH identity (libcrypto/format); git clone may fail" >&2
  fi
fi
exec "$@"
