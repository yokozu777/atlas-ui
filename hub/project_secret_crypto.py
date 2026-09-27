"""AES-GCM at rest for project secret JSON (same fields as global secrets)."""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Optional

from secret_encryption import get_encryption

SECRET_MATERIAL_FIELDS = ("privateKey", "passphrase", "token", "password")


class ProjectSecretError(Exception):
    """Project secret encrypt/decrypt or JSON layout failed."""


def _has_material(data: dict[str, Any]) -> bool:
    return any(data.get(field) for field in SECRET_MATERIAL_FIELDS)


def decrypt_project_secret_data(
    data: dict[str, Any], *, encryption: Any = None
) -> tuple[dict[str, Any], bool]:
    """Return (plaintext dict, needs_rewrite). Leftover plaintext is not decrypted."""
    out = dict(data)
    if out.get("encryptedAtRest") is True:
        enc = encryption or get_encryption()
        try:
            for field in SECRET_MATERIAL_FIELDS:
                value = out.get(field)
                if value:
                    out[field] = enc.decrypt(str(value))
        except Exception as exc:
            raise ProjectSecretError(f"Failed to decrypt project secret: {exc}") from exc
        return out, False
    return out, _has_material(out)


def encrypt_project_secret_data(
    data: dict[str, Any], *, encryption: Any = None
) -> dict[str, Any]:
    enc = encryption or get_encryption()
    out = dict(data)
    try:
        for field in SECRET_MATERIAL_FIELDS:
            value = out.get(field)
            if value:
                out[field] = enc.encrypt(str(value))
    except Exception as exc:
        raise ProjectSecretError(f"Failed to encrypt project secret: {exc}") from exc
    out["encryptedAtRest"] = True
    return out


def write_project_secret(path: Path, data: dict[str, Any]) -> None:
    path = Path(path)
    encrypted = encrypt_project_secret_data(data)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(json.dumps(encrypted, indent=2, ensure_ascii=False), encoding="utf-8")
    os.chmod(tmp, 0o600)
    tmp.replace(path)
    os.chmod(path, 0o600)


def read_project_secret(path: Path) -> dict[str, Any]:
    path = Path(path)
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ProjectSecretError(f"Failed to read project secret {path.name}") from exc
    if not isinstance(raw, dict):
        raise ProjectSecretError("Secret file is invalid")
    plain, needs_rewrite = decrypt_project_secret_data(raw)
    if needs_rewrite:
        write_project_secret(path, plain)
    return plain
