#!/usr/bin/env python3
"""Hub-side recovery for stuck CANCELING executions.

Worker normally transitions CANCELING → CANCELED via finish_execution. If the
worker dies or hangs after stop, the hub sweeper force-finalizes after a timeout.
"""
from __future__ import annotations

import json
import logging
import os
import time
from typing import Optional

from executions_store import (
    PROJECTS_DIR,
    append_execution_log,
    get_project_executions_dir,
    update_execution_record,
)

logger = logging.getLogger(__name__)

DEFAULT_MAX_CANCEL_MINUTES = 5.0
DEFAULT_RECOVERY_INTERVAL_SEC = 30.0


def cancel_timeout_minutes(raw: Optional[str] = None) -> float:
    value = raw if raw is not None else os.environ.get("ATLAS_CANCEL_TIMEOUT_MINUTES")
    try:
        minutes = float(value) if value is not None and str(value).strip() else DEFAULT_MAX_CANCEL_MINUTES
    except (TypeError, ValueError):
        minutes = DEFAULT_MAX_CANCEL_MINUTES
    return max(0.1, minutes)


def recovery_interval_seconds(raw: Optional[str] = None) -> float:
    value = raw if raw is not None else os.environ.get("ATLAS_CANCEL_RECOVERY_INTERVAL_SEC")
    try:
        seconds = float(value) if value is not None and str(value).strip() else DEFAULT_RECOVERY_INTERVAL_SEC
    except (TypeError, ValueError):
        seconds = DEFAULT_RECOVERY_INTERVAL_SEC
    return max(1.0, seconds)


def _cancel_age_anchor(execution: dict) -> Optional[float]:
    """Timestamp when cancel started: cancelRequestedAt, else statusUpdatedAt."""
    for key in ("cancelRequestedAt", "statusUpdatedAt"):
        value = execution.get(key)
        if isinstance(value, (int, float)) and value > 0:
            return float(value)
    return None


def recover_stuck_canceling(
    *,
    max_cancel_minutes: Optional[float] = None,
    now: Optional[float] = None,
) -> int:
    """
    Force CANCELING → CANCELED when cancel has been pending too long.

    Returns number of executions recovered.
    """
    threshold = (
        float(max_cancel_minutes)
        if max_cancel_minutes is not None
        else cancel_timeout_minutes()
    )
    now_ts = time.time() if now is None else float(now)
    recovered = 0

    if not PROJECTS_DIR.is_dir():
        return 0

    for proj_dir in PROJECTS_DIR.iterdir():
        if not proj_dir.is_dir():
            continue
        project_id = proj_dir.name
        executions_dir = get_project_executions_dir(project_id)
        if not executions_dir.is_dir():
            continue

        for exec_file in executions_dir.glob("*.json"):
            try:
                with open(exec_file, encoding="utf-8") as handle:
                    execution = json.load(handle)
                if not isinstance(execution, dict):
                    continue

                status = (execution.get("status") or "").upper()
                if status != "CANCELING":
                    continue

                execution_id = execution.get("id") or exec_file.stem
                anchor = _cancel_age_anchor(execution)
                if anchor is None:
                    logger.warning(
                        "[recovery] CANCELING execution %s/%s has no cancelRequestedAt/"
                        "statusUpdatedAt — skipping",
                        project_id,
                        execution_id,
                    )
                    continue

                age_minutes = (now_ts - anchor) / 60.0
                if age_minutes <= threshold:
                    continue

                started_at = execution.get("startedAt")
                updates = {
                    "status": "CANCELED",
                    "cancelReason": "timeout",
                    "canceledAt": now_ts,
                    "finishedAt": now_ts,
                    "statusUpdatedAt": now_ts,
                }
                if isinstance(started_at, (int, float)):
                    updates["duration"] = int(now_ts - float(started_at))

                update_execution_record(execution_id, updates, project_id=project_id)
                try:
                    append_execution_log(
                        execution_id,
                        f"[recovery] Force canceled after {age_minutes:.1f} minutes "
                        f"timeout (threshold={threshold:g}m)\n",
                        project_id=project_id,
                    )
                except Exception as log_exc:
                    logger.warning(
                        "[recovery] log append failed for %s: %s",
                        execution_id,
                        log_exc,
                    )

                logger.info(
                    "[recovery] stuck CANCELING %s/%s → CANCELED (age=%.1fm)",
                    project_id,
                    execution_id,
                    age_minutes,
                )
                recovered += 1
            except Exception as exc:
                logger.warning(
                    "[recovery] error checking %s: %s",
                    exec_file,
                    exc,
                    exc_info=True,
                )

    if recovered:
        logger.info("[recovery] recovered %s stuck CANCELING execution(s)", recovered)
    return recovered
