"""AES-GCM at rest for ansible-vault key password files."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

from secret_encryption import get_encryption


class VaultPassError(Exception):
    """Vault password file encrypt/decrypt failed."""


def write_vault_pass_file(pass_file: Path, password: str) -> None:
    path = Path(pass_file)
    path.parent.mkdir(parents=True, exist_ok=True)
    encrypted = {
        "encryptedAtRest": True,
        "password": get_encryption().encrypt(password),
    }
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(json.dumps(encrypted, indent=2, ensure_ascii=False), encoding="utf-8")
    tmp.chmod(0o600)
    tmp.replace(path)
    path.chmod(0o600)


def read_vault_pass_file(pass_file: Path) -> Optional[str]:
    path = Path(pass_file)
    if not path.is_file():
        return None
    try:
        raw = path.read_text(encoding="utf-8").strip()
    except OSError as exc:
        raise VaultPassError(f"Failed to read vault password file: {exc}") from exc
    if not raw:
        return None
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        write_vault_pass_file(path, raw)
        return raw
    if not isinstance(data, dict) or data.get("encryptedAtRest") is not True:
        write_vault_pass_file(path, raw)
        return raw
    try:
        return get_encryption().decrypt(str(data.get("password") or ""))
    except Exception as exc:
        raise VaultPassError(
            "Failed to decrypt vault password. "
            "Set GLOBAL_SECRETS_ENCRYPTION_KEY or data/auth/encryption_key."
        ) from exc
