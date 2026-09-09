"""Create a project (kind + disk layout). Used by FastAPI gateway."""
from __future__ import annotations

import time
import uuid
from pathlib import Path
from typing import Any, Mapping

from project_kind import (
    ProjectKindError,
    apply_create_fields,
    materialize_created_project,
    with_kind,
)
from projects_store import load_projects, save_projects


def create_project_record(
    body: Mapping[str, Any],
    *,
    username: str,
    config_file: Path,
    projects_dir: Path,
) -> dict[str, Any]:
    name = str(body.get("name") or "").strip()
    if not name:
        raise ProjectKindError("Project name is required")
    kind_fields = apply_create_fields(dict(body))
    projects = load_projects(config_file)
    if any(p.get("name") == name and not p.get("isArchived") for p in projects):
        raise ProjectKindError("Project with this name already exists")
    project: dict[str, Any] = {
        "id": str(uuid.uuid4()),
        "name": name,
        "description": str(body.get("description") or "").strip(),
        "createdAt": time.time(),
        "updatedAt": time.time(),
        "createdBy": username or "current_user",
        "isArchived": False,
        **kind_fields,
    }
    projects.append(project)
    save_projects(config_file, projects)
    materialize_created_project(projects_dir / project["id"], project)
    return {"success": True, "project": with_kind(project)}
