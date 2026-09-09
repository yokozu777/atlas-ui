"""Project backup settings and tar.gz archives for FastAPI (no Flask)."""
from __future__ import annotations

import json
import logging
import os
import tarfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from executions_store import get_project_dir

logger = logging.getLogger(__name__)

DEFAULT_SETTINGS: dict[str, Any] = {
    "max_depth": 100,
    "projects": {},
}


class BackupHttpError(Exception):
    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.message = message


def settings_file(data_dir: Path) -> Path:
    return Path(data_dir) / "backup_settings.json"


def archives_root(data_dir: Path) -> Path:
    path = Path(data_dir) / "backups" / "archives"
    path.mkdir(parents=True, exist_ok=True)
    return path


def load_backup_settings(data_dir: Path) -> dict[str, Any]:
    path = settings_file(data_dir)
    try:
        if path.exists():
            raw = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(raw, dict):
                merged = {**DEFAULT_SETTINGS, **raw}
                if not isinstance(merged.get("projects"), dict):
                    merged["projects"] = {}
                try:
                    merged["max_depth"] = max(1, int(merged.get("max_depth") or 100))
                except (TypeError, ValueError):
                    merged["max_depth"] = 100
                return merged
    except (OSError, json.JSONDecodeError) as exc:
        logger.error("Error loading backup settings: %s", exc)
    return {
        "max_depth": DEFAULT_SETTINGS["max_depth"],
        "projects": {},
    }


def save_backup_settings(data_dir: Path, settings: dict[str, Any]) -> dict[str, Any]:
    path = settings_file(data_dir)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(settings, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return settings


def get_backup_settings(data_dir: Path) -> dict[str, Any]:
    return {"success": True, "settings": load_backup_settings(data_dir)}


def update_backup_settings(data_dir: Path, body: dict[str, Any]) -> dict[str, Any]:
    settings = load_backup_settings(data_dir)
    if "max_depth" in body:
        try:
            max_depth = int(body.get("max_depth"))
        except (TypeError, ValueError) as exc:
            raise BackupHttpError(400, "Backup depth must be an integer") from exc
        if max_depth < 1:
            raise BackupHttpError(400, "Backup depth must be greater than 0")
        settings["max_depth"] = max_depth
    if "projects" in body:
        incoming = body.get("projects")
        if not isinstance(incoming, dict):
            raise BackupHttpError(400, "Invalid projects settings format")
        projects = settings.setdefault("projects", {})
        if not isinstance(projects, dict):
            projects = {}
            settings["projects"] = projects
        for project_id, project_settings in incoming.items():
            if not isinstance(project_settings, dict):
                continue
            projects[str(project_id)] = {
                "enabled": bool(project_settings.get("enabled", False)),
            }
    save_backup_settings(data_dir, settings)
    return {"success": True, "settings": settings}


def project_backup_enabled(data_dir: Path, project_id: str) -> bool:
    settings = load_backup_settings(data_dir)
    row = (settings.get("projects") or {}).get(project_id) or {}
    return bool(row.get("enabled", False))


def cleanup_old_archives(archive_dir: Path, max_depth: int) -> None:
    if not archive_dir.exists():
        return
    files = sorted(archive_dir.glob("*.tar.gz"), key=lambda item: item.stat().st_mtime, reverse=True)
    if len(files) <= max_depth:
        return
    for stale in files[max_depth:]:
        try:
            stale.unlink()
        except OSError as exc:
            logger.error("Error deleting old archive %s: %s", stale, exc)


def _require_project_dir(project_id: str) -> Path:
    project_id = str(project_id or "").strip()
    if not project_id:
        raise BackupHttpError(400, "Project ID is required")
    if ".." in project_id or "/" in project_id or "\\" in project_id:
        raise BackupHttpError(400, "Invalid project id")
    project_dir = get_project_dir(project_id)
    if not project_dir.exists():
        raise BackupHttpError(404, "Project directory not found")
    return project_dir


def _archive_filename(path: Optional[str]) -> str:
    raw = str(path or "").strip()
    if not raw or ".." in raw:
        raise BackupHttpError(400, "Invalid archive path")
    name = raw.split("/")[-1] if "/" in raw else raw
    if not name.endswith(".tar.gz") or "/" in name or "\\" in name:
        raise BackupHttpError(400, "Invalid archive path")
    return name


def _archive_file(data_dir: Path, project_id: str, path: Optional[str]) -> Path:
    name = _archive_filename(path)
    root = archives_root(data_dir).resolve()
    archive_path = (root / project_id / name).resolve()
    if not str(archive_path).startswith(str(root) + os.sep):
        raise BackupHttpError(400, "Invalid archive path")
    if not archive_path.is_file():
        raise BackupHttpError(404, "Archive not found")
    return archive_path


def create_project_archive(
    data_dir: Path, project_id: str, reason: str = "manual"
) -> dict[str, Any]:
    project_dir = _require_project_dir(project_id)
    reason = str(reason or "manual").strip() or "manual"
    if reason != "manual" and not project_backup_enabled(data_dir, project_id):
        raise BackupHttpError(400, "Automatic backup is not enabled for this project")
    archives_dir = archives_root(data_dir) / project_id
    archives_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    archive_name = f"{timestamp}.tar.gz"
    archive_path = archives_dir / archive_name
    file_count = 0
    with tarfile.open(archive_path, "w:gz") as tf:
        for item in project_dir.rglob("*"):
            if not item.is_file():
                continue
            tf.add(item, arcname=str(item.relative_to(project_dir)))
            file_count += 1
    settings = load_backup_settings(data_dir)
    cleanup_old_archives(archives_dir, int(settings.get("max_depth") or 100))
    return {
        "success": True,
        "message": "Backup created successfully",
        "archive": archive_name,
        "path": f"archives/{project_id}/{archive_name}",
        "files_count": file_count,
    }


def list_project_archives(data_dir: Path, project_id: str) -> dict[str, Any]:
    _require_project_dir(project_id)
    archives_dir = archives_root(data_dir) / project_id
    archives: list[dict[str, Any]] = []
    if archives_dir.exists():
        for item in sorted(archives_dir.glob("*.tar.gz"), key=lambda row: row.stat().st_mtime, reverse=True):
            stat = item.stat()
            archives.append(
                {
                    "name": item.name,
                    "path": f"archives/{project_id}/{item.name}",
                    "size": stat.st_size,
                    "modified": stat.st_mtime,
                }
            )
    return {"success": True, "archives": archives}


def restore_project_archive(data_dir: Path, project_id: str, path: Optional[str]) -> dict[str, Any]:
    project_dir = _require_project_dir(project_id)
    archive_path = _archive_file(data_dir, project_id, path)
    project_dir.mkdir(parents=True, exist_ok=True)
    with tarfile.open(archive_path, "r:gz") as tf:
        try:
            tf.extractall(path=project_dir, filter="data")
        except TypeError:
            dest = project_dir.resolve()
            for member in tf.getmembers():
                target = (dest / member.name).resolve()
                if dest != target and not str(target).startswith(str(dest) + os.sep):
                    raise BackupHttpError(400, "Archive contains an unsafe path")
            tf.extractall(path=project_dir)
    return {"success": True, "message": "Project restored successfully"}


def download_archive_path(data_dir: Path, project_id: str, path: Optional[str]) -> Path:
    _require_project_dir(project_id)
    return _archive_file(data_dir, project_id, path)
