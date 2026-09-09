"""HTTP helpers for GlobalSecretsManager (no Flask)."""
from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any, Optional

from global_secrets_manager import GlobalSecretError, GlobalSecretsManager
from secret_encryption import (
    generate_and_save_encryption_key,
    get_encryption_key_file_path,
    load_encryption_key,
    save_encryption_key,
)
import secret_encryption

logger = logging.getLogger(__name__)

MATERIAL_FIELDS = ("privateKey", "passphrase", "token", "password")
OPTIONAL_FIELDS = ("username", "publicKey", "fingerprint")


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


def list_global_secrets(
    data_dir: Path, secret_type: Optional[str] = None, search: Optional[str] = None
) -> dict[str, Any]:
    secrets = manager(data_dir).list_secrets(secret_type=secret_type or None, search=search or None)
    return {"success": True, "secrets": secrets}


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
        if key not in {"name", "type", "description", "metadata"}
    }
    metadata = data.get("metadata")
    if isinstance(metadata, dict):
        for key, value in metadata.items():
            if value:
                secret_data[key] = value
    try:
        secret = manager(data_dir).create_secret(
            name=name,
            secret_type=secret_type,
            data=secret_data,
            description=description,
        )
    except GlobalSecretError as exc:
        raise GlobalSecretsHttpError(400, str(exc)) from exc
    return {"success": True, "secret": secret, "message": "Secret created successfully"}, 201


def update_global_secret(data_dir: Path, secret_id: str, body: dict[str, Any]) -> dict[str, Any]:
    data = dict(body or {})
    secret_material: dict[str, Any] = {}
    for field in MATERIAL_FIELDS + OPTIONAL_FIELDS:
        if field in data:
            secret_material[field] = data[field]
    try:
        secret = manager(data_dir).update_secret(
            secret_id=secret_id,
            name=data.get("name"),
            description=data.get("description"),
            metadata=data.get("metadata") if isinstance(data.get("metadata"), dict) else None,
            secret_material=secret_material or None,
        )
    except GlobalSecretError as exc:
        message = str(exc)
        if "not found" in message.lower():
            raise GlobalSecretsHttpError(404, message) from exc
        raise GlobalSecretsHttpError(400, message) from exc
    return {"success": True, "secret": secret, "message": "Secret updated successfully"}


def delete_global_secret(data_dir: Path, secret_id: str) -> dict[str, Any]:
    try:
        deleted = manager(data_dir).delete_secret(secret_id)
    except GlobalSecretError as exc:
        raise GlobalSecretsHttpError(400, str(exc)) from exc
    if not deleted:
        raise GlobalSecretsHttpError(404, "Secret not found")
    return {"success": True, "message": "Secret deleted successfully"}


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
