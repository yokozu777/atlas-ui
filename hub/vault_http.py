"""Vault keys and vaults CRUD plus snippet encrypt/decrypt (no Flask)."""
from __future__ import annotations

import json
import logging
import os
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from executions_store import get_project_dir
from vault_utils import (
    ansible_vault_decrypt,
    ansible_vault_encrypt,
    is_ansible_vault_encrypted,
    parse_vault_id_from_header,
)

logger = logging.getLogger(__name__)


class VaultHttpError(Exception):
    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.message = message


def secrets_dir(project_id: str) -> Path:
    path = get_project_dir(project_id) / "secrets"
    path.mkdir(parents=True, exist_ok=True)
    return path


def vault_dir(project_id: str) -> Path:
    path = secrets_dir(project_id) / "vault"
    path.mkdir(parents=True, exist_ok=True)
    return path


def vault_keys_dir(project_id: str) -> Path:
    path = secrets_dir(project_id) / "vault_keys"
    path.mkdir(parents=True, exist_ok=True)
    return path


def vaults_file(project_id: str) -> Path:
    return vault_dir(project_id) / "vaults.json"


def _load_vault_file_keys(project_id: str) -> dict[str, Any]:
    path = vaults_file(project_id).parent / "vault_file_keys.json"
    if not path.exists():
        return {}
    try:
        with open(path, encoding="utf-8") as fh:
            data = json.load(fh)
        return data if isinstance(data, dict) else {}
    except (json.JSONDecodeError, OSError):
        return {}


def _scan_repo_vault_files(project_id: str) -> list[dict[str, Any]]:
    repo_dir = get_project_dir(project_id) / "repo"
    if not repo_dir.exists():
        return []
    vault_files: list[dict[str, Any]] = []
    try:
        for fp in repo_dir.rglob("*"):
            if not fp.is_file():
                continue
            parts = fp.relative_to(repo_dir).parts
            if "group_vars" not in parts and "host_vars" not in parts and "vars" not in parts:
                continue
            try:
                with open(fp, encoding="utf-8", errors="replace") as fh:
                    content = fh.read(4096)
                if not content.strip().startswith("$ANSIBLE_VAULT"):
                    continue
                rel = fp.relative_to(repo_dir)
                path_str = str(rel).replace("\\", "/")
                key_label = parse_vault_id_from_header(content) or None
                st = fp.stat()
                created_ts = getattr(st, "st_birthtime", None) or st.st_ctime
                updated_ts = st.st_mtime
                vault_files.append(
                    {
                        "path": path_str,
                        "key": key_label,
                        "created": datetime.fromtimestamp(created_ts, tz=timezone.utc)
                        .isoformat()
                        .replace("+00:00", "Z"),
                        "updated": datetime.fromtimestamp(updated_ts, tz=timezone.utc)
                        .isoformat()
                        .replace("+00:00", "Z"),
                    }
                )
            except OSError:
                continue
    except OSError as exc:
        logger.warning("Error scanning repo for vault files: %s", exc)
    return sorted(vault_files, key=lambda row: row["path"])


def load_vaults(project_id: str) -> list[dict[str, Any]]:
    path = vaults_file(project_id)
    if not path.exists():
        old_path = secrets_dir(project_id) / "vaults.json"
        if old_path.exists():
            path = old_path
        else:
            return []
    try:
        with open(path, encoding="utf-8") as fh:
            data = json.load(fh)
        return data if isinstance(data, list) else []
    except (json.JSONDecodeError, OSError):
        return []


