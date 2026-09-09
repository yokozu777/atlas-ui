"""File-backed project list (shared by Flask and FastAPI)."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Optional

from project_kind import with_kind


def load_projects(config_file: Path) -> list[dict[str, Any]]:
    if not config_file.exists():
        return []
    try:
        with open(config_file, "r", encoding="utf-8") as handle:
            data = json.load(handle)
        projects = data.get("projects", [])
        return [with_kind(p) for p in projects if isinstance(p, dict)]
    except Exception:
        return []


def save_projects(config_file: Path, projects: list[dict[str, Any]]) -> bool:
    config_file.parent.mkdir(parents=True, exist_ok=True)
    data = {"projects": projects}
    with open(config_file, "w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=2, ensure_ascii=False)
    return True


def get_project(config_file: Path, project_id: str) -> Optional[dict[str, Any]]:
    for project in load_projects(config_file):
        if project.get("id") == project_id:
            return project
    return None
