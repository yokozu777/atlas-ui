"""Project autosync GET/PUT for FastAPI (no Flask)."""
from __future__ import annotations

import time
from typing import Any, Optional

from sources_http import load_project_config, save_project_config


class AutosyncHttpError(Exception):
    def __init__(self, status_code: int, message: str, error_code: Optional[str] = None):
        super().__init__(message)
        self.status_code = status_code
        self.message = message
        self.error_code = error_code


DEFAULT_AUTOSYNC = {
    "enabled": False,
    "direction": "pull",
    "sourceKeys": [],
    "intervalSeconds": 3600,
    "lastRunAt": None,
    "nextRunAt": None,
    "lastStatus": None,
    "lastError": None,
}


def get_autosync(project_id: str) -> dict[str, Any]:
    config = load_project_config(project_id)
    autosync = config.get("autosync") or {}
    if not isinstance(autosync, dict):
        autosync = {}
    result = {**DEFAULT_AUTOSYNC, **autosync}
    return {"success": True, "autosync": result}


def update_autosync(project_id: str, body: dict[str, Any]) -> dict[str, Any]:
    direction = body.get("direction", "pull")
    if direction not in ("push", "pull", "both"):
        raise AutosyncHttpError(
            400,
            "Invalid direction. Must be push, pull, or both",
            error_code="INVALID_DIRECTION",
        )
    interval_seconds = body.get("intervalSeconds", 3600)
    if not isinstance(interval_seconds, int) or interval_seconds < 60:
        raise AutosyncHttpError(
            400,
            "intervalSeconds must be an integer >= 60",
            error_code="INVALID_INTERVAL",
        )
    source_keys = body.get("sourceKeys", [])
    if not isinstance(source_keys, list):
        raise AutosyncHttpError(
            400,
            "sourceKeys must be a list",
            error_code="INVALID_SOURCE_KEYS",
        )
    config = load_project_config(project_id)
    autosync = config.get("autosync") if isinstance(config.get("autosync"), dict) else {}
    enabled = bool(body.get("enabled", False))
    autosync["enabled"] = enabled
    autosync["direction"] = direction
    autosync["sourceKeys"] = source_keys
    autosync["intervalSeconds"] = interval_seconds
    if enabled:
        current_time = int(time.time())
        next_run_at = autosync.get("nextRunAt")
        if not next_run_at or next_run_at <= current_time:
            autosync["nextRunAt"] = current_time + interval_seconds
    else:
        autosync["nextRunAt"] = None
    config["autosync"] = autosync
    save_project_config(project_id, config)
    return {"success": True, "autosync": autosync}
