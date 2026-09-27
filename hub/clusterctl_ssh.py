"""System-default clusterctl SSH key (Ansible / docker executor)."""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Optional

from global_secrets_manager import GlobalSecretError, GlobalSecretsManager

CLUSTERCTL_SSH_FILENAME = "clusterctl.json"
ALLOWED_TYPES = frozenset({"git_ssh_key"})


class ClusterctlSshError(Exception):
    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.message = message


def clusterctl_ssh_path(data_dir: Path) -> Path:
    return Path(data_dir) / "global" / CLUSTERCTL_SSH_FILENAME


def load_clusterctl_ssh_secret_id(data_dir: Path) -> Optional[str]:
    path = clusterctl_ssh_path(data_dir)
    if not path.is_file():
        return None
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(raw, dict):
        return None
    value = str(raw.get("sshSecretId") or "").strip()
    return value or None


def save_clusterctl_ssh_secret_id(
    data_dir: Path, secret_id: Optional[str]
) -> Optional[str]:
    path = clusterctl_ssh_path(data_dir)
    path.parent.mkdir(parents=True, exist_ok=True)
    normalized = str(secret_id or "").strip() or None
    if normalized is None:
        if path.exists():
            try:
                path.unlink()
            except OSError:
                path.write_text("{}\n", encoding="utf-8")
                os.chmod(path, 0o600)
        return None
    manager = GlobalSecretsManager(data_dir)
    try:
        secret = manager.get_secret(normalized, include_material=False)
    except GlobalSecretError as exc:
        raise ClusterctlSshError(400, str(exc)) from exc
    if not secret:
        raise ClusterctlSshError(400, f"secret {normalized} not found")
    secret_type = str(secret.get("type") or "")
    if secret_type not in ALLOWED_TYPES:
        raise ClusterctlSshError(
            400,
            f"secret {normalized} type {secret_type!r} is not an SSH key",
        )
    payload: dict[str, Any] = {"sshSecretId": normalized}
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    os.chmod(path, 0o600)
    return normalized


def clear_clusterctl_ssh_if_matches(data_dir: Path, secret_id: str) -> None:
    current = load_clusterctl_ssh_secret_id(data_dir)
    if current and current == str(secret_id).strip():
        save_clusterctl_ssh_secret_id(data_dir, None)
