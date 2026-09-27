"""Project secrets CRUD (ssh_key / login_password) for FastAPI (no Flask)."""
from __future__ import annotations

import json
import logging
import os
import re
import time
from pathlib import Path
from typing import Any, Optional

from executions_store import get_project_dir
from project_secret_crypto import ProjectSecretError, read_project_secret, write_project_secret
from ssh_key_material import (
    derive_openssh_public,
    generate_ed25519_openssh,
    validate_ssh_private_key,
)

logger = logging.getLogger(__name__)


class SecretsHttpError(Exception):
    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.message = message


def secrets_dir(project_id: str) -> Path:
    path = get_project_dir(project_id) / "secrets"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _truthy(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return bool(value)


def _apply_ssh_key_material(
    secret_data: dict[str, Any], body: dict[str, Any], *, generate: bool, require_private: bool
) -> None:
    if generate:
        if str(body.get("privateKey") or "").strip():
            raise SecretsHttpError(400, "Do not paste a private key when generate is true")
        generated = generate_ed25519_openssh(
            comment=str(body.get("comment") or "").strip(),
            passphrase=str(body.get("passphrase") or ""),
        )
        secret_data["privateKey"] = generated["privateKey"]
        secret_data["publicKey"] = generated["publicKey"]
        secret_data["fingerprint"] = generated["fingerprint"]
        secret_data["keyType"] = generated["keyType"]
        return
    private_key = str(body.get("privateKey") or "").strip()
    if not private_key:
        if require_private:
            raise SecretsHttpError(400, "Private key is required for SSH key secret")
        return
    is_valid, error_msg = validate_ssh_private_key(
        private_key,
        passphrase=str(body.get("passphrase") or secret_data.get("passphrase") or ""),
    )
    if not is_valid:
        raise SecretsHttpError(400, f"Invalid private key format: {error_msg}")
    secret_data["privateKey"] = private_key
    derived = derive_openssh_public(
        private_key,
        passphrase=str(body.get("passphrase") or secret_data.get("passphrase") or ""),
    )
    public_key = str(body.get("publicKey") or "").strip() or derived.get("publicKey") or ""
    if public_key:
        secret_data["publicKey"] = public_key
    if derived.get("fingerprint"):
        secret_data["fingerprint"] = derived["fingerprint"]
    if derived.get("keyType"):
        secret_data["keyType"] = derived["keyType"]


def slugify_secret_name(name: Any) -> str:
    if not name or not isinstance(name, str):
        raise ValueError("Secret name must be a non-empty string")
    safe_name = re.sub(r"[^a-zA-Z0-9_-]", "", name)
    if ".." in safe_name or "/" in safe_name or "\\" in safe_name:
        raise ValueError("Secret name contains invalid characters")
    if not safe_name:
        raise ValueError("Secret name cannot be empty after sanitization")
    if len(safe_name) > 100:
        raise ValueError("Secret name is too long (max 100 characters)")
    return safe_name


def get_secret_file_path(
    project_id: str, secret_name: str, secret_type: Optional[str] = None
) -> Path:
    safe_name = slugify_secret_name(secret_name)
    root = secrets_dir(project_id)
    if secret_type == "vault_password":
        vault = root / "vault"
        vault.mkdir(parents=True, exist_ok=True)
        return vault / "vault_pass"
    if secret_type == "git_auth":
        git_auth = root / "git_auth"
        git_auth.mkdir(parents=True, exist_ok=True)
        return git_auth / f"{safe_name}.json"
    ssh_keys = root / "ssh_keys"
    ssh_keys.mkdir(parents=True, exist_ok=True)
    return ssh_keys / f"{safe_name}.json"


def sanitize_secret(secret_data: dict[str, Any], fallback_name: Optional[str] = None) -> dict[str, Any]:
    if not isinstance(secret_data, dict):
        secret_data = {}
    name = secret_data.get("name") or fallback_name or ""
    secret_type = secret_data.get("type", "unknown")
    material: dict[str, Any] = {}
    if secret_type == "ssh_key":
        private_key = secret_data.get("privateKey") or ""
        passphrase = secret_data.get("passphrase") or ""
        material = {
            "privateKey": {"present": bool(private_key), "length": len(private_key) if private_key else 0},
            "passphrase": {"present": bool(passphrase), "length": len(passphrase) if passphrase else 0},
        }
    elif secret_type == "login_password":
        password = secret_data.get("password") or ""
        material = {
            "password": {"present": bool(password), "length": len(password) if password else 0},
        }
    sanitized: dict[str, Any] = {
        "name": name,
        "type": secret_type,
        "username": secret_data.get("username", ""),
        "description": secret_data.get("description", ""),
        "createdAt": secret_data.get("createdAt", ""),
        "updatedAt": secret_data.get("updatedAt", ""),
        "version": secret_data.get("version", 1),
        "material": material,
    }
    if secret_type == "ssh_key":
        public_key = str(secret_data.get("publicKey") or "").strip()
        if public_key:
            sanitized["publicKey"] = public_key
        fingerprint = str(secret_data.get("fingerprint") or "").strip()
        if fingerprint:
            sanitized["fingerprint"] = fingerprint
        key_type = str(secret_data.get("keyType") or "").strip()
        if key_type:
            sanitized["keyType"] = key_type
    return sanitized


def _meta_from_file(
    secret_data: dict[str, Any], fallback_name: str, default_type: str = "ssh_key"
) -> dict[str, Any]:
    return {
        "name": secret_data.get("name", fallback_name),
        "type": secret_data.get("type", default_type),
        "username": secret_data.get("username", ""),
        "description": secret_data.get("description", ""),
        "createdAt": secret_data.get("createdAt", secret_data.get("updatedAt", "")),
        "updatedAt": secret_data.get("updatedAt", ""),
        "version": secret_data.get("version", 1),
    }


def _iter_json_secrets(directory: Path, default_type: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    if not directory.exists():
        return rows
    for secret_file in directory.glob("*.json"):
        try:
            with open(secret_file, encoding="utf-8") as fh:
                secret_data = json.load(fh)
            if not isinstance(secret_data, dict):
                continue
            rows.append(_meta_from_file(secret_data, secret_file.stem, default_type))
        except (json.JSONDecodeError, OSError) as exc:
            logger.warning("Error reading secret file %s: %s", secret_file, exc)
    return rows


def _find_secret_file(project_id: str, secret_name: str) -> Path:
    root = secrets_dir(project_id)
    ssh_key_file = root / "ssh_keys" / f"{secret_name}.json"
    if ssh_key_file.exists():
        return ssh_key_file
    git_auth_file = root / "git_auth" / f"{secret_name}.json"
    if git_auth_file.exists():
        return git_auth_file
    if secret_name == "vault_pass":
        vault_file = root / "vault" / "vault_pass"
        if vault_file.exists():
            return vault_file
    return get_secret_file_path(project_id, secret_name)


def list_secrets(project_id: str) -> dict[str, Any]:
    root = secrets_dir(project_id)
    ssh_keys_dir = root / "ssh_keys"
    ssh_keys_dir.mkdir(parents=True, exist_ok=True)
    git_auth_dir = root / "git_auth"
    git_auth_dir.mkdir(parents=True, exist_ok=True)
    vault_dir = root / "vault"
    vault_dir.mkdir(parents=True, exist_ok=True)
    secrets: list[dict[str, Any]] = []
    seen: set[str] = set()
    for row in _iter_json_secrets(ssh_keys_dir, "ssh_key") + _iter_json_secrets(git_auth_dir, "git_auth"):
        name = row.get("name")
        if name in seen:
            continue
        seen.add(str(name))
        secrets.append(row)
    vault_pass_file = vault_dir / "vault_pass"
    if vault_pass_file.exists() and "vault_pass" not in seen:
        secrets.append(
            {
                "name": "vault_pass",
                "type": "vault_password",
                "username": "",
                "description": "Vault password",
                "createdAt": "",
                "updatedAt": "",
                "version": 1,
            }
        )
    secrets.sort(key=lambda row: str(row.get("name") or "").lower())
    return {"success": True, "secrets": secrets}


def list_secrets_meta(project_id: str) -> dict[str, Any]:
    root = secrets_dir(project_id)
    ssh_keys_dir = root / "ssh_keys"
    ssh_keys_dir.mkdir(parents=True, exist_ok=True)
    git_auth_dir = root / "git_auth"
    git_auth_dir.mkdir(parents=True, exist_ok=True)
    secrets: list[dict[str, Any]] = []
    seen: set[str] = set()
    for directory, default_type in ((ssh_keys_dir, "ssh_key"), (git_auth_dir, "git_auth")):
        for secret_file in directory.glob("*.json"):
            try:
                with open(secret_file, encoding="utf-8") as fh:
                    secret_data = json.load(fh)
                name = secret_data.get("name", secret_file.stem)
                if name in seen:
                    continue
                seen.add(name)
                secrets.append(
                    {
                        "name": name,
                        "type": secret_data.get("type", default_type),
                        "username": secret_data.get("username", ""),
                    }
                )
            except (json.JSONDecodeError, OSError) as exc:
                logger.warning("Error reading secret file %s: %s", secret_file, exc)
    secrets.sort(key=lambda row: str(row.get("name") or "").lower())
    return {"success": True, "secrets": secrets}


def get_secret(project_id: str, secret_name: str) -> dict[str, Any]:
    try:
        secret_file = _find_secret_file(project_id, secret_name)
    except ValueError as exc:
        raise SecretsHttpError(400, str(exc)) from exc
    if secret_name == "vault_pass" and secret_file.name == "vault_pass" and secret_file.exists():
        with open(secret_file, encoding="utf-8") as fh:
            vault_pass = fh.read().strip()
        return {
            "success": True,
            "secret": {
                "name": "vault_pass",
                "type": "vault_password",
                "username": "",
                "description": "Vault password",
                "createdAt": "",
                "updatedAt": "",
                "version": 1,
                "material": {
                    "password": {"present": bool(vault_pass), "length": len(vault_pass) if vault_pass else 0}
                },
            },
        }
    if not secret_file.exists():
        raise SecretsHttpError(404, "Secret not found")
    if secret_file.suffix == ".json":
        try:
            secret_data = read_project_secret(secret_file)
        except ProjectSecretError as exc:
            raise SecretsHttpError(400, str(exc)) from exc
    else:
        with open(secret_file, encoding="utf-8") as fh:
            content = fh.read().strip()
        secret_data = {"name": secret_file.stem, "type": "vault_password", "content": content}
    return {
        "success": True,
        "secret": sanitize_secret(secret_data, fallback_name=secret_name),
    }


def create_secret(project_id: str, body: dict[str, Any]) -> dict[str, Any]:
    secret_name = str(body.get("name") or "").strip()
    if not secret_name:
        raise SecretsHttpError(400, "Secret name is required")
    try:
        safe_name = slugify_secret_name(secret_name)
    except ValueError as exc:
        raise SecretsHttpError(400, str(exc)) from exc
    secret_type = str(body.get("type") or "").strip()
    if secret_type not in ("ssh_key", "login_password"):
        raise SecretsHttpError(400, 'Invalid secret type. Must be "ssh_key" or "login_password"')
    secret_file = get_secret_file_path(project_id, safe_name, secret_type=secret_type)
    if secret_file.exists():
        raise SecretsHttpError(409, "Secret with this name already exists")
    generate = _truthy(body.get("generate"))
    if secret_type == "login_password" and generate:
        raise SecretsHttpError(400, "generate is only valid for SSH key secrets")
    current_time = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    secret_data: dict[str, Any] = {
        "version": 1,
        "type": secret_type,
        "name": safe_name,
        "username": str(body.get("username") or "").strip(),
        "description": str(body.get("description") or "").strip(),
        "createdAt": current_time,
        "updatedAt": current_time,
    }
    if secret_type == "ssh_key":
        _apply_ssh_key_material(secret_data, body, generate=generate, require_private=True)
        if body.get("passphrase"):
            secret_data["passphrase"] = str(body.get("passphrase") or "").strip()
    else:
        password = str(body.get("password") or "").strip()
        if not password:
            raise SecretsHttpError(400, "Password is required for login/password secret")
        secret_data["password"] = password
    write_project_secret(secret_file, secret_data)
    secret = sanitize_secret(secret_data, fallback_name=safe_name)
    if generate:
        secret = dict(secret)
        secret["privateKey"] = str(secret_data.get("privateKey") or "")
    return {
        "success": True,
        "secret": secret,
        "message": "Secret created successfully",
    }


def update_secret(project_id: str, secret_name: str, body: dict[str, Any]) -> dict[str, Any]:
    try:
        secret_file = _find_secret_file(project_id, secret_name)
    except ValueError as exc:
        raise SecretsHttpError(400, str(exc)) from exc
    if not secret_file.exists():
        raise SecretsHttpError(404, "Secret not found")
    if secret_file.suffix == ".json":
        try:
            existing = read_project_secret(secret_file)
        except ProjectSecretError as exc:
            raise SecretsHttpError(400, str(exc)) from exc
    else:
        with open(secret_file, encoding="utf-8") as fh:
            content = fh.read().strip()
        existing = {"name": secret_file.stem, "type": "vault_password", "content": content}
    if "username" in body:
        existing["username"] = str(body.get("username") or "").strip()
    if "description" in body:
        existing["description"] = str(body.get("description") or "").strip()
    if "createdAt" not in existing:
        existing["createdAt"] = existing.get(
            "updatedAt", time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        )
    if existing.get("type") == "ssh_key":
        generate = _truthy(body.get("generate"))
        if generate or str(body.get("privateKey") or "").strip():
            _apply_ssh_key_material(
                existing, body, generate=generate, require_private=False
            )
        if "passphrase" in body and str(body.get("passphrase") or "").strip():
            existing["passphrase"] = str(body.get("passphrase") or "").strip()
    elif existing.get("type") == "login_password":
        if "password" in body and str(body.get("password") or "").strip():
            existing["password"] = str(body.get("password") or "").strip()
    existing["updatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    if secret_file.suffix == ".json":
        write_project_secret(secret_file, existing)
    elif "password" in body:
        with open(secret_file, "w", encoding="utf-8") as fh:
            fh.write(str(body.get("password") or "").strip())
    elif "content" in body:
        with open(secret_file, "w", encoding="utf-8") as fh:
            fh.write(str(body.get("content") or "").strip())
    os.chmod(secret_file, 0o600)
    secret = sanitize_secret(existing, fallback_name=secret_name)
    if existing.get("type") == "ssh_key" and _truthy(body.get("generate")):
        secret = dict(secret)
        secret["privateKey"] = str(existing.get("privateKey") or "")
    return {
        "success": True,
        "secret": secret,
        "message": "Secret updated successfully",
    }


def export_secret(project_id: str, secret_name: str) -> dict[str, Any]:
    try:
        secret_file = _find_secret_file(project_id, secret_name)
    except ValueError as exc:
        raise SecretsHttpError(400, str(exc)) from exc
    if not secret_file.exists() or secret_file.suffix != ".json":
        raise SecretsHttpError(404, "Secret not found")
    try:
        secret_data = read_project_secret(secret_file)
    except ProjectSecretError as exc:
        raise SecretsHttpError(400, str(exc)) from exc
    if not isinstance(secret_data, dict):
        raise SecretsHttpError(400, "Secret file is invalid")
    secret_type = str(secret_data.get("type") or "ssh_key")
    if secret_type != "ssh_key":
        raise SecretsHttpError(400, "Only SSH key secrets can be exported")
    private_key = str(secret_data.get("privateKey") or "")
    if not private_key.strip():
        raise SecretsHttpError(404, "Private key is not stored")
    public_key = str(secret_data.get("publicKey") or "").strip()
    if not public_key:
        derived = derive_openssh_public(
            private_key, passphrase=str(secret_data.get("passphrase") or "")
        )
        public_key = str(derived.get("publicKey") or "")
        if public_key:
            secret_data["publicKey"] = public_key
            if derived.get("fingerprint"):
                secret_data["fingerprint"] = derived["fingerprint"]
            write_project_secret(secret_file, secret_data)
    return {
        "success": True,
        "name": secret_data.get("name") or secret_name,
        "type": "ssh_key",
        "publicKey": public_key,
        "privateKey": private_key,
    }


def delete_secret(project_id: str, secret_name: str) -> dict[str, Any]:
    try:
        secret_file = _find_secret_file(project_id, secret_name)
    except ValueError as exc:
        raise SecretsHttpError(400, str(exc)) from exc
    if not secret_file.exists():
        raise SecretsHttpError(404, "Secret not found")
    secret_file.unlink()
    return {"success": True, "message": "Secret deleted successfully"}
