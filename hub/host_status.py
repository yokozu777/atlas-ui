"""Persist host check results next to the project (no in-memory Flask cache)."""
from __future__ import annotations

import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from executions_store import get_project_dir

TTL_SECONDS = 300


def ttl_seconds() -> int:
    try:
        from execution_settings_http import HOST_STATUS_TTL_DEFAULT, load_execution_settings

        raw = os.environ.get("DATA_DIR")
        if not raw:
            return TTL_SECONDS
        data_dir = Path(raw).expanduser()
        settings = load_execution_settings(data_dir)
        return int(settings.get("host_status_ttl_seconds") or HOST_STATUS_TTL_DEFAULT)
    except Exception:
        return TTL_SECONDS


def _status_file(project_id: str) -> Path:
    path = get_project_dir(project_id) / "host_status.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def _parse_expires_at(value: Any) -> Optional[float]:
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip()
    if not text:
        return None
    try:
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        return datetime.fromisoformat(text).timestamp()
    except ValueError:
        return None


def get_host_statuses(project_id: str) -> dict[str, dict[str, Any]]:
    if not project_id:
        return {}
    status_file = get_project_dir(project_id) / "host_status.json"
    if not status_file.exists():
        return {}
    try:
        existing = json.loads(status_file.read_text(encoding="utf-8")) or {}
    except Exception:
        return {}
    hosts_map = existing.get("hosts") or {}
    if not isinstance(hosts_map, dict):
        return {}
    now_ts = time.time()
    out: dict[str, dict[str, Any]] = {}
    for name, row in hosts_map.items():
        if not name or not isinstance(row, dict):
            continue
        expires = _parse_expires_at(row.get("status_expires_at"))
        status = str(row.get("status") or "unknown")
        if expires is not None and expires < now_ts:
            status = "unknown"
        out[str(name)] = {
            "status": status,
            "last_checked_at": row.get("last_checked_at"),
        }
    return out


def set_host_check_status(project_id: str, host: str, status: str) -> None:
    if not project_id or not host:
        return
    now_ts = time.time()
    expires_at_ts = now_ts + ttl_seconds()
    status_file = _status_file(project_id)
    existing: dict[str, Any] = {}
    if status_file.exists():
        try:
            existing = json.loads(status_file.read_text(encoding="utf-8")) or {}
        except Exception:
            existing = {}
    hosts_map = existing.get("hosts") or {}
    hosts_map[host] = {
        "status": status,
        "last_checked_at": datetime.fromtimestamp(now_ts, tz=timezone.utc)
        .isoformat()
        .replace("+00:00", "Z"),
        "status_expires_at": datetime.fromtimestamp(expires_at_ts, tz=timezone.utc)
        .isoformat()
        .replace("+00:00", "Z"),
    }
    status_file.write_text(
        json.dumps({"hosts": hosts_map}, indent=2) + "\n",
        encoding="utf-8",
    )
