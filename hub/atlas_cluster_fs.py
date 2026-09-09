"""Atlas cluster leaf + playbook-repo paths for Hosts/Roles/Playbooks APIs."""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Mapping, Optional

import yaml

from atlas_inspect import (
    CLUSTER_CONFIG_NAME,
    InspectError,
    require_inventory_leaf,
    resolve_clusters_root_for_list,
    resolve_inspect_cluster_id,
    resolve_workspace_root,
)
from clusterctl_config import (
    clusterctl_root_from_project,
    inspect_run_params_from_project,
)
from project_kind import normalize_kind
from projects_store import get_project

SKIP_INVENTORY_NAMES = frozenset({"cluster.yaml", "cluster.yml"})


def _projects_config() -> Path:
    env = os.environ.get("DATA_DIR")
    if env and str(env).strip():
        return Path(env).expanduser().resolve() / "projects.json"
    here = Path(__file__).resolve().parent
    base = here.parent if here.name in {"backend", "hub"} else here
    return base / "data" / "projects.json"


def load_project(project_id: str) -> Optional[dict[str, Any]]:
    return get_project(_projects_config(), project_id)


def is_atlas_project(
    project_id: str, project: Optional[dict[str, Any]] = None
) -> bool:
    payload = project if project is not None else load_project(project_id)
    if not payload:
        return False
    return normalize_kind(payload.get("kind")) == "atlas"


def resolve_atlas_inventory_leaf(
    project_id: str,
    requested_cluster_id: Optional[str] = None,
    project: Optional[dict[str, Any]] = None,
) -> Optional[Path]:
    """Return cluster leaf for atlas projects, or None if not atlas / unresolved."""
    payload = project if project is not None else load_project(project_id)
    if not payload or normalize_kind(payload.get("kind")) != "atlas":
        return None
    params = inspect_run_params_from_project(payload)
    try:
        cluster_id = resolve_inspect_cluster_id(
            requested=requested_cluster_id,
            fallback=str(payload.get("cluster_id") or "").strip() or None,
            run_params=params,
        )
        clusters_root = resolve_clusters_root_for_list(params)
        return require_inventory_leaf(clusters_root, cluster_id)
    except InspectError:
        return None


def load_cluster_yaml(leaf: Path) -> dict[str, Any]:
    path = leaf / CLUSTER_CONFIG_NAME
    if not path.is_file():
        return {}
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    except (OSError, yaml.YAMLError):
        return {}
    return data if isinstance(data, dict) else {}


def cluster_playbooks_spec(leaf: Path) -> dict[str, Any]:
    raw = load_cluster_yaml(leaf).get("playbooks") or {}
    return raw if isinstance(raw, dict) else {}


