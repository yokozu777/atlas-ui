"""Vault file get/encrypt/decrypt/save for FastAPI (no Flask)."""
from __future__ import annotations

from pathlib import Path
from typing import Any, Optional

from executions_store import get_project_dir
from vault_http import (
    VaultHttpError,
    decrypt_content,
    encrypt_content,
    get_key_password_by_key_id,
    list_vault_keys,
    load_vaults,
    vaults_file,
)
from vault_utils import (
    ansible_vault_decrypt,
    ansible_vault_encrypt,
    is_ansible_vault_encrypted,
    parse_vault_id_from_header,
)


class VaultFilesHttpError(Exception):
    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.message = message


def _save_vault_file_key(project_id: str, path_param: str, key_id: str) -> None:
    mapping_path = vaults_file(project_id).parent / "vault_file_keys.json"
    mapping: dict[str, Any] = {}
    if mapping_path.exists():
        try:
            import json

            data = json.loads(mapping_path.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                mapping = data
        except (OSError, ValueError):
            mapping = {}
    mapping[path_param] = key_id
    mapping_path.parent.mkdir(parents=True, exist_ok=True)
    import json

    mapping_path.write_text(json.dumps(mapping, indent=2, ensure_ascii=False), encoding="utf-8")


def resolve_vault_file_path(project_id: str, path_param: str) -> Path:
    if not path_param or ".." in path_param:
        raise VaultFilesHttpError(400, "Invalid path")
    cleaned = path_param.replace("\\", "/").strip("/")
    parts = cleaned.split("/")
    if "group_vars" not in parts and "host_vars" not in parts:
        raise VaultFilesHttpError(400, "Path must be within group_vars or host_vars")
    repo_dir = (get_project_dir(project_id) / "repo").resolve()
    full_path = (repo_dir / cleaned).resolve()
    try:
        full_path.relative_to(repo_dir)
    except ValueError as exc:
        raise VaultFilesHttpError(400, "Path outside repo") from exc
    return full_path


def get_vault_file(
    project_id: str,
    path_param: str,
    vault_id: Optional[str] = None,
    key_id: Optional[str] = None,
) -> dict[str, Any]:
    full_path = resolve_vault_file_path(project_id, path_param)
    if not full_path.exists() or not full_path.is_file():
        raise VaultFilesHttpError(404, "File not found")
    content = full_path.read_text(encoding="utf-8", errors="replace")
    resp: dict[str, Any] = {"success": True, "content": content, "path": path_param}
    if key_id and content and is_ansible_vault_encrypted(content):
        password = get_key_password_by_key_id(project_id, key_id)
        if not password:
            raise VaultFilesHttpError(404, "Key not found")
        vault_id_header = parse_vault_id_from_header(content)
        ok, decrypted = ansible_vault_decrypt(content, password, vault_id=vault_id_header)
        if not ok:
            raise VaultFilesHttpError(500, decrypted or "Failed to decrypt")
        resp["content"] = decrypted
        resp["keyId"] = key_id
        return resp
    if vault_id:
        try:
            decrypted = decrypt_content(project_id, content, vault_id)
        except VaultHttpError as exc:
            raise VaultFilesHttpError(exc.status_code, exc.message) from exc
        if is_ansible_vault_encrypted(content):
            resp["content"] = decrypted
            resp["encrypted"] = True
            resp["vaultId"] = vault_id
        return resp
    if is_ansible_vault_encrypted(content):
        keys = list_vault_keys(project_id).get("keys") or []
        return {
            "success": True,
            "encrypted": True,
            "vaultIdRequired": True,
            "vaults": load_vaults(project_id),
            "keys": keys,
            "path": path_param,
            "content": content,
        }
    return resp


def encrypt_vault_file(project_id: str, body: dict[str, Any]) -> dict[str, Any]:
    content = body.get("content") or ""
    key_id = body.get("keyId") or body.get("key_id")
    vault_label = (body.get("vaultId") or body.get("vault_id") or "").strip() or None
    if not key_id:
        raise VaultFilesHttpError(400, "keyId required")
    if not vault_label:
        raise VaultFilesHttpError(400, "vaultId (ansible-vault label) required")
    password = get_key_password_by_key_id(project_id, str(key_id))
    if not password:
        raise VaultFilesHttpError(404, "Key not found")
    ok, result = ansible_vault_encrypt(str(content), password, vault_id=vault_label)
    if not ok:
        raise VaultFilesHttpError(400, result or "Encryption failed")
    return {"success": True, "content": result}


def decrypt_vault_file(project_id: str, body: dict[str, Any]) -> dict[str, Any]:
    content = str(body.get("content") or "")
    key_id = body.get("keyId") or body.get("key_id")
    if not key_id:
        raise VaultFilesHttpError(400, "keyId required")
    if not content or not is_ansible_vault_encrypted(content):
        return {"success": True, "content": content}
    password = get_key_password_by_key_id(project_id, str(key_id))
    if not password:
        raise VaultFilesHttpError(404, "Key not found")
    vault_id_header = parse_vault_id_from_header(content)
    ok, result = ansible_vault_decrypt(content, password, vault_id=vault_id_header)
    if not ok:
        raise VaultFilesHttpError(400, result or "Decryption failed")
    return {"success": True, "content": result}


def save_vault_file(project_id: str, body: dict[str, Any]) -> dict[str, Any]:
    path_param = str(body.get("path") or "")
    content = str(body.get("content") or "")
    vault_id = body.get("vaultId") or body.get("vault_id")
    key_id = body.get("keyId") or body.get("key_id")
    full_path = resolve_vault_file_path(project_id, path_param)
    if key_id and vault_id:
        password = get_key_password_by_key_id(project_id, str(key_id))
        if not password:
            raise VaultFilesHttpError(404, "Key not found")
        ok, encrypted = ansible_vault_encrypt(content, password, vault_id=str(vault_id))
        if not ok:
            raise VaultFilesHttpError(400, encrypted or "Encryption failed")
        content = encrypted
    elif vault_id:
        try:
            content = encrypt_content(project_id, content, str(vault_id))
        except VaultHttpError as exc:
            raise VaultFilesHttpError(exc.status_code, exc.message) from exc
    if key_id:
        _save_vault_file_key(project_id, path_param, str(key_id))
    full_path.parent.mkdir(parents=True, exist_ok=True)
    full_path.write_text(content, encoding="utf-8")
    return {"success": True, "path": path_param}
