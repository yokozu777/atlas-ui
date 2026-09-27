"""Atlas project cluster membership, catalog metadata, and optional disk purge."""
from __future__ import annotations

import shutil
from io import StringIO
from pathlib import Path
from typing import Any, Mapping, Optional

from atlas_cluster_fs import cluster_workspace_leaf, load_cluster_yaml
from atlas_hosts import summarize_hosts_capacity
from atlas_inspect import (
    CLUSTER_CONFIG_NAME,
    InspectError,
    inventory_leaf_path,
    normalize_inventory_cluster_id,
    resolve_clusters_root_for_list,
)
from clusterctl_config import (
    clusterctl_root_from_project,
    inspect_run_params_from_project,
    resolve_workspace_root,
    ENV_WORKSPACE_ROOT,
    _explicit_path,
)
from project_kind import atlas_archived_cluster_ids, atlas_owned_cluster_ids
from projects_store import (
    persist_atlas_cluster_membership,
)


class AtlasClustersError(Exception):
    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.message = message


def split_cluster_id(cluster_id: str) -> tuple[Optional[str], str]:
    cid = str(cluster_id or "").strip().replace("\\", "/")
    if "/" in cid:
        env, name = cid.split("/", 1)
        return env or None, name
    return None, cid


def _run_params(project: Mapping[str, Any]) -> dict[str, Any]:
    return inspect_run_params_from_project(project)


def _clusters_root(project: Mapping[str, Any]) -> Path:
    try:
        return resolve_clusters_root_for_list(_run_params(project))
    except InspectError as exc:
        raise AtlasClustersError(400, str(exc)) from exc


def _workspace_parent(project: Mapping[str, Any]) -> Optional[Path]:
    params = _run_params(project)
    ctl = clusterctl_root_from_project(project)
    if ctl is not None:
        try:
            return resolve_workspace_root(ctl, params)
        except Exception:
            pass
    return _explicit_path(
        params, ("workspace_root", "workspaceRoot"), ENV_WORKSPACE_ROOT
    )


def _require_owned(project: Mapping[str, Any], cluster_id: str) -> str:
    try:
        cid = normalize_inventory_cluster_id(cluster_id)
    except InspectError as exc:
        raise AtlasClustersError(400, str(exc)) from exc
    owned = atlas_owned_cluster_ids(project)
    if cid not in owned:
        raise AtlasClustersError(404, f"cluster {cid} is not in this project")
    return cid


def describe_cluster(
    cluster_id: str,
    *,
    clusters_root: Path,
    workspace_parent: Optional[Path],
    archived: bool,
) -> dict[str, Any]:
    cid = str(cluster_id).strip()
    env, name = split_cluster_id(cid)
    leaf = inventory_leaf_path(clusters_root, cid)
    cfg = leaf / CLUSTER_CONFIG_NAME
    leaf_exists = cfg.is_file()
    display_name = None
    if leaf_exists:
        data = load_cluster_yaml(leaf)
        raw = data.get("display_name") or data.get("displayName")
        text = str(raw or "").strip()
        display_name = text or None
    workspace_exists = False
    if workspace_parent is not None:
        try:
            workspace_exists = cluster_workspace_leaf(workspace_parent, cid).is_dir()
        except ValueError:
            workspace_exists = False
    capacity = summarize_hosts_capacity(leaf)
    return {
        "id": cid,
        "env": env,
        "name": name,
        "display_name": display_name,
        "archived": bool(archived),
        "leafExists": leaf_exists,
        "workspaceExists": workspace_exists,
        "kind": "deployable" if leaf_exists else "broken",
        "active": False,
        **capacity,
    }


def list_project_clusters(project: Mapping[str, Any]) -> dict[str, Any]:
    clusters_root = _clusters_root(project)
    workspace_parent = _workspace_parent(project)
    owned = atlas_owned_cluster_ids(project)
    archived = set(atlas_archived_cluster_ids(project))
    rows = [
        describe_cluster(
            cid,
            clusters_root=clusters_root,
            workspace_parent=workspace_parent,
            archived=cid in archived,
        )
        for cid in owned
    ]
    return {
        "clustersRoot": str(clusters_root),
        "workspaceRoot": str(workspace_parent) if workspace_parent else None,
        "clusters": rows,
    }


