"""File-backed project list (shared by Flask and FastAPI)."""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Mapping, Optional

from json_file_lock import load_json_file, update_json_file
from project_kind import (
    atlas_archived_cluster_ids,
    atlas_owned_cluster_ids,
    has_explicit_owned_cluster_ids,
    normalize_cluster_id_list,
    with_kind,
    with_owned_cluster_id,
)


def default_projects_config_file() -> Path:
    env = os.environ.get("DATA_DIR")
    if env and str(env).strip():
        return Path(str(env).strip()).expanduser().resolve() / "projects.json"
    here = Path(__file__).resolve().parent
    base = here.parent if here.name in {"backend", "hub"} else here
    return base / "data" / "projects.json"


def load_projects(config_file: Path) -> list[dict[str, Any]]:
    if not config_file.exists():
        return []
    try:
        data = load_json_file(config_file, default={"projects": []})
        if not isinstance(data, dict):
            return []
        projects = data.get("projects", [])
        return [with_kind(p) for p in projects if isinstance(p, dict)]
    except Exception:
        return []


def save_projects(config_file: Path, projects: list[dict[str, Any]]) -> bool:
    def mutator(data: dict[str, Any]) -> bool:
        data.clear()
        data["projects"] = projects
        return True

    update_json_file(config_file, mutator, default={})
    return True


def get_project(config_file: Path, project_id: str) -> Optional[dict[str, Any]]:
    for project in load_projects(config_file):
        if project.get("id") == project_id:
            return project
    return None


def persist_project_cluster_ids(
    config_file: Path, project_id: str, ids: list[str]
) -> Optional[dict[str, Any]]:
    project = get_project(config_file, project_id)
    archived = atlas_archived_cluster_ids(project or {})
    return persist_atlas_cluster_membership(config_file, project_id, ids, archived)


def persist_atlas_cluster_membership(
    config_file: Path,
    project_id: str,
    cluster_ids: list[str],
    archived_ids: list[str],
    *,
    cluster_id: Optional[str] = None,
    clear_cluster_id: bool = False,
) -> Optional[dict[str, Any]]:
    if not config_file.exists():
        return None

    found: Optional[dict[str, Any]] = None

    def mutator(data: Any) -> Optional[dict[str, Any]]:
        nonlocal found
        if not isinstance(data, dict):
            return None
        projects = [with_kind(p) for p in data.get("projects", []) if isinstance(p, dict)]
        owned = normalize_cluster_id_list(cluster_ids)
        owned_set = set(owned)
        archived = [
            cid for cid in normalize_cluster_id_list(archived_ids) if cid in owned_set
        ]
        for project in projects:
            if project.get("id") != project_id:
                continue
            project["clusterIds"] = list(owned)
            project.pop("cluster_ids", None)
            project["archivedClusterIds"] = list(archived)
            project.pop("archived_cluster_ids", None)
            if clear_cluster_id:
                project.pop("cluster_id", None)
                project.pop("clusterId", None)
            elif cluster_id is not None:
                project["cluster_id"] = cluster_id
            found = project
            break
        if found is None:
            return None
        data["projects"] = projects
        return found

    update_json_file(config_file, mutator, default={"projects": []})
    return found


def cluster_ids_from_project_executions(project_id: str) -> list[str]:
    from executions_store import get_project_executions_dir

    directory = get_project_executions_dir(project_id)
    if not directory.is_dir():
        return []
    found: list[str] = []
    for path in sorted(directory.glob("*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        if not isinstance(data, dict):
            continue
        params = data.get("runParams") if isinstance(data.get("runParams"), dict) else {}
        cid = (
            params.get("cluster_id")
            or params.get("clusterId")
            or data.get("cluster_id")
            or data.get("clusterId")
        )
        if cid:
            found.append(str(cid))
    return normalize_cluster_id_list(found)


def ensure_atlas_owned_cluster_ids(
    config_file: Path, project_id: str, project: Mapping[str, Any]
) -> list[str]:
    if has_explicit_owned_cluster_ids(project):
        return atlas_owned_cluster_ids(project)
    ids = list(atlas_owned_cluster_ids(project))
    for cid in cluster_ids_from_project_executions(project_id):
        if cid not in ids:
            ids.append(cid)
    persist_project_cluster_ids(config_file, project_id, ids)
    return ids


def add_atlas_owned_cluster(
    config_file: Path, project_id: str, cluster_id: str
) -> list[str]:
    project = get_project(config_file, project_id) or {}
    ids = with_owned_cluster_id(project, cluster_id)
    cid = str(cluster_id or "").strip().replace("\\", "/")
    archived = [item for item in atlas_archived_cluster_ids(project) if item != cid]
    persist_atlas_cluster_membership(config_file, project_id, ids, archived)
    return ids
