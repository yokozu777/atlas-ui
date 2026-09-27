"""HTTP helpers for GlobalSecretsManager (no Flask)."""
from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any, Optional

from atlas_operator_ssh import describe_clusterctl_ssh
from clusterctl_ssh import (
    ClusterctlSshError,
    clear_clusterctl_ssh_if_matches,
    load_clusterctl_ssh_secret_id,
    save_clusterctl_ssh_secret_id,
)
from global_secrets_manager import GlobalSecretError, GlobalSecretsManager
from ssh_key_material import derive_openssh_public, generate_ed25519_openssh
from secret_encryption import (
    generate_and_save_encryption_key,
    get_encryption_key_file_path,
    load_encryption_key,
    save_encryption_key,
)
import secret_encryption

logger = logging.getLogger(__name__)

MATERIAL_FIELDS = ("privateKey", "passphrase", "token", "password")
OPTIONAL_FIELDS = ("username", "publicKey", "fingerprint", "keyType", "comment", "registry")
CREATE_BODY_SKIP = {
    "name",
    "type",
    "description",
    "metadata",
    "generate",
    "useAsClusterctlSsh",
}


class GlobalSecretsHttpError(Exception):
    def __init__(
        self,
        status_code: int,
        message: str,
        error_code: Optional[str] = None,
        extra: Optional[dict[str, Any]] = None,
    ):
        super().__init__(message)
        self.status_code = status_code
        self.message = message
        self.error_code = error_code
        self.extra = extra or {}


def manager(data_dir: Path) -> GlobalSecretsManager:
    return GlobalSecretsManager(Path(data_dir))


