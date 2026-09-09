"""Read hub/worker rotating logs for GET /api/server_logs."""
from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)

SERVICE_FILES = {
    "hub": "hub.log",
    "worker": "worker.log",
}
SERVICE_ALIASES = {
    "backend": "hub",
}

SENSITIVE_KEYS = [
    "password",
    "passphrase",
    "token",
    "secret",
    "privatekey",
    "private_key",
    "ansible_ssh_pass",
    "global_secrets_encryption_key",
]


class ServerLogsHttpError(Exception):
    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.message = message


def parse_log_timestamp(ts_str: Optional[str]) -> Optional[datetime]:
    if not ts_str:
        return None
    ts_str = ts_str.strip().replace(",", ".").replace("T", " ").replace("Z", "")
    if not ts_str:
        return None
    for fmt, width in (
        ("%Y-%m-%d %H:%M:%S.%f", 26),
        ("%Y-%m-%d %H:%M:%S", 19),
        ("%Y-%m-%d %H:%M", 16),
    ):
        try:
            return datetime.strptime(ts_str[:width], fmt)
        except (ValueError, TypeError):
            continue
    try:
        return datetime.strptime(ts_str[:19], "%Y-%m-%d %H:%M:%S")
    except (ValueError, TypeError):
        return None


def _redact(text: str) -> str:
    redacted = text
    for key in SENSITIVE_KEYS:
        redacted = re.sub(
            rf"({key}\s*[:=]\s*)([^\s'\"]+)",
            r"\1***REDACTED***",
            redacted,
            flags=re.IGNORECASE,
        )
    return re.sub(
        r"-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----",
        "-----BEGIN ***REDACTED***-----\n***REDACTED***\n-----END ***REDACTED***-----",
        redacted,
    )


def _resolve_services(service: str) -> list[str]:
    raw = (service or "all").strip() or "all"
    if raw == "all":
        return list(SERVICE_FILES.keys())
    names: list[str] = []
    for part in raw.split(","):
        name = SERVICE_ALIASES.get(part.strip(), part.strip())
        if name and name not in names:
            names.append(name)
    return names


def list_server_logs(
    data_dir: Path,
    *,
    lines: int = 1000,
    service: str = "all",
    level: str = "all",
    search: str = "",
    date_from: str = "",
    date_to: str = "",
) -> dict[str, Any]:
    try:
        lines = int(lines)
    except (TypeError, ValueError):
        lines = 1000
    lines = max(1, min(lines, 50000))
    date_from_str = (date_from or "").strip()
    date_to_str = (date_to or "").strip()
    date_from_dt = parse_log_timestamp(date_from_str) if date_from_str else None
    date_to_dt = parse_log_timestamp(date_to_str) if date_to_str else None
    if date_to_dt and len(date_to_str) <= 16:
        date_to_dt = date_to_dt + timedelta(seconds=59, milliseconds=999)
    if date_from_dt or date_to_dt:
        lines = min(max(lines * 10, 5000), 50000)

    log_dir = Path(data_dir) / "logs"
    search_l = (search or "").strip().lower()
    level_filter = (level or "all").strip() or "all"
    entries: list[dict[str, Any]] = []

    for svc in _resolve_services(service):
        filename = SERVICE_FILES.get(svc)
        if not filename:
            continue
        log_file = log_dir / filename
        if not log_file.exists():
            continue
        try:
            file_lines = log_file.read_text(encoding="utf-8", errors="ignore").splitlines()
        except OSError as exc:
            logger.error("Error reading %s logs: %s", svc, exc)
            continue
        recent = file_lines[-lines:] if len(file_lines) > lines else file_lines
        start = len(file_lines) - len(recent) + 1
        for line_num, line in enumerate(recent, start=start):
            line = line.rstrip("\n\r")
            if not line:
                continue
            entry: dict[str, Any] = {
                "service": svc,
                "raw": line,
                "timestamp": None,
                "level": "INFO",
                "message": line,
                "line_number": line_num,
            }
            timestamp_match = re.match(
                r"\[(\d{4}-\d{2}-\d{2}[\s,]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?)\]",
                line,
            )
            if timestamp_match:
                entry["timestamp"] = timestamp_match.group(1)
                remaining = line[timestamp_match.end() :].strip()
                level_match = re.match(
                    r"(ERROR|WARNING|WARN|INFO|DEBUG|CRITICAL|FATAL)\s*(?:in\s+\w+)?:?\s*(.*)",
                    remaining,
                    re.IGNORECASE,
                )
                if level_match:
                    parsed = level_match.group(1).upper()
                    if parsed == "WARN":
                        parsed = "WARNING"
                    entry["level"] = parsed
                    entry["message"] = level_match.group(2) or remaining
                else:
                    entry["message"] = remaining
            if date_from_dt is not None or date_to_dt is not None:
                log_dt = parse_log_timestamp(entry["timestamp"]) if entry["timestamp"] else None
                if log_dt is None:
                    continue
                if date_from_dt is not None and log_dt < date_from_dt:
                    continue
                if date_to_dt is not None and log_dt > date_to_dt:
                    continue
            if level_filter != "all":
                want = level_filter.upper()
                have = str(entry["level"]).upper()
                if want not in have and have not in want:
                    continue
            if search_l and search_l not in line.lower():
                continue
            entries.append(entry)

    entries.sort(key=lambda item: item["timestamp"] or "")
    try:
        for entry in entries:
            entry["message"] = _redact(str(entry["message"]))
            entry["raw"] = _redact(str(entry["raw"]))
    except Exception:
        pass
    stats = {
        "error": sum(1 for item in entries if "ERROR" in str(item["level"])),
        "warning": sum(1 for item in entries if "WARNING" in str(item["level"])),
        "info": sum(1 for item in entries if item["level"] == "INFO"),
        "debug": sum(1 for item in entries if item["level"] == "DEBUG"),
    }
    return {"success": True, "logs": entries, "stats": stats, "total": len(entries)}
