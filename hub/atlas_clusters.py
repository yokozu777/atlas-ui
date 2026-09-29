"""Atlas project cluster membership, catalog metadata, and optional disk purge."""
from __future__ import annotations

import json
import logging
import shutil
from datetime import datetime
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
from json_file_lock import update_json_file
from projects_store import (
    persist_atlas_cluster_membership,
)

logger = logging.getLogger(__name__)


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


def _as_epoch(value: Any) -> Optional[float]:
    if isinstance(value, bool):
        return None
    number: Optional[float] = None
    if isinstance(value, (int, float)):
        number = float(value)
    elif isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        try:
            number = float(text)
        except ValueError:
            try:
                parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
            except ValueError:
                return None
            number = parsed.timestamp()
    if number is None or number <= 0:
        return None
    if number > 1e12:
        number = number / 1000.0
    return number


def _created_stamp_path(project_id: str) -> Path:
    from executions_store import get_project_dir

    return get_project_dir(project_id) / "history" / "cluster-created.json"


def load_created_stamps(project_id: str) -> dict[str, float]:
    if not project_id:
        return {}
    path = _created_stamp_path(project_id)
    if not path.is_file():
        return {}
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    if not isinstance(raw, dict):
        return {}
    stamps: dict[str, float] = {}
    for key, value in raw.items():
        epoch = _as_epoch(value)
        if epoch is not None:
            stamps[str(key)] = epoch
    return stamps


def remember_created_stamps(project_id: str, fresh: Mapping[str, float]) -> None:
    """Freeze the first observed cluster.yaml time so later edits do not move it."""
    if not project_id or not fresh:
        return
    from executions_store import get_project_dir

    root = get_project_dir(project_id)
    if not root.is_dir():
        return

    def mutator(data: Any) -> None:
        if not isinstance(data, dict):
            return None
        for cid, epoch in fresh.items():
            if _as_epoch(data.get(cid)) is None and epoch > 0:
                data[cid] = epoch
        return None

    try:
        update_json_file(
            root / "history" / "cluster-created.json", mutator, default={}
        )
    except (OSError, json.JSONDecodeError):
        logger.warning("cluster created stamp was not saved", exc_info=True)


def filesystem_created_epoch(leaf: Path) -> Optional[float]:
    """When cluster.yaml appeared on disk. Linux has no birth time in Python stat."""
    cfg = leaf / CLUSTER_CONFIG_NAME
    target = cfg if cfg.is_file() else leaf if leaf.is_dir() else None
    if target is None:
        return None
    try:
        st = target.stat()
    except OSError:
        return None
    birth = float(getattr(st, "st_birthtime", 0) or 0)
    if birth > 0:
        return birth
    changed = float(st.st_ctime or 0)
    return changed if changed > 0 else None


def _execution_cluster_id(data: Mapping[str, Any]) -> Optional[str]:
    params = data.get("runParams") if isinstance(data.get("runParams"), dict) else {}
    raw = (
        params.get("cluster_id")
        or params.get("clusterId")
        or data.get("cluster_id")
        or data.get("clusterId")
    )
    text = str(raw or "").strip()
    if not text:
        return None
    try:
        return normalize_inventory_cluster_id(text)
    except InspectError:
        return None


def _execution_moment(data: Mapping[str, Any]) -> Optional[float]:
    best: Optional[float] = None
    for key in ("finishedAt", "startedAt", "queuedAt", "createdAt", "statusUpdatedAt"):
        moment = _as_epoch(data.get(key))
        if moment is not None and (best is None or moment > best):
            best = moment
    return best


def execution_stats_by_cluster(project_id: str) -> dict[str, dict[str, Any]]:
    from executions_store import get_project_executions_dir

    if not project_id:
        return {}
    directory = get_project_executions_dir(project_id)
    if not directory.is_dir():
        return {}
    stats: dict[str, dict[str, Any]] = {}
    for path in directory.glob("*.json"):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if not isinstance(data, dict):
            continue
        cid = _execution_cluster_id(data)
        if not cid:
            continue
        bucket = stats.get(cid)
        if bucket is None:
            bucket = {"runCount": 0, "successCount": 0, "lastRunAt": None}
            stats[cid] = bucket
        bucket["runCount"] += 1
        if str(data.get("status") or "").upper() == "SUCCESS":
            bucket["successCount"] += 1
        moment = _execution_moment(data)
        last = bucket.get("lastRunAt")
        if moment is not None and (not isinstance(last, (int, float)) or moment > last):
            bucket["lastRunAt"] = moment
    return stats


def _activity_fields(activity: Optional[Mapping[str, Any]]) -> dict[str, Any]:
    src = activity or {}

    def count(key: str) -> int:
        try:
            value = int(src.get(key) or 0)
        except (TypeError, ValueError):
            return 0
        return value if value > 0 else 0

    return {
        "createdAt": _as_epoch(src.get("createdAt")),
        "runCount": count("runCount"),
        "successCount": count("successCount"),
        "lastRunAt": _as_epoch(src.get("lastRunAt")),
    }


def _activity_for_cluster(project_id: str, cid: str, leaf: Path) -> dict[str, Any]:
    stamps = load_created_stamps(project_id)
    created = stamps.get(cid)
    if created is None:
        created = filesystem_created_epoch(leaf)
        if created is not None:
            remember_created_stamps(project_id, {cid: created})
    bucket = execution_stats_by_cluster(project_id).get(cid, {})
    return {
        "createdAt": created,
        "runCount": bucket.get("runCount", 0),
        "successCount": bucket.get("successCount", 0),
        "lastRunAt": bucket.get("lastRunAt"),
    }


def describe_cluster(
    cluster_id: str,
    *,
    clusters_root: Path,
    workspace_parent: Optional[Path],
    archived: bool,
    project_id: str = "",
    activity: Optional[Mapping[str, Any]] = None,
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
    if activity is None:
        activity = _activity_for_cluster(project_id, cid, leaf)
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
        **_activity_fields(activity),
    }


def list_project_clusters(project: Mapping[str, Any]) -> dict[str, Any]:
    clusters_root = _clusters_root(project)
    workspace_parent = _workspace_parent(project)
    owned = atlas_owned_cluster_ids(project)
    archived = set(atlas_archived_cluster_ids(project))
    project_id = str(project.get("id") or "").strip()
    stats = execution_stats_by_cluster(project_id)
    stamps = load_created_stamps(project_id)
    fresh: dict[str, float] = {}
    prepared: list[tuple[str, Optional[float]]] = []
    for cid in owned:
        created = stamps.get(cid)
        if created is None:
            created = filesystem_created_epoch(
                inventory_leaf_path(clusters_root, cid)
            )
            if created is not None:
                fresh[cid] = created
        prepared.append((cid, created))
    remember_created_stamps(project_id, fresh)
    rows = [
        describe_cluster(
            cid,
            clusters_root=clusters_root,
            workspace_parent=workspace_parent,
            archived=cid in archived,
            activity={
                "createdAt": created,
                "runCount": stats.get(cid, {}).get("runCount", 0),
                "successCount": stats.get(cid, {}).get("successCount", 0),
                "lastRunAt": stats.get(cid, {}).get("lastRunAt"),
            },
        )
        for cid, created in prepared
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
        project_id=str(project.get("id") or ""),
    )