def _truthy(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return bool(value)


def _with_one_time_generated_private_key(
    secret: dict[str, Any], secret_data: dict[str, Any], *, generate: bool
) -> dict[str, Any]:
    """Include the generated private key once in create/rotate responses."""
    if not generate:
        return secret
    private_key = str(secret_data.get("privateKey") or "")
    if not private_key.strip():
        return secret
    out = dict(secret)
    out["privateKey"] = private_key
    return out


def _apply_generated_or_derived_ssh(secret_data: dict[str, Any], *, generate: bool) -> None:
    if generate:
        if str(secret_data.get("privateKey") or "").strip():
            raise GlobalSecretsHttpError(
                400, "Do not paste a private key when generate is true"
            )
        passphrase = str(secret_data.get("passphrase") or "")
        generated = generate_ed25519_openssh(
            comment=str(secret_data.get("comment") or ""),
            passphrase=passphrase,
        )
        secret_data.update(generated)
        if not passphrase.strip():
            secret_data["passphrase"] = ""
        return
    private_key = str(secret_data.get("privateKey") or "")
    if not private_key.strip() or str(secret_data.get("publicKey") or "").strip():
        return
    derived = derive_openssh_public(
        private_key, passphrase=str(secret_data.get("passphrase") or "")
    )
    for key, value in derived.items():
        secret_data.setdefault(key, value)


def _apply_clusterctl_flag(
    data_dir: Path, secret_id: str, body: dict[str, Any], *, created: bool
) -> None:
    if "useAsClusterctlSsh" not in body:
        return
    try:
        if _truthy(body.get("useAsClusterctlSsh")):
            save_clusterctl_ssh_secret_id(data_dir, secret_id)
        elif not created:
            current = load_clusterctl_ssh_secret_id(data_dir)
            if current == secret_id:
                save_clusterctl_ssh_secret_id(data_dir, None)
    except ClusterctlSshError as exc:
        raise GlobalSecretsHttpError(exc.status_code, exc.message) from exc


def list_global_secrets(
    data_dir: Path, secret_type: Optional[str] = None, search: Optional[str] = None
) -> dict[str, Any]:
    secrets = manager(data_dir).list_secrets(secret_type=secret_type or None, search=search or None)
    return {"success": True, "secrets": secrets}


def export_global_secret(data_dir: Path, secret_id: str) -> dict[str, Any]:
    try:
        secret = manager(data_dir).get_secret(secret_id, include_material=True)
    except GlobalSecretError as exc:
        raise GlobalSecretsHttpError(400, str(exc)) from exc
    if not secret:
        raise GlobalSecretsHttpError(404, "Secret not found")
    secret_type = str(secret.get("type") or "")
    if secret_type != "git_ssh_key":
        raise GlobalSecretsHttpError(400, "Only SSH key secrets can be exported")
    private_key = str(secret.get("privateKey") or "")
    if not private_key.strip():
        raise GlobalSecretsHttpError(404, "Private key is not stored")
    public_key = str(secret.get("publicKey") or "").strip()
    metadata = secret.get("metadata") if isinstance(secret.get("metadata"), dict) else {}
    if not public_key:
        public_key = str(metadata.get("publicKey") or "").strip()
    if not public_key:
        derived = derive_openssh_public(
            private_key, passphrase=str(secret.get("passphrase") or "")
        )
        public_key = str(derived.get("publicKey") or "")
    return {
        "success": True,
        "id": secret.get("id") or secret_id,
        "name": secret.get("name") or "",
        "type": secret_type,
        "publicKey": public_key,
        "privateKey": private_key,
    }


def get_global_secret(data_dir: Path, secret_id: str) -> dict[str, Any]:
    try:
        secret = manager(data_dir).get_secret(secret_id, include_material=False)
    except GlobalSecretError as exc:
        raise GlobalSecretsHttpError(400, str(exc)) from exc
    if not secret:
        raise GlobalSecretsHttpError(404, "Secret not found")
    return {"success": True, "secret": secret}


def create_global_secret(data_dir: Path, body: dict[str, Any]) -> tuple[dict[str, Any], int]:
    data = dict(body or {})
    name = str(data.get("name") or "").strip()
    secret_type = str(data.get("type") or "").strip()
    description = str(data.get("description") or "").strip() or None
    if not name:
        raise GlobalSecretsHttpError(400, "Secret name is required")
    if not secret_type:
        raise GlobalSecretsHttpError(400, "Secret type is required")
    secret_data = {
        key: value
        for key, value in data.items()
        if key not in CREATE_BODY_SKIP
    }
    metadata = data.get("metadata")
    if isinstance(metadata, dict):
        for key, value in metadata.items():
            if value:
                secret_data[key] = value
    generate = _truthy(data.get("generate"))
    if secret_type == "git_ssh_key":
        _apply_generated_or_derived_ssh(secret_data, generate=generate)
    try:
        secret = manager(data_dir).create_secret(
            name=name,
            secret_type=secret_type,
            data=secret_data,
            description=description,
        )
    except GlobalSecretError as exc:
        raise GlobalSecretsHttpError(400, str(exc)) from exc
    _apply_clusterctl_flag(data_dir, str(secret.get("id") or ""), data, created=True)
    secret = _with_one_time_generated_private_key(
        secret, secret_data, generate=generate
    )
    return {"success": True, "secret": secret, "message": "Secret created successfully"}, 201


def update_global_secret(data_dir: Path, secret_id: str, body: dict[str, Any]) -> dict[str, Any]:
    data = dict(body or {})
    secret_material: dict[str, Any] = {}
    for field in MATERIAL_FIELDS + OPTIONAL_FIELDS:
        if field in data:
            secret_material[field] = data[field]
    metadata = data.get("metadata") if isinstance(data.get("metadata"), dict) else None
    if isinstance(metadata, dict):
        for key, value in metadata.items():
            if value and key not in secret_material:
                secret_material[key] = value
    generate = _truthy(data.get("generate"))
    if generate:
        existing = manager(data_dir).get_secret(secret_id, include_material=False)
        if not existing:
            raise GlobalSecretsHttpError(404, "Secret not found")
        if str(existing.get("type") or "") != "git_ssh_key":
            raise GlobalSecretsHttpError(400, "generate is only valid for SSH keys")
        _apply_generated_or_derived_ssh(secret_material, generate=True)
    elif str(secret_material.get("privateKey") or "").strip():
        _apply_generated_or_derived_ssh(secret_material, generate=False)
    try:
        secret = manager(data_dir).update_secret(
            secret_id=secret_id,
            name=data.get("name"),
            description=data.get("description"),
            metadata=metadata,
            secret_material=secret_material or None,
        )
    except GlobalSecretError as exc:
        message = str(exc)
        if "not found" in message.lower():
            raise GlobalSecretsHttpError(404, message) from exc
        raise GlobalSecretsHttpError(400, message) from exc
    _apply_clusterctl_flag(data_dir, secret_id, data, created=False)
    secret = _with_one_time_generated_private_key(
        secret, secret_material, generate=generate
    )
    return {"success": True, "secret": secret, "message": "Secret updated successfully"}


def delete_global_secret(data_dir: Path, secret_id: str) -> dict[str, Any]:
    try:
        deleted = manager(data_dir).delete_secret(secret_id)
    except GlobalSecretError as exc:
        raise GlobalSecretsHttpError(400, str(exc)) from exc
    if not deleted:
        raise GlobalSecretsHttpError(404, "Secret not found")
    clear_clusterctl_ssh_if_matches(data_dir, secret_id)
    return {"success": True, "message": "Secret deleted successfully"}


def get_clusterctl_ssh(data_dir: Path) -> dict[str, Any]:
    payload = describe_clusterctl_ssh(data_dir)
    payload["success"] = True
    return payload


def put_clusterctl_ssh(data_dir: Path, body: dict[str, Any]) -> dict[str, Any]:
    raw = (body or {}).get("sshSecretId")
    secret_id = None if raw is None else str(raw).strip() or None
    try:
        saved = save_clusterctl_ssh_secret_id(data_dir, secret_id)
    except ClusterctlSshError as exc:
        raise GlobalSecretsHttpError(exc.status_code, exc.message) from exc
    return {"success": True, "sshSecretId": saved}


def global_secret_options(data_dir: Path, purpose: Optional[str] = None) -> dict[str, Any]:
    options = manager(data_dir).get_secret_options(purpose=purpose or None)
    return {"success": True, "options": options}


def global_secrets_permissions() -> dict[str, Any]:
    return {"success": True, "permissions": {"read": True, "write": True}}


def encryption_key_status(data_dir: Path) -> dict[str, Any]:
    env_key = os.environ.get("GLOBAL_SECRETS_ENCRYPTION_KEY")
    key_file = get_encryption_key_file_path(data_dir)
    file_exists = key_file.exists()
    source = "environment" if env_key else ("file" if file_exists else "none")
    return {
        "success": True,
        "key": {
            "exists": bool(env_key) or bool(file_exists),
            "source": source,
            "masked": None,
            "filePath": None,
        },
    }


def replace_encryption_key(data_dir: Path, key: str) -> dict[str, Any]:
    new_key = (key or "").strip()
    if not new_key:
        raise GlobalSecretsHttpError(400, "Encryption key is required")
    if len(new_key) < 32:
        raise GlobalSecretsHttpError(400, "Encryption key must be at least 32 characters long")
    existing = load_encryption_key(data_dir)
    if existing:
        secrets = manager(data_dir).list_secrets()
        if secrets:
            raise GlobalSecretsHttpError(
                400,
                "Cannot change encryption key: existing secrets found",
                error_code="EXISTING_SECRETS",
                extra={
                    "details": {
                        "secretCount": len(secrets),
                        "message": (
                            f"There are {len(secrets)} existing secret(s). "
                            "Changing the encryption key will make them undecryptable."
                        ),
                    }
                },
            )
    if not save_encryption_key(new_key, data_dir):
        raise GlobalSecretsHttpError(500, "Failed to save encryption key")
    secret_encryption._encryption_instance = None
    return {"success": True, "message": "Encryption key updated successfully"}


def create_encryption_key(data_dir: Path) -> dict[str, Any]:
    existing = load_encryption_key(data_dir)
    if existing:
        raise GlobalSecretsHttpError(
            400,
            "Encryption key already exists",
            error_code="KEY_EXISTS",
        )
    generate_and_save_encryption_key(data_dir)
    secret_encryption._encryption_instance = None
    return {"success": True, "message": "Encryption key created successfully"}