def archive_cluster(
    config_file: Path, project_id: str, project: Mapping[str, Any], cluster_id: str
) -> dict[str, Any]:
    cid = _require_owned(project, cluster_id)
    owned = atlas_owned_cluster_ids(project)
    archived = atlas_archived_cluster_ids(project)
    if cid not in archived:
        archived.append(cid)
    saved = persist_atlas_cluster_membership(
        config_file, project_id, owned, archived
    )
    return list_project_clusters(saved or project)


def restore_cluster(
    config_file: Path, project_id: str, project: Mapping[str, Any], cluster_id: str
) -> dict[str, Any]:
    cid = _require_owned(project, cluster_id)
    owned = atlas_owned_cluster_ids(project)
    archived = [item for item in atlas_archived_cluster_ids(project) if item != cid]
    saved = persist_atlas_cluster_membership(
        config_file, project_id, owned, archived
    )
    return list_project_clusters(saved or project)


def unlink_cluster(
    config_file: Path,
    project_id: str,
    project: Mapping[str, Any],
    cluster_id: str,
    *,
    purge: bool = False,
) -> dict[str, Any]:
    cid = _require_owned(project, cluster_id)
    if purge:
        purge_cluster_disk(project, cid)
    owned = [item for item in atlas_owned_cluster_ids(project) if item != cid]
    archived = [item for item in atlas_archived_cluster_ids(project) if item != cid]
    current = str(project.get("cluster_id") or project.get("clusterId") or "").strip()
    kwargs: dict[str, Any] = {}
    if current == cid:
        if owned:
            kwargs["cluster_id"] = owned[0]
        else:
            kwargs["clear_cluster_id"] = True
    saved = persist_atlas_cluster_membership(
        config_file, project_id, owned, archived, **kwargs
    )
    return list_project_clusters(saved or project)


def _assert_inside(path: Path, root: Path, label: str) -> Path:
    try:
        resolved = path.expanduser().resolve()
        base = root.expanduser().resolve()
    except OSError as exc:
        raise AtlasClustersError(400, f"{label} path is unreadable") from exc
    try:
        resolved.relative_to(base)
    except ValueError as exc:
        raise AtlasClustersError(400, f"{label} is outside {base}") from exc
    if resolved == base:
        raise AtlasClustersError(400, f"refusing to delete {label} root")
    return resolved


def purge_cluster_disk(project: Mapping[str, Any], cluster_id: str) -> None:
    cid = normalize_inventory_cluster_id(cluster_id)
    clusters_root = _clusters_root(project)
    leaf = _assert_inside(
        inventory_leaf_path(clusters_root, cid), clusters_root, "inventory leaf"
    )
    if leaf.exists():
        shutil.rmtree(leaf)
    workspace_parent = _workspace_parent(project)
    if workspace_parent is None:
        return
    try:
        ws = cluster_workspace_leaf(workspace_parent, cid)
    except ValueError:
        return
    try:
        resolved = _assert_inside(ws, workspace_parent, "workspace")
    except AtlasClustersError:
        return
    if resolved.exists():
        shutil.rmtree(resolved)


def patch_cluster_display_name(
    project: Mapping[str, Any], cluster_id: str, display_name: str
) -> dict[str, Any]:
    cid = _require_owned(project, cluster_id)
    name = str(display_name or "").strip()
    if not name:
        raise AtlasClustersError(400, "displayName is required")
    clusters_root = _clusters_root(project)
    leaf = inventory_leaf_path(clusters_root, cid)
    path = leaf / CLUSTER_CONFIG_NAME
    if not path.is_file():
        raise AtlasClustersError(404, f"cluster.yaml not found for {cid}")
    from ruamel.yaml import YAML

    yaml = YAML()
    yaml.preserve_quotes = True
    yaml.width = 4096
    yaml.indent(mapping=2, sequence=4, offset=2)
    try:
        data = yaml.load(path.read_text(encoding="utf-8")) or {}
    except OSError as exc:
        raise AtlasClustersError(400, f"cluster.yaml is unreadable") from exc
    if not isinstance(data, dict):
        raise AtlasClustersError(400, "cluster.yaml is not a mapping")
    data["display_name"] = name
    buf = StringIO()
    yaml.dump(data, buf)
    text = buf.getvalue()
    if not text.endswith("\n"):
        text += "\n"
    path.write_text(text, encoding="utf-8")
    workspace_parent = _workspace_parent(project)
    archived = cid in set(atlas_archived_cluster_ids(project))
    return describe_cluster(
        cid,
        clusters_root=clusters_root,
        workspace_parent=workspace_parent,
        archived=archived,
    )
