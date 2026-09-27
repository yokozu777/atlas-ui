"""Atlas operator SSH (VM / Ansible) vs playbook git-pull keys."""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Mapping, Optional

from atlas_inspect import (
    InspectError,
    inventory_leaf_path,
    normalize_inventory_cluster_id,
    resolve_clusters_root_for_list,
)
from clusterctl_config import inspect_run_params_from_project
from clusterctl_ssh import (
    ClusterctlSshError,
    load_clusterctl_ssh_secret_id,
    save_clusterctl_ssh_secret_id,
)
from global_secrets_manager import GlobalSecretError, GlobalSecretsManager
from ssh_key_material import SshKeyMaterialError, decrypt_openssh_private, derive_openssh_public, ssh_fingerprint

OPERATOR_PUB_FILENAME = "localuser.pub"


class AtlasOperatorSshError(Exception):
    def __init__(self, status_code: int, message: str, *, silent: bool = False):
        super().__init__(message)
        self.status_code = status_code
        self.message = message
        self.silent = silent


def hub_data_dir(data_dir: Path | None = None) -> Path:
    if data_dir is not None:
        return Path(data_dir)
    raw = os.environ.get("DATA_DIR", "").strip()
    if raw:
        return Path(raw).expanduser().resolve()
    return Path(__file__).resolve().parent.parent / "data"


def _public_from_secret(secret: Mapping[str, Any] | None) -> str:
    data = secret or {}
    raw = data.get("publicKey")
    if not str(raw or "").strip():
        meta = data.get("metadata")
        if isinstance(meta, Mapping):
            raw = meta.get("publicKey")
    return str(raw or "").strip()


def _fingerprint_from_secret(secret: Mapping[str, Any] | None, public_key: str) -> str:
    data = secret or {}
    raw = data.get("fingerprint")
    if not str(raw or "").strip():
        meta = data.get("metadata")
        if isinstance(meta, Mapping):
            raw = meta.get("fingerprint")
    text = str(raw or "").strip()
    if text:
        return text
    return ssh_fingerprint(public_key) if public_key else ""


def describe_clusterctl_ssh(
    data_dir: Path, *, include_public: bool = False
) -> dict[str, Any]:
    secret_id = load_clusterctl_ssh_secret_id(data_dir)
    empty: dict[str, Any] = {
        "sshSecretId": None,
        "name": None,
        "fingerprint": None,
    }
    if include_public:
        empty["publicKey"] = None
    if not secret_id:
        return empty
    try:
        secret = GlobalSecretsManager(data_dir).get_secret(
            secret_id, include_material=include_public
        )
    except GlobalSecretError:
        return empty
    if not secret:
        return empty
    public_key = _public_from_secret(secret)
    if include_public and not public_key:
        derived = derive_openssh_public(str(secret.get("privateKey") or ""))
        public_key = str(derived.get("publicKey") or "").strip()
        fingerprint = str(derived.get("fingerprint") or "").strip() or ssh_fingerprint(
            public_key
        )
    else:
        fingerprint = _fingerprint_from_secret(secret, public_key)
    payload: dict[str, Any] = {
        "sshSecretId": secret_id,
        "name": str(secret.get("name") or "").strip() or None,
        "fingerprint": fingerprint or None,
    }
    if include_public:
        payload["publicKey"] = public_key or None
    return payload


def materialize_operator_private_key(data_dir: Path, dest: Path) -> str:
    secret_id = load_clusterctl_ssh_secret_id(data_dir)
    if not secret_id:
        raise AtlasOperatorSshError(400, "Atlas SSH key is not selected", silent=True)
    try:
        secret = GlobalSecretsManager(data_dir).get_secret(
            secret_id, include_material=True
        )
    except GlobalSecretError as exc:
        raise AtlasOperatorSshError(400, str(exc)) from exc
    if not secret:
        raise AtlasOperatorSshError(400, "Atlas SSH key is not selected", silent=True)
    private_key = str(secret.get("privateKey") or "").strip()
    if not private_key:
        raise AtlasOperatorSshError(400, "Atlas SSH key is missing privateKey", silent=True)
    try:
        content = decrypt_openssh_private(
            private_key, passphrase=str(secret.get("passphrase") or "")
        )
    except SshKeyMaterialError as exc:
        raise AtlasOperatorSshError(400, str(exc)) from exc
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(content, encoding="utf-8")
    os.chmod(dest, 0o600)
    return str(dest.resolve())


