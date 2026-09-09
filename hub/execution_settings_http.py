"""execution_settings.json load/save, retention, stats, hub log level."""
from __future__ import annotations

import json
import logging
import shutil
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Any, Optional

from execution_cleanup import cleanup_generated_playbooks_for_execution
from executions_http import list_executions
from executions_store import PROJECTS_DIR, get_project_dir, get_project_executions_dir

logger = logging.getLogger(__name__)

VALID_LOG_LEVELS = {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}
HOST_STATUS_TTL_DEFAULT = 300
UNIFIED_LOG_FORMAT = "[%(asctime)s] %(levelname)s: %(message)s"
LOG_LEVEL_MAP = {
    "DEBUG": logging.DEBUG,
    "INFO": logging.INFO,
    "WARNING": logging.WARNING,
    "ERROR": logging.ERROR,
    "CRITICAL": logging.CRITICAL,
}

DEFAULT_SETTINGS: dict[str, Any] = {
    "save_history": True,
    "retention_mode": "count",
    "retention_count": 200,
    "retention_size_mb": 200,
    "debug_mode": False,
    "log_level": "INFO",
    "max_upload_size_mb": 10,
    "max_log_size_mb": 10,
    "host_status_ttl_seconds": HOST_STATUS_TTL_DEFAULT,
}


class ExecutionSettingsHttpError(Exception):
    def __init__(self, status_code: int, message: str, error_code: Optional[str] = None):
        super().__init__(message)
        self.status_code = status_code
        self.message = message
        self.error_code = error_code


def settings_file(data_dir: Path) -> Path:
    return Path(data_dir) / "execution_settings.json"


def load_execution_settings(data_dir: Path) -> dict[str, Any]:
    path = settings_file(data_dir)
    try:
        if path.exists():
            raw = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(raw, dict):
                return {**DEFAULT_SETTINGS, **raw}
    except (OSError, json.JSONDecodeError) as exc:
        logger.error("Error loading execution settings: %s", exc)
    return dict(DEFAULT_SETTINGS)