def save_vaults(project_id: str, vaults: list[dict[str, Any]]) -> None:
    path = vaults_file(project_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(vaults, fh, indent=2, ensure_ascii=False)


def _key_meta_without_password(meta: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": meta.get("id"),
        "name": meta.get("name", ""),
        "type": meta.get("type", "vault_password"),
        "createdAt": meta.get("createdAt"),
        "updatedAt": meta.get("updatedAt"),
    }


def _write_pass_file(pass_file: Path, password: str) -> None:
    with open(pass_file, "w", encoding="utf-8") as fh:
        fh.write(password)
        if not password.endswith("\n"):
            fh.write("\n")
    os.chmod(pass_file, 0o600)


def get_key_password_by_key_id(project_id: str, key_id: str) -> Optional[str]:
    if not key_id:
        return None
    pass_file = vault_keys_dir(project_id) / f"{key_id}.pass"
    if not pass_file.exists():
        return None
    try:
        with open(pass_file, encoding="utf-8") as fh:
            return fh.read().rstrip("\n")
    except OSError:
        return None


def get_key_password_for_vault(project_id: str, vault_uuid: str) -> Optional[str]:
    vault = next((row for row in load_vaults(project_id) if row.get("id") == vault_uuid), None)
    if not vault:
        return None
    key_id = vault.get("keyId")
    if not key_id:
        return None
    return get_key_password_by_key_id(project_id, str(key_id))


def enrich_vault_vault_id_from_content(vault: dict[str, Any]) -> dict[str, Any]:
    vid = (vault.get("vaultId") or "").strip()
    if vid:
        return vault
    content = vault.get("content") or ""
    if not content or not is_ansible_vault_encrypted(content):
        return vault
    parsed = parse_vault_id_from_header(content)
    if not parsed:
        return vault
    out = dict(vault)
    out["vaultId"] = parsed
    return out


def encrypt_content(project_id: str, content: str, vault_id: str) -> str:
    if not vault_id:
        return content
    password = get_key_password_for_vault(project_id, vault_id)
    if not password:
        raise VaultHttpError(400, "Vault or its key not found")
    vaults = load_vaults(project_id)
    vault = next((row for row in vaults if row.get("id") == vault_id), None)
    vault_label = (vault.get("vaultId") or vault.get("name")) if vault else None
    ok, result = ansible_vault_encrypt(content, password, vault_id=vault_label)
    if not ok:
        raise VaultHttpError(400, result or "Encryption failed")
    return result


def decrypt_content(project_id: str, content: str, vault_id: str) -> str:
    if not content or not is_ansible_vault_encrypted(content):
        return content
    if not vault_id:
        raise VaultHttpError(400, "Failed to decrypt. Check vault key.")
    password = get_key_password_for_vault(project_id, vault_id)
    if not password:
        raise VaultHttpError(400, "Failed to decrypt. Check vault key.")
    vault_id_header = parse_vault_id_from_header(content)
    use_vault_id = vault_id_header if vault_id_header else None
    ok, result = ansible_vault_decrypt(content, password, use_vault_id)
    if not ok:
        raise VaultHttpError(400, "Failed to decrypt. Check vault key.")
    return result


def list_vault_keys(project_id: str) -> dict[str, Any]:
    keys: list[dict[str, Any]] = []
    for meta_file in vault_keys_dir(project_id).glob("*.json"):
        try:
            with open(meta_file, encoding="utf-8") as fh:
                meta = json.load(fh)
            keys.append(_key_meta_without_password(meta if isinstance(meta, dict) else {}))
        except (json.JSONDecodeError, OSError) as exc:
            logger.warning("Error reading vault key %s: %s", meta_file, exc)
            continue
    keys.sort(key=lambda row: (row.get("name") or "").lower())
    return {"success": True, "keys": keys}


def create_vault_key(project_id: str, body: dict[str, Any]) -> dict[str, Any]:
    name = str(body.get("name") or "").strip()
    password = str(body.get("password") or "").strip()
    key_type = body.get("type", "vault_password")
    if not name:
        raise VaultHttpError(400, "Name is required")
    if not password:
        raise VaultHttpError(400, "Password is required")
    key_id = str(uuid.uuid4())
    meta_file = vault_keys_dir(project_id) / f"{key_id}.json"
    pass_file = vault_keys_dir(project_id) / f"{key_id}.pass"
    now = time.time()
    meta = {
        "id": key_id,
        "name": name,
        "type": key_type,
        "createdAt": now,
        "updatedAt": now,
    }
    with open(meta_file, "w", encoding="utf-8") as fh:
        json.dump(meta, fh, indent=2, ensure_ascii=False)
    _write_pass_file(pass_file, password)
    return {"success": True, "key": meta}


def get_vault_key(project_id: str, key_id: str) -> dict[str, Any]:
    meta_file = vault_keys_dir(project_id) / f"{key_id}.json"
    if not meta_file.exists():
        raise VaultHttpError(404, "Key not found")
    with open(meta_file, encoding="utf-8") as fh:
        meta = json.load(fh)
    return {"success": True, "key": meta}


def update_vault_key(project_id: str, key_id: str, body: dict[str, Any]) -> dict[str, Any]:
    meta_file = vault_keys_dir(project_id) / f"{key_id}.json"
    pass_file = vault_keys_dir(project_id) / f"{key_id}.pass"
    if not meta_file.exists():
        raise VaultHttpError(404, "Key not found")
    with open(meta_file, encoding="utf-8") as fh:
        meta = json.load(fh)
    if "name" in body:
        name = str(body.get("name") or "").strip()
        if not name:
            raise VaultHttpError(400, "Name cannot be empty")
        meta["name"] = name
    if "type" in body:
        meta["type"] = body.get("type", "vault_password")
    if "password" in body:
        password = str(body.get("password") or "").strip()
        if password:
            _write_pass_file(pass_file, password)
    meta["updatedAt"] = time.time()
    with open(meta_file, "w", encoding="utf-8") as fh:
        json.dump(meta, fh, indent=2, ensure_ascii=False)
    return {"success": True, "key": meta}


def delete_vault_key(project_id: str, key_id: str) -> dict[str, Any]:
    meta_file = vault_keys_dir(project_id) / f"{key_id}.json"
    pass_file = vault_keys_dir(project_id) / f"{key_id}.pass"
    if not meta_file.exists():
        raise VaultHttpError(404, "Key not found")
    if any(row.get("keyId") == key_id for row in load_vaults(project_id)):
        raise VaultHttpError(
            400,
            "Key is used by one or more vaults. Remove vault bindings first.",
        )
    meta_file.unlink()
    if pass_file.exists():
        pass_file.unlink()
    return {"success": True}


def list_vaults(project_id: str) -> dict[str, Any]:
    vaults = [enrich_vault_vault_id_from_content(row) for row in load_vaults(project_id)]
    keys_dir = vault_keys_dir(project_id)
    vault_files = _scan_repo_vault_files(project_id)
    for row in vaults:
        key_id = row.get("keyId")
        row["keyName"] = None
        if key_id:
            key_meta = keys_dir / f"{key_id}.json"
            if key_meta.exists():
                try:
                    with open(key_meta, encoding="utf-8") as fh:
                        row["keyName"] = json.load(fh).get("name")
                except (json.JSONDecodeError, OSError):
                    pass
    vault_label_to_key: dict[str, Any] = {}
    vault_label_to_id: dict[str, Any] = {}
    for row in vaults:
        key_name = row.get("keyName")
        vid = row.get("id")
        for lbl in (row.get("vaultId"), row.get("name")):
            if lbl:
                if key_name:
                    vault_label_to_key[lbl] = key_name
                vault_label_to_id[lbl] = vid
    path_to_key = _load_vault_file_keys(project_id)
    for item in vault_files:
        label = item.get("key")
        path = item.get("path", "")
        key_name = vault_label_to_key.get(label) if label else None
        if not key_name and path:
            stored_key_id = path_to_key.get(path)
            if stored_key_id:
                key_meta = keys_dir / f"{stored_key_id}.json"
                if key_meta.exists():
                    try:
                        with open(key_meta, encoding="utf-8") as fh:
                            key_name = json.load(fh).get("name")
                    except (json.JSONDecodeError, OSError):
                        pass
        item["keyName"] = key_name
        item["vaultId"] = vault_label_to_id.get(label) if label else None
    return {"success": True, "vaults": vaults, "vaultFiles": vault_files}


def create_vault(project_id: str, body: dict[str, Any]) -> dict[str, Any]:
    name = str(body.get("name") or "").strip()
    key_id = body.get("keyId") or str(body.get("key_id") or "").strip()
    vault_id_label = (body.get("vaultId") or body.get("vault_id") or "").strip() or None
    if not name:
        raise VaultHttpError(400, "Name is required")
    if not key_id:
        raise VaultHttpError(400, "Key is required")
    key_meta = vault_keys_dir(project_id) / f"{key_id}.json"
    if not key_meta.exists():
        raise VaultHttpError(404, "Key not found")
    vaults = load_vaults(project_id)
    now = time.time()
    vault = {
        "id": str(uuid.uuid4()),
        "name": name,
        "keyId": key_id,
        "vaultId": vault_id_label,
        "createdAt": now,
        "updatedAt": now,
    }
    vaults.append(vault)
    save_vaults(project_id, vaults)
    return {"success": True, "vault": vault}


def get_vault(project_id: str, vault_id: str) -> dict[str, Any]:
    vault = next((row for row in load_vaults(project_id) if row.get("id") == vault_id), None)
    if not vault:
        raise VaultHttpError(404, "Vault not found")
    return {"success": True, "vault": enrich_vault_vault_id_from_content(vault)}


def update_vault(project_id: str, vault_id: str, body: dict[str, Any]) -> dict[str, Any]:
    vaults = load_vaults(project_id)
    vault = next((row for row in vaults if row.get("id") == vault_id), None)
    if not vault:
        raise VaultHttpError(404, "Vault not found")
    if "name" in body:
        name = str(body.get("name") or "").strip()
        if not name:
            raise VaultHttpError(400, "Name cannot be empty")
        vault["name"] = name
    if "keyId" in body or "key_id" in body:
        new_key_id = body.get("keyId") or str(body.get("key_id") or "").strip()
        if new_key_id:
            if not (vault_keys_dir(project_id) / f"{new_key_id}.json").exists():
                raise VaultHttpError(404, "Key not found")
            vault["keyId"] = new_key_id
    if "vaultId" in body:
        vault["vaultId"] = str(body.get("vaultId") or "").strip() or None
    if "content" in body:
        vault["content"] = body.get("content") or ""
    vault["updatedAt"] = time.time()
    save_vaults(project_id, vaults)
    return {"success": True, "vault": vault}


def delete_vault(project_id: str, vault_id: str) -> dict[str, Any]:
    vaults = load_vaults(project_id)
    if not any(row.get("id") == vault_id for row in vaults):
        raise VaultHttpError(404, "Vault not found")
    save_vaults(project_id, [row for row in vaults if row.get("id") != vault_id])
    return {"success": True}


def encrypt_vault_content(project_id: str, vault_id: str, content: str) -> dict[str, Any]:
    encrypted = encrypt_content(project_id, content, vault_id)
    return {"success": True, "content": encrypted}


def decrypt_vault_content(project_id: str, vault_id: str, content: str) -> dict[str, Any]:
    decrypted = decrypt_content(project_id, content, vault_id)
    return {"success": True, "content": decrypted or content}