def _clusters_root_for_project(project: Mapping[str, Any]) -> Path:
    params = inspect_run_params_from_project(project)
    return resolve_clusters_root_for_list(params)


def _pub_path(clusters_root: Path, cluster_id: str) -> Path:
    cid = normalize_inventory_cluster_id(cluster_id)
    return inventory_leaf_path(clusters_root, cid) / "pub_keys" / OPERATOR_PUB_FILENAME


def _public_from_project_ssh(project_id: str, secret_name: str) -> str:
    from secrets_http import secrets_dir

    name = str(secret_name or "").strip()
    if not name:
        raise AtlasOperatorSshError(400, "Project SSH key name is required")
    path = secrets_dir(project_id) / "ssh_keys" / f"{name}.json"
    if not path.is_file():
        raise AtlasOperatorSshError(404, f"Secret {name} not found")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise AtlasOperatorSshError(400, f"Secret {name} is unreadable") from exc
    if not isinstance(data, dict) or str(data.get("type") or "") != "ssh_key":
        raise AtlasOperatorSshError(400, f"Secret {name} is not an SSH key")
    public_key = str(data.get("publicKey") or "").strip()
    if public_key:
        return public_key
    derived = derive_openssh_public(str(data.get("privateKey") or ""))
    public_key = str(derived.get("publicKey") or "").strip()
    if not public_key:
        raise AtlasOperatorSshError(
            400, f"Secret {name} has no public key and privateKey could not be read"
        )
    return public_key


def _write_pub_file(path: Path, public_key: str) -> None:
    leaf = path.parent.parent
    if not leaf.is_dir():
        raise AtlasOperatorSshError(400, f"cluster leaf not found: {leaf}")
    path.parent.mkdir(parents=True, exist_ok=True)
    content = public_key if public_key.endswith("\n") else public_key + "\n"
    path.write_text(content, encoding="utf-8")
    os.chmod(path, 0o644)


def operator_pubkey_status(
    project: Mapping[str, Any],
    cluster_id: str,
    *,
    data_dir: Path,
) -> dict[str, Any]:
    described = describe_clusterctl_ssh(data_dir)
    payload: dict[str, Any] = {
        **described,
        "cluster_id": None,
        "pubPath": None,
        "pubExists": False,
        "pubFingerprint": None,
        "match": False,
    }
    try:
        cid = normalize_inventory_cluster_id(cluster_id)
        clusters_root = _clusters_root_for_project(project)
        path = _pub_path(clusters_root, cid)
    except InspectError as exc:
        raise AtlasOperatorSshError(400, str(exc)) from exc
    payload["cluster_id"] = cid
    payload["pubPath"] = str(path)
    if path.is_file():
        payload["pubExists"] = True
        pub_text = path.read_text(encoding="utf-8").strip()
        payload["pubFingerprint"] = ssh_fingerprint(pub_text) or None
        atlas_fp = str(described.get("fingerprint") or "")
        payload["match"] = bool(atlas_fp and payload["pubFingerprint"] == atlas_fp)
    return payload


def write_operator_pubkey(
    project: Mapping[str, Any],
    cluster_id: str,
    *,
    data_dir: Path,
    ssh_secret_id: str | None = None,
    project_secret_name: str | None = None,
    project_id: str | None = None,
) -> dict[str, Any]:
    bind_id = str(ssh_secret_id or "").strip() or None
    project_name = str(project_secret_name or "").strip() or None
    if bind_id:
        try:
            save_clusterctl_ssh_secret_id(data_dir, bind_id)
        except ClusterctlSshError as exc:
            raise AtlasOperatorSshError(exc.status_code, exc.message) from exc
        project_name = None
    if project_name:
        pid = str(project_id or "").strip()
        if not pid:
            raise AtlasOperatorSshError(400, "project_id is required")
        public_key = _public_from_project_ssh(pid, project_name)
    else:
        described = describe_clusterctl_ssh(data_dir, include_public=True)
        public_key = str(described.get("publicKey") or "").strip()
        if not public_key:
            raise AtlasOperatorSshError(
                400,
                "Atlas SSH key has no public key. Select or generate a key first.",
            )
    try:
        cid = normalize_inventory_cluster_id(cluster_id)
        clusters_root = _clusters_root_for_project(project)
        path = _pub_path(clusters_root, cid)
    except InspectError as exc:
        raise AtlasOperatorSshError(400, str(exc)) from exc
    _write_pub_file(path, public_key)
    return operator_pubkey_status(project, cid, data_dir=data_dir)
