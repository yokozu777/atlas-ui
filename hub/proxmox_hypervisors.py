"""Saved Proxmox servers and live catalog calls through proxmox-library."""
from __future__ import annotations

import json
import os
import re
import secrets
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Optional

import yaml

from atlas_cluster_fs import resolve_atlas_inventory_leaf
from atlas_hosts import AtlasHostsError, list_hosts_topology
from atlas_vars_setup import _origin_and_value, cascade_layers
from proxmox_library_git import ProxmoxLibraryGitError, library_checkout
from secret_encryption import get_encryption

_STORE = "hypervisors.json"
_CACHE_TTL_SEC = 30.0
_cache: dict[tuple[str, str, str], tuple[float, Any]] = {}
_TOKEN_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")


class ProxmoxLibraryError(Exception):
    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.message = message


def clear_catalog_cache() -> None:
    _cache.clear()


def _store_path(data_dir: Path) -> Path:
    return Path(data_dir) / _STORE


def _load_store(data_dir: Path) -> list[dict[str, Any]]:
    path = _store_path(data_dir)
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    rows = raw.get("hypervisors") if isinstance(raw, dict) else None
    if not isinstance(rows, list):
        return []
    return [row for row in rows if isinstance(row, dict)]


def _write_store(data_dir: Path, rows: list[dict[str, Any]]) -> None:
    path = _store_path(data_dir)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps({"hypervisors": rows}, indent=2) + "\n",
        encoding="utf-8",
    )


def _public(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row.get("id"),
        "name": row.get("name") or "",
        "host": row.get("host") or "",
        "port": int(row.get("port") or 8006),
        "apiUser": row.get("apiUser") or "root@pam",
        "sshUser": row.get("sshUser") or "root",
        "hasPassword": bool(row.get("password")),
    }


def list_hypervisors(data_dir: Path) -> dict[str, Any]:
    return {"hypervisors": [_public(row) for row in _load_store(data_dir)]}


def _require_row(data_dir: Path, hypervisor_id: str) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    rows = _load_store(data_dir)
    for row in rows:
        if str(row.get("id")) == hypervisor_id:
            return rows, row
    raise ProxmoxLibraryError(404, "hypervisor not found")


def _clean_host(raw: Any) -> str:
    text = str(raw or "").strip()
    if not text or len(text) > 253 or any(ch.isspace() for ch in text):
        raise ProxmoxLibraryError(400, "host is required")
    return text


def _clean_port(raw: Any, *, default: int = 8006) -> int:
    if raw is None or raw == "":
        return default
    try:
        port = int(raw)
    except (TypeError, ValueError) as exc:
        raise ProxmoxLibraryError(400, "port is invalid") from exc
    if port < 1 or port > 65535:
        raise ProxmoxLibraryError(400, "port is invalid")
    return port


def _clean_user(raw: Any, *, fallback: str, label: str) -> str:
    text = str(raw or "").strip() or fallback
    if not text or len(text) > 128 or any(ch.isspace() for ch in text):
        raise ProxmoxLibraryError(400, f"{label} is invalid")
    return text


def _password(row: dict[str, Any], data_dir: Path) -> str:
    encrypted = str(row.get("password") or "")
    if not encrypted:
        raise ProxmoxLibraryError(400, "hypervisor has no password")
    try:
        return get_encryption(data_dir).decrypt(encrypted)
    except ValueError as exc:
        raise ProxmoxLibraryError(400, "hypervisor password cannot be decrypted") from exc