def save_execution_settings(data_dir: Path, settings: dict[str, Any]) -> None:
    path = settings_file(data_dir)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(settings, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def apply_hub_log_level(level_name: str) -> None:
    name = (level_name or "INFO").upper()
    if name not in VALID_LOG_LEVELS:
        name = "INFO"
    level = LOG_LEVEL_MAP[name]
    root = logging.getLogger()
    root.setLevel(level)
    for handler in root.handlers:
        handler.setLevel(level)
    logger.info("Log level changed to: %s", name)


def configure_hub_file_logging(data_dir: Path) -> None:
    settings = load_execution_settings(data_dir)
    log_dir = Path(data_dir) / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    log_file = log_dir / "hub.log"
    max_mb = int(settings.get("max_log_size_mb") or 10)
    max_mb = max(1, min(max_mb, 1024))
    level_name = str(settings.get("log_level") or "INFO").upper()
    if settings.get("debug_mode"):
        level_name = "DEBUG"
    if level_name not in VALID_LOG_LEVELS:
        level_name = "INFO"
    level = LOG_LEVEL_MAP[level_name]
    formatter = logging.Formatter(UNIFIED_LOG_FORMAT, datefmt="%Y-%m-%d %H:%M:%S")
    root = logging.getLogger()
    for existing in list(root.handlers):
        if getattr(existing, "_atlas_hub_file", False):
            root.removeHandler(existing)
            existing.close()
    handler = RotatingFileHandler(
        log_file,
        encoding="utf-8",
        maxBytes=max_mb * 1024 * 1024,
        backupCount=5,
    )
    handler.setLevel(level)
    handler.setFormatter(formatter)
    handler._atlas_hub_file = True  # type: ignore[attr-defined]
    root.addHandler(handler)
    root.setLevel(level)
    for other in root.handlers:
        if other is not handler:
            other.setLevel(level)


def _logs_dir(project_id: str) -> Path:
    return get_project_dir(project_id) / "history" / "logs"


def delete_execution(execution_id: str, project_id: str) -> bool:
    try:
        cleanup_generated_playbooks_for_execution(project_id, execution_id)
    except Exception as exc:
        logger.debug("cleanup generated playbooks for %s: %s", execution_id, exc)
    executions_dir = get_project_executions_dir(project_id)
    execution_file = executions_dir / f"{execution_id}.json"
    log_file = _logs_dir(project_id) / f"{execution_id}.log"
    deleted = False
    if execution_file.exists():
        execution_file.unlink()
        deleted = True
    if log_file.exists():
        log_file.unlink()
        deleted = True
    return deleted


def _iter_project_ids() -> list[str]:
    if not PROJECTS_DIR.exists():
        return []
    return [path.name for path in PROJECTS_DIR.iterdir() if path.is_dir()]


def execution_size_bytes(project_id: str, execution_id: str) -> int:
    size = 0
    execution_file = get_project_executions_dir(project_id) / f"{execution_id}.json"
    log_file = _logs_dir(project_id) / f"{execution_id}.log"
    if execution_file.exists():
        size += execution_file.stat().st_size
    if log_file.exists():
        size += log_file.stat().st_size
    return size


def get_execution_stats(project_id: Optional[str] = None) -> dict[str, Any]:
    total_count = 0
    total_size = 0
    ids = [project_id] if project_id else _iter_project_ids()
    for pid in ids:
        if not pid:
            continue
        try:
            rows = list_executions(pid)
        except Exception as exc:
            logger.warning("Error getting stats for project %s: %s", pid, exc)
            continue
        total_count += len(rows)
        for row in rows:
            exec_id = row.get("id")
            if exec_id:
                total_size += execution_size_bytes(pid, str(exec_id))
    return {"count": total_count, "size_mb": round(total_size / (1024 * 1024), 2)}


def apply_retention_policy(data_dir: Path) -> None:
    settings = load_execution_settings(data_dir)
    if not settings.get("save_history", True):
        return
    mode = settings.get("retention_mode") or "count"
    for project_id in _iter_project_ids():
        try:
            executions = list_executions(project_id)
            if mode == "count":
                max_count = int(settings.get("retention_count") or 200)
                if len(executions) > max_count:
                    to_delete = executions[max_count:]
                    for row in to_delete:
                        delete_execution(str(row["id"]), project_id)
                    logger.info(
                        "Retention policy (project %s): deleted %s old executions",
                        project_id,
                        len(to_delete),
                    )
            elif mode == "size":
                max_size_bytes = int(settings.get("retention_size_mb") or 200) * 1024 * 1024
                total_size = 0
                sized: list[tuple[dict[str, Any], int]] = []
                for row in executions:
                    exec_id = str(row.get("id") or "")
                    size = execution_size_bytes(project_id, exec_id)
                    sized.append((row, size))
                    total_size += size
                if total_size > max_size_bytes:
                    sized.sort(key=lambda item: item[0].get("createdAt") or 0)
                    deleted_count = 0
                    for row, size in sized:
                        if total_size <= max_size_bytes:
                            break
                        delete_execution(str(row["id"]), project_id)
                        total_size -= size
                        deleted_count += 1
                    logger.info(
                        "Retention policy (project %s): deleted %s executions by size",
                        project_id,
                        deleted_count,
                    )
        except Exception as exc:
            logger.warning("Error applying retention for project %s: %s", project_id, exc)


def clear_all_executions(project_id: Optional[str] = None) -> int:
    deleted = 0
    ids = [project_id] if project_id else _iter_project_ids()
    for pid in ids:
        if not pid:
            continue
        executions_dir = get_project_executions_dir(pid)
        if not executions_dir.exists():
            continue
        for execution_file in list(executions_dir.glob("*.json")):
            if delete_execution(execution_file.stem, pid):
                deleted += 1
        logs_dir = _logs_dir(pid)
        if logs_dir.exists():
            shutil.rmtree(logs_dir, ignore_errors=True)
            logs_dir.mkdir(parents=True, exist_ok=True)
    return deleted


def _clamp_int(value: Any, default: int, minimum: int, maximum: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        parsed = default
    return max(minimum, min(parsed, maximum))


def update_execution_settings(data_dir: Path, body: dict[str, Any]) -> dict[str, Any]:
    settings = load_execution_settings(data_dir)
    incoming = dict(body or {})
    if "save_history" in incoming:
        settings["save_history"] = bool(incoming["save_history"])
    if "retention_mode" in incoming:
        mode = str(incoming["retention_mode"] or "count")
        settings["retention_mode"] = mode if mode in {"count", "size"} else "count"
    if "retention_count" in incoming:
        settings["retention_count"] = _clamp_int(incoming["retention_count"], 200, 1, 100000)
    if "retention_size_mb" in incoming:
        settings["retention_size_mb"] = _clamp_int(incoming["retention_size_mb"], 200, 1, 10240)
    if "debug_mode" in incoming:
        settings["debug_mode"] = bool(incoming["debug_mode"])
    if "log_level" in incoming:
        level = str(incoming["log_level"] or "INFO").upper()
        settings["log_level"] = level if level in VALID_LOG_LEVELS else "INFO"
    if "log_level" in incoming or "debug_mode" in incoming:
        apply_hub_log_level("DEBUG" if settings["debug_mode"] else settings["log_level"])
    if "max_upload_size_mb" in incoming:
        settings["max_upload_size_mb"] = _clamp_int(incoming["max_upload_size_mb"], 10, 1, 1024)
    if "max_log_size_mb" in incoming:
        settings["max_log_size_mb"] = _clamp_int(incoming["max_log_size_mb"], 10, 1, 1024)
    if "host_status_ttl_seconds" in incoming:
        settings["host_status_ttl_seconds"] = _clamp_int(
            incoming["host_status_ttl_seconds"],
            HOST_STATUS_TTL_DEFAULT,
            30,
            86400,
        )
    save_execution_settings(data_dir, settings)
    apply_retention_policy(data_dir)
    return {"success": True, "settings": load_execution_settings(data_dir), "stats": get_execution_stats()}