def cluster_playbook_repo_summaries(leaf: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for name, item in cluster_playbooks_spec(leaf).items():
        if not isinstance(item, dict):
            continue
        raw_entries = item.get("entries") or {}
        entries = (
            [str(key) for key in raw_entries.keys()]
            if isinstance(raw_entries, dict)
            else []
        )
        rows.append(
            {
                "name": str(name),
                "source": str(item.get("source") or "").strip() or "git",
                "url": str(item.get("url") or "").strip() or None,
                "ref": str(item.get("ref") or "").strip() or None,
                "path": str(item.get("path") or "").strip() or None,
                "sync": str(item.get("sync") or "").strip() or None,
                "layout": str(item.get("layout") or "").strip() or None,
                "entries": entries,
            }
        )
    return rows


def _split_invocation_tags(raw: object) -> list[str]:
    if raw is None:
        return []
    if isinstance(raw, list):
        parts = [str(item).strip() for item in raw]
    else:
        parts = [item.strip() for item in str(raw).split(",")]
    return [item for item in parts if item and item.lower() != "all"]


def _playbook_entry_tags(playbooks: Mapping[str, Any], ref: str, alias: str) -> list[str]:
    repo = ""
    entry = alias.strip()
    cleaned = str(ref or "").strip()
    if "/" in cleaned:
        repo, entry = cleaned.split("/", 1)
    elif cleaned:
        entry = cleaned
    spec: Any = playbooks.get(repo) if repo else None
    if not isinstance(spec, dict):
        for item in playbooks.values():
            if not isinstance(item, dict):
                continue
            entries = item.get("entries")
            if isinstance(entries, dict) and entry in entries:
                spec = item
                break
        else:
            return []
    entries = spec.get("entries")
    if not isinstance(entries, dict):
        return []
    entry_spec = entries.get(entry)
    if not isinstance(entry_spec, dict):
        return []
    seen: set[str] = set()
    tags: list[str] = []
    for invocation in entry_spec.get("invocations") or []:
        if not isinstance(invocation, dict):
            continue
        for tag in _split_invocation_tags(invocation.get("tags")):
            if tag in seen:
                continue
            seen.add(tag)
            tags.append(tag)
    return tags


def cluster_phase_summaries(leaf: Path) -> list[dict[str, Any]]:
    data = load_cluster_yaml(leaf)
    playbooks = data.get("playbooks") or {}
    if not isinstance(playbooks, dict):
        playbooks = {}
    raw = data.get("phases") or []
    if not isinstance(raw, list):
        return []
    rows: list[dict[str, Any]] = []
    for item in raw:
        if isinstance(item, str) and item.strip():
            alias = item.strip()
            rows.append(
                {
                    "alias": alias,
                    "ref": "",
                    "tags": _playbook_entry_tags(playbooks, "", alias),
                }
            )
            continue
        if isinstance(item, dict) and item:
            alias, ref = next(iter(item.items()))
            ref_text = "" if ref is None else str(ref)
            rows.append(
                {
                    "alias": str(alias),
                    "ref": ref_text,
                    "tags": _playbook_entry_tags(playbooks, ref_text, str(alias)),
                }
            )
    return rows


def cluster_yaml_payload(cluster_id: str, path: Path, content: str) -> dict[str, Any]:
    leaf = path.parent
    return {
        "cluster_id": cluster_id,
        "rel": CLUSTER_CONFIG_NAME,
        "content": content,
        "playbooks": cluster_playbook_repo_summaries(leaf),
        "phases": cluster_phase_summaries(leaf),
    }


def _clusterctl_and_workspace(
    project: Mapping[str, Any],
) -> tuple[Optional[Path], Optional[Path]]:
    params = inspect_run_params_from_project(project)
    ctl = clusterctl_root_from_project(project)
    workspace: Optional[Path] = None
    if ctl is not None:
        try:
            workspace = resolve_workspace_root(ctl, params)
        except InspectError:
            workspace = None
    explicit = project.get("workspaceRoot") or project.get("workspace_root")
    if explicit and str(explicit).strip():
        workspace = Path(str(explicit).strip()).expanduser()
    return ctl, workspace


def resolved_atlas_cluster_id(
    project: Mapping[str, Any] | None,
    requested_cluster_id: Optional[str] = None,
) -> Optional[str]:
    payload = project or {}
    params = inspect_run_params_from_project(payload)
    try:
        cluster_id = resolve_inspect_cluster_id(
            requested=requested_cluster_id,
            fallback=str(payload.get("cluster_id") or "").strip() or None,
            run_params=params,
        )
    except InspectError:
        return None
    text = str(cluster_id or "").strip()
    return text or None


def cluster_workspace_leaf(workspace_parent: Path, cluster_id: str) -> Path:
    """Per-cluster runtime tree: ``<workspace_root>/<env>/<name>/``."""
    parts = [
        part
        for part in Path(str(cluster_id).strip()).parts
        if part not in ("", ".", "..")
    ]
    if not parts:
        raise ValueError("cluster_id is empty")
    return Path(workspace_parent).joinpath(*parts)


def playbook_workspace_clone_dirs(
    workspace_root: Path,
    repo_name: str,
    cluster_id: Optional[str] = None,
) -> list[Path]:
    """Clone locations for ``repos sync``: per-cluster first, then parent/repos."""
    parent = Path(workspace_root)
    dirs: list[Path] = []
    if cluster_id and str(cluster_id).strip():
        dirs.append(
            cluster_workspace_leaf(parent, str(cluster_id)) / "repos" / repo_name
        )
    dirs.append(parent / "repos" / repo_name)
    seen: set[str] = set()
    unique: list[Path] = []
    for path in dirs:
        key = str(path)
        if key in seen:
            continue
        seen.add(key)
        unique.append(path)
    return unique


def resolve_playbook_repo_dir(
    repo_name: str,
    spec: Mapping[str, Any],
    *,
    clusterctl_root: Optional[Path],
    workspace_root: Optional[Path],
    cluster_id: Optional[str] = None,
) -> Optional[Path]:
    source = str(spec.get("source") or "git").strip().lower()
    raw_path = spec.get("path") or repo_name
    relative = str(spec.get("path_relative_to") or "sibling").strip() or "sibling"
    sibling: Optional[Path] = None
    if clusterctl_root is not None:
        path = Path(str(raw_path))
        if relative == "absolute":
            sibling = path
        elif relative == "repo_root":
            sibling = clusterctl_root / path
        else:
            sibling = clusterctl_root.parent / path
    workspace_clones: list[Path] = []
    if workspace_root is not None:
        workspace_clones = playbook_workspace_clone_dirs(
            Path(workspace_root), repo_name, cluster_id
        )
    if source == "local" and sibling is not None:
        return sibling
    for clone in workspace_clones:
        if clone.is_dir():
            return clone
    if sibling is not None and sibling.is_dir():
        return sibling
    if workspace_clones:
        return workspace_clones[0]
    return sibling


def layout_subpath(spec: Mapping[str, Any]) -> str:
    return str(spec.get("layout") or "roles/").strip().strip("/")


def list_atlas_role_packs(
    project_id: str,
    requested_cluster_id: Optional[str] = None,
    project: Optional[dict[str, Any]] = None,
) -> list[tuple[str, Path]]:
    payload = project if project is not None else load_project(project_id)
    leaf = resolve_atlas_inventory_leaf(
        project_id, requested_cluster_id, project=payload
    )
    if leaf is None or payload is None:
        return []
    ctl, workspace = _clusterctl_and_workspace(payload)
    cluster_id = resolved_atlas_cluster_id(payload, requested_cluster_id)
    packs: list[tuple[str, Path]] = []
    for name, spec in cluster_playbooks_spec(leaf).items():
        if not isinstance(spec, dict):
            continue
        repo = resolve_playbook_repo_dir(
            str(name),
            spec,
            clusterctl_root=ctl,
            workspace_root=workspace,
            cluster_id=cluster_id,
        )
        if repo is None:
            continue
        sub = layout_subpath(spec)
        roles_dir = repo / sub if sub else repo
        if roles_dir.is_dir():
            packs.append((str(name), roles_dir.resolve()))
    return packs


def list_atlas_playbook_entries(
    project_id: str,
    requested_cluster_id: Optional[str] = None,
    project: Optional[dict[str, Any]] = None,
) -> list[dict[str, Any]]:
    payload = project if project is not None else load_project(project_id)
    leaf = resolve_atlas_inventory_leaf(
        project_id, requested_cluster_id, project=payload
    )
    if leaf is None or payload is None:
        return []
    ctl, workspace = _clusterctl_and_workspace(payload)
    cluster_id = resolved_atlas_cluster_id(payload, requested_cluster_id)
    entries: list[dict[str, Any]] = []
    for repo_name, spec in cluster_playbooks_spec(leaf).items():
        if not isinstance(spec, dict):
            continue
        repo = resolve_playbook_repo_dir(
            str(repo_name),
            spec,
            clusterctl_root=ctl,
            workspace_root=workspace,
            cluster_id=cluster_id,
        )
        raw_entries = spec.get("entries") or {}
        if not isinstance(raw_entries, dict):
            continue
        for entry_name, entry in raw_entries.items():
            file_name = ""
            if isinstance(entry, dict):
                file_name = str(entry.get("file") or "")
            playbook_id = f"{repo_name}:{entry_name}"
            entries.append(
                {
                    "id": playbook_id,
                    "name": f"{repo_name} / {entry_name}",
                    "description": file_name,
                    "file": file_name,
                    "repo": str(repo_name),
                    "entry": str(entry_name),
                    "kind": "atlas",
                    "repoPath": str(repo) if repo is not None else "",
                }
            )
    return entries


class AtlasClusterFsError(Exception):
    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.message = message


def resolve_atlas_playbook_file(
    project_id: str,
    playbook_id: str,
    requested_cluster_id: Optional[str] = None,
    project: Optional[dict[str, Any]] = None,
) -> tuple[dict[str, Any], Path]:
    entries = {
        item["id"]: item
        for item in list_atlas_playbook_entries(
            project_id, requested_cluster_id, project=project
        )
    }
    item = entries.get(playbook_id)
    if not item:
        raise AtlasClusterFsError(404, "Playbook not found")
    repo_path = item.get("repoPath") or ""
    rel = str(item.get("file") or "").strip()
    if not repo_path or not rel:
        raise AtlasClusterFsError(404, "Playbook file is not configured")
    repo = Path(repo_path).resolve()
    target = (repo / rel).resolve()
    try:
        target.relative_to(repo)
    except ValueError as exc:
        raise AtlasClusterFsError(400, "Playbook path outside repo") from exc
    return item, target


def read_atlas_playbook_yaml(
    project_id: str,
    playbook_id: str,
    requested_cluster_id: Optional[str] = None,
    project: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    item, path = resolve_atlas_playbook_file(
        project_id, playbook_id, requested_cluster_id, project=project
    )
    content = ""
    if path.is_file():
        content = path.read_text(encoding="utf-8")
    return {**item, "yaml": content, "plays": []}


def write_atlas_playbook_yaml(
    project_id: str,
    playbook_id: str,
    content: str,
    requested_cluster_id: Optional[str] = None,
    project: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    if not isinstance(content, str):
        raise AtlasClusterFsError(400, "yaml must be a string")
    try:
        yaml.safe_load(content)
    except yaml.YAMLError as exc:
        raise AtlasClusterFsError(400, f"YAML validation error: {exc}") from exc
    item, path = resolve_atlas_playbook_file(
        project_id, playbook_id, requested_cluster_id, project=project
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content if content.endswith("\n") else content + "\n", encoding="utf-8")
    return {**item, "yaml": content if content.endswith("\n") else content + "\n", "plays": []}


def resolve_atlas_cluster_yaml_file(
    project_id: str,
    requested_cluster_id: Optional[str] = None,
    project: Optional[dict[str, Any]] = None,
) -> tuple[str, Path]:
    payload = project if project is not None else load_project(project_id)
    if not payload or normalize_kind(payload.get("kind")) != "atlas":
        raise AtlasClusterFsError(
            400, "cluster.yaml is only available for atlas projects"
        )
    params = inspect_run_params_from_project(payload)
    try:
        cluster_id = resolve_inspect_cluster_id(
            requested=requested_cluster_id,
            fallback=str(payload.get("cluster_id") or "").strip() or None,
            run_params=params,
        )
        clusters_root = resolve_clusters_root_for_list(params)
        leaf = require_inventory_leaf(clusters_root, cluster_id)
    except InspectError as exc:
        raise AtlasClusterFsError(404, str(exc) or "Cluster leaf not found") from exc
    leaf_resolved = leaf.resolve()
    path = (leaf_resolved / CLUSTER_CONFIG_NAME).resolve()
    try:
        path.relative_to(leaf_resolved)
    except ValueError as exc:
        raise AtlasClusterFsError(400, "cluster.yaml path outside leaf") from exc
    return cluster_id, path


def read_atlas_cluster_yaml(
    project_id: str,
    requested_cluster_id: Optional[str] = None,
    project: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    cluster_id, path = resolve_atlas_cluster_yaml_file(
        project_id, requested_cluster_id, project=project
    )
    content = ""
    if path.is_file():
        content = path.read_text(encoding="utf-8")
    return cluster_yaml_payload(cluster_id, path, content)


def write_atlas_cluster_yaml(
    project_id: str,
    content: str,
    requested_cluster_id: Optional[str] = None,
    project: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    if not isinstance(content, str):
        raise AtlasClusterFsError(400, "content must be a string")
    try:
        yaml.safe_load(content)
    except yaml.YAMLError as exc:
        raise AtlasClusterFsError(400, f"YAML validation error: {exc}") from exc
    cluster_id, path = resolve_atlas_cluster_yaml_file(
        project_id, requested_cluster_id, project=project
    )
    normalized = content if content.endswith("\n") else content + "\n"
    path.write_text(normalized, encoding="utf-8")
    return cluster_yaml_payload(cluster_id, path, normalized)