def create_hypervisor(data_dir: Path, body: dict[str, Any]) -> dict[str, Any]:
    name = str(body.get("name") or "").strip()
    if not name:
        raise ProxmoxLibraryError(400, "name is required")
    password = str(body.get("password") or "")
    if not password:
        raise ProxmoxLibraryError(400, "password is required")
    try:
        encrypted = get_encryption(data_dir).encrypt(password)
    except ValueError as exc:
        raise ProxmoxLibraryError(503, str(exc)) from exc
    row = {
        "id": secrets.token_hex(8),
        "name": name,
        "host": _clean_host(body.get("host")),
        "port": _clean_port(body.get("port")),
        "apiUser": _clean_user(body.get("apiUser"), fallback="root@pam", label="API user"),
        "sshUser": _clean_user(body.get("sshUser"), fallback="root", label="SSH user"),
        "password": encrypted,
    }
    if "@" not in row["apiUser"]:
        raise ProxmoxLibraryError(400, "API user must look like root@pam")
    rows = _load_store(data_dir)
    rows.append(row)
    _write_store(data_dir, rows)
    clear_catalog_cache()
    return {"hypervisor": _public(row)}


def update_hypervisor(data_dir: Path, hypervisor_id: str, body: dict[str, Any]) -> dict[str, Any]:
    rows, row = _require_row(data_dir, hypervisor_id)
    if "name" in body:
        name = str(body.get("name") or "").strip()
        if not name:
            raise ProxmoxLibraryError(400, "name is required")
        row["name"] = name
    if "host" in body:
        row["host"] = _clean_host(body.get("host"))
    if "port" in body:
        row["port"] = _clean_port(body.get("port"))
    if "apiUser" in body:
        row["apiUser"] = _clean_user(body.get("apiUser"), fallback="root@pam", label="API user")
        if "@" not in row["apiUser"]:
            raise ProxmoxLibraryError(400, "API user must look like root@pam")
    if "sshUser" in body:
        row["sshUser"] = _clean_user(body.get("sshUser"), fallback="root", label="SSH user")
    password = str(body.get("password") or "")
    if password:
        try:
            row["password"] = get_encryption(data_dir).encrypt(password)
        except ValueError as exc:
            raise ProxmoxLibraryError(503, str(exc)) from exc
    _write_store(data_dir, rows)
    clear_catalog_cache()
    return {"hypervisor": _public(row)}


def delete_hypervisor(data_dir: Path, hypervisor_id: str) -> dict[str, Any]:
    rows, _row = _require_row(data_dir, hypervisor_id)
    kept = [row for row in rows if str(row.get("id")) != hypervisor_id]
    _write_store(data_dir, kept)
    clear_catalog_cache()
    return {"ok": True}


def _norm(value: str) -> str:
    return value.strip().lower().rstrip(".")


def match_hypervisor(data_dir: Path, host: str) -> Optional[dict[str, Any]]:
    needle = _norm(host)
    if not needle:
        return None
    for row in _load_store(data_dir):
        if _norm(str(row.get("host") or "")) == needle or _norm(str(row.get("name") or "")) == needle:
            return row
    return None


def _redact(message: str, password: str) -> str:
    if password and password in message:
        return message.replace(password, "***")
    return message


