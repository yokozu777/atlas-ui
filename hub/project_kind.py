"""Project kind (ansible | atlas): validation and on-disk layout."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Mapping, MutableMapping, Optional

PROJECT_KINDS = frozenset({"ansible", "atlas"})
DEFAULT_KIND = "ansible"
DEFAULT_ANSIBLE_CFG = (
    "[defaults]\nhost_key_checking = False\ninterpreter_python = auto_silent\n"
)
ANSIBLE_REPO_DIRS = (
    "roles",
    "playbooks",
    "inventories",
    "group_vars",
    "host_vars",
    "scripts",
)


class ProjectKindError(ValueError):
    pass


def normalize_kind(
    value: Any,
    *,
    required: bool = False,
    default: str = DEFAULT_KIND,
) -> str:
    if value is None or (isinstance(value, str) and not value.strip()):
        if required:
            raise ProjectKindError("kind is required (atlas or ansible)")
        return default
    kind = str(value).strip().lower()
    if kind not in PROJECT_KINDS:
        raise ProjectKindError("kind must be atlas or ansible")
    return kind


def with_kind(project: Mapping[str, Any]) -> dict[str, Any]:
    out = dict(project)
    out["kind"] = normalize_kind(out.get("kind"), required=False)
    return out


def ensure_ansible_infra_layout(project_dir: Path) -> None:
    """Ansible repo skeleton used by Hosts & Groups, Roles, and Playbooks."""
    repo_dir = project_dir / "repo"
    repo_dir.mkdir(parents=True, exist_ok=True)
    for name in ANSIBLE_REPO_DIRS:
        (repo_dir / name).mkdir(exist_ok=True)

    ui_dir = project_dir / "ui"
    ui_dir.mkdir(exist_ok=True)
    (ui_dir / "playbooks").mkdir(exist_ok=True)

    (project_dir / "ansible-config").mkdir(exist_ok=True)


def ensure_project_layout(project_dir: Path, kind: str) -> None:
    """Create directories for a project. Atlas also gets the Ansible repo skeleton."""
    kind = normalize_kind(kind, required=True)
    project_dir.mkdir(parents=True, exist_ok=True)

    runtime_dir = project_dir / "runtime"
    runtime_dir.mkdir(exist_ok=True)
    (runtime_dir / "generated_playbooks").mkdir(exist_ok=True)
    (runtime_dir / "inventory_snapshots").mkdir(exist_ok=True)
    (runtime_dir / "artifacts").mkdir(exist_ok=True)

    history_dir = project_dir / "history"
    history_dir.mkdir(exist_ok=True)
    (history_dir / "executions").mkdir(exist_ok=True)
    (history_dir / "logs").mkdir(exist_ok=True)

    secrets_dir = project_dir / "secrets"
    secrets_dir.mkdir(exist_ok=True)
    (secrets_dir / "ssh_keys").mkdir(exist_ok=True)
    (secrets_dir / "vault").mkdir(exist_ok=True)
    (secrets_dir / "vault_keys").mkdir(exist_ok=True)
    (secrets_dir / "git_auth").mkdir(exist_ok=True)

    if kind == "atlas":
        (project_dir / "atlas").mkdir(exist_ok=True)

    ensure_ansible_infra_layout(project_dir)


def reject_kind_mutation(existing: Mapping[str, Any], updates: Mapping[str, Any]) -> None:
    if "kind" not in updates:
        return
    current = normalize_kind(existing.get("kind"), required=False)
    incoming = normalize_kind(updates.get("kind"), required=True)
    if incoming != current:
        raise ProjectKindError("kind cannot be changed after create")


def atlas_cluster_id(project: Mapping[str, Any]) -> Optional[str]:
    raw = project.get("cluster_id") or project.get("clusterId")
    if raw is None:
        return None
    value = str(raw).strip()
    return value or None


def materialize_created_project(project_dir: Path, project: Mapping[str, Any]) -> None:
    """Write on-disk layout + project.json after create. Atlas keeps sources empty."""
    kind = normalize_kind(project.get("kind"), required=True)
    ensure_project_layout(project_dir, kind)
    if kind == "atlas":
        config: dict[str, Any] = {
            "kind": "atlas",
            "cluster_id": atlas_cluster_id(project),
            "clusterctlRoot": project.get("clusterctlRoot") or project.get("clusterctl_root"),
            "sources": {},
        }
    else:
        config = {
            "kind": "ansible",
            "sources": {"repo": {"mode": "local", "localPath": "repo", "syncDirection": "pull"}},
        }
        folders = project_dir / "ui" / "folders.json"
        folders.parent.mkdir(parents=True, exist_ok=True)
        if not folders.exists():
            folders.write_text("{}\n", encoding="utf-8")
        sync_state = project_dir / ".sync_state.json"
        if not sync_state.exists():
            sync_state.write_text("{}\n", encoding="utf-8")
    cfg = project_dir / "ansible-config" / "ansible.cfg"
    if not cfg.exists():
        cfg.write_text(DEFAULT_ANSIBLE_CFG, encoding="utf-8")
    (project_dir / "project.json").write_text(
        json.dumps(config, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def apply_create_fields(payload: MutableMapping[str, Any]) -> dict[str, Any]:
    kind = normalize_kind(payload.get("kind"), required=True)
    extra: dict[str, Any] = {"kind": kind}
    if kind == "atlas":
        cluster_id = atlas_cluster_id(payload)
        if not cluster_id:
            raise ProjectKindError("atlas projects require cluster_id")
        extra["cluster_id"] = cluster_id
        root = payload.get("clusterctlRoot") or payload.get("clusterctl_root")
        if root:
            extra["clusterctlRoot"] = str(root).strip()
    return extra