def run_library(args: list[str], password: str) -> dict[str, Any]:
    try:
        root = library_checkout()
    except ProxmoxLibraryGitError as exc:
        raise ProxmoxLibraryError(exc.status_code, exc.message) from exc
    binary = root / "proxmox-library"
    env = os.environ.copy()
    env["PROXMOX_PASSWORD"] = password
    try:
        result = subprocess.run(
            [sys.executable, str(binary), *args],
            cwd=str(root),
            env=env,
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise ProxmoxLibraryError(502, "proxmox-library failed") from exc
    text = (result.stdout or "").strip()
    try:
        payload = json.loads(text) if text else {}
    except json.JSONDecodeError as exc:
        raise ProxmoxLibraryError(502, "proxmox-library returned invalid JSON") from exc
    if not isinstance(payload, dict):
        raise ProxmoxLibraryError(502, "proxmox-library returned invalid JSON")
    if result.returncode != 0 or not payload.get("ok"):
        message = str(payload.get("error") or "proxmox-library failed")
        raise ProxmoxLibraryError(502, _redact(message, password)[:300])
    return payload


def _connection_args(row: dict[str, Any]) -> list[str]:
    return [
        "--host",
        str(row["host"]),
        "--port",
        str(int(row.get("port") or 8006)),
        "--user",
        str(row.get("apiUser") or "root@pam"),
    ]


def test_hypervisor(data_dir: Path, hypervisor_id: str) -> dict[str, Any]:
    _rows, row = _require_row(data_dir, hypervisor_id)
    payload = run_library([*_connection_args(row), "nodes"], _password(row, data_dir))
    return {"ok": True, "nodes": payload.get("nodes") or []}


def _cached(key: tuple[str, str, str], loader):
    now = time.monotonic()
    hit = _cache.get(key)
    if hit and now - hit[0] < _CACHE_TTL_SEC:
        return hit[1]
    value = loader()
    _cache[key] = (now, value)
    return value


def _scalar_from_group_vars(leaf: Path, key: str) -> str:
    root = leaf / "group_vars"
    if not root.is_dir():
        return ""
    preferred = root / "all" / "atlas-compute-provision.yml"
    files: list[Path] = []
    if preferred.is_file():
        files.append(preferred)
    for path in sorted(root.rglob("*.yml")):
        if path.name.endswith(".secrets.yml") or path in files:
            continue
        files.append(path)
    for path in files:
        try:
            text = path.read_text(encoding="utf-8")
        except OSError:
            continue
        if text.lstrip().startswith("$ANSIBLE_VAULT"):
            continue
        try:
            data = yaml.safe_load(text)
        except yaml.YAMLError:
            continue
        if not isinstance(data, dict) or key not in data:
            continue
        value = data.get(key)
        if value is None:
            continue
        text_value = str(value).strip().strip("\"'")
        if text_value and "{{" not in text_value:
            return text_value
    return ""


def _cluster_pve_host(leaf: Path, cluster_id: Optional[str]) -> str:
    direct = _scalar_from_group_vars(leaf, "provision_pve_host")
    if direct:
        return direct
    if not cluster_id:
        return ""
    _origin, value, _path = _origin_and_value(
        cascade_layers(leaf, cluster_id),
        "group_vars/all/atlas-compute-provision.yml",
        "provision_pve_host",
    )
    text_value = str(value or "").strip().strip("\"'")
    if text_value and "{{" not in text_value:
        return text_value
    return ""


def _inventory_groups(project_id: str, cluster_id: Optional[str]) -> list[str]:
    names: list[str] = []
    try:
        data = list_hosts_topology(project_id, cluster_id)
    except AtlasHostsError:
        data = {}
    for group in data.get("groups") or []:
        if not isinstance(group, dict):
            continue
        name = str(group.get("name") or "").strip()
        if name and name not in names:
            names.append(name)
    if "proxmox" not in names:
        names.append("proxmox")
    return names


def catalog(
    data_dir: Path,
    project_id: str,
    cluster_id: Optional[str],
    *,
    host: str = "",
    node: str = "",
) -> dict[str, Any]:
    chosen_host = host.strip()
    if not chosen_host:
        leaf = resolve_atlas_inventory_leaf(project_id, cluster_id)
        if leaf is not None:
            chosen_host = _cluster_pve_host(leaf, cluster_id)
    row = match_hypervisor(data_dir, chosen_host) if chosen_host else None
    empty = {
        "matched": False,
        "host": chosen_host,
        "hypervisorId": None,
        "sshUser": "",
        "nodes": [],
        "storages": [],
        "bridges": [],
        "inventoryGroups": [],
        "error": None,
    }
    if row is None:
        return empty
    password = _password(row, data_dir)
    base = _connection_args(row)
    hid = str(row["id"])
    try:
        nodes = _cached(
            (hid, "nodes", ""),
            lambda: list(run_library([*base, "nodes"], password).get("nodes") or []),
        )
        selected = node.strip()
        if selected and selected not in nodes:
            nodes = [selected, *nodes]
        if not selected and nodes:
            selected = str(nodes[0])
        storages: list[dict[str, Any]] = []
        bridges: list[str] = []
        if selected:
            storages = _cached(
                (hid, "storages", selected),
                lambda: list(run_library([*base, "storages", "--node", selected], password).get("storages") or []),
            )
            bridges = _cached(
                (hid, "bridges", selected),
                lambda: list(run_library([*base, "bridges", "--node", selected], password).get("bridges") or []),
            )
    except ProxmoxLibraryError as exc:
        empty.update(
            {
                "matched": True,
                "hypervisorId": hid,
                "sshUser": row.get("sshUser") or "root",
                "error": exc.message,
                "inventoryGroups": _inventory_groups(project_id, cluster_id),
            }
        )
        return empty
    return {
        "matched": True,
        "host": str(row.get("host") or chosen_host),
        "hypervisorId": hid,
        "sshUser": row.get("sshUser") or "root",
        "nodes": nodes,
        "storages": storages,
        "bridges": bridges,
        "inventoryGroups": _inventory_groups(project_id, cluster_id),
        "error": None,
    }


def vmid_status(
    data_dir: Path,
    project_id: str,
    cluster_id: Optional[str],
    vmid: int,
    *,
    host: str = "",
) -> dict[str, Any]:
    if vmid < 100:
        raise ProxmoxLibraryError(400, "vmid is invalid")
    info = catalog(data_dir, project_id, cluster_id, host=host)
    if not info.get("matched") or not info.get("hypervisorId"):
        return {"checked": False, "free": None, "error": None}
    if info.get("error"):
        return {"checked": False, "free": None, "error": info["error"]}
    _rows, row = _require_row(data_dir, str(info["hypervisorId"]))
    payload = run_library(
        [*_connection_args(row), "vmid-free", "--vmid", str(vmid)],
        _password(row, data_dir),
    )
    return {"checked": True, "free": bool(payload.get("free")), "vmid": vmid, "error": None}


def _token_exists(message: str) -> bool:
    text = message.lower()
    return "exist" in text or "already" in text


def create_api_token(
    data_dir: Path,
    project_id: str,
    cluster_id: Optional[str],
    *,
    host: str = "",
    token_id: str = "",
    password: str = "",
) -> dict[str, Any]:
    typed_password = password.strip()
    if typed_password.upper() == "CHANGEME":
        typed_password = ""
    info = catalog(data_dir, project_id, cluster_id, host=host)
    row = None
    if info.get("hypervisorId"):
        _rows, row = _require_row(data_dir, str(info["hypervisorId"]))
    target_host = str((row or {}).get("host") or host or info.get("host") or "").strip()
    if row is not None:
        secret_password = _password(row, data_dir) or typed_password
        connection = _connection_args(row)
    elif typed_password and target_host:
        secret_password = typed_password
        connection = ["--host", target_host, "--port", "8006", "--user", "root@pam"]
    else:
        raise ProxmoxLibraryError(
            400,
            "Select a saved Proxmox host or enter the SSH password",
        )
    chosen = token_id.strip() or "atlas-ui"
    if not _TOKEN_ID.fullmatch(chosen):
        raise ProxmoxLibraryError(400, "token id is invalid")
    args = [*connection, "create-token", "--token-id", chosen]
    try:
        payload = run_library(args, secret_password)
    except ProxmoxLibraryError as exc:
        if not _token_exists(exc.message):
            raise
        chosen = f"atlas-ui-{secrets.token_hex(2)}"
        payload = run_library(
            [*connection, "create-token", "--token-id", chosen],
            secret_password,
        )
    api_user = str((row or {}).get("apiUser") or "root@pam")
    return {
        "tokenId": payload.get("token_id") or f"{api_user}!{chosen}",
        "secret": payload.get("secret") or "",
    }
