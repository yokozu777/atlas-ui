"""Create QUEUED/RUNNING execution records without Flask."""
from __future__ import annotations

import json
import logging
import time
import uuid
from typing import Any, Optional

from executions_store import get_project_executions_dir

logger = logging.getLogger(__name__)


def create_execution_record(
    data: dict[str, Any],
    project_id: Optional[str] = None,
    execution_id: Optional[str] = None,
) -> Optional[str]:
    """Write history/executions/{id}.json. Returns execution id or None on I/O error."""
    if execution_id is None:
        execution_id = str(uuid.uuid4())
    now = time.time()
    if not project_id:
        project_id = data.get("project_id")
    if not project_id:
        logger.error("[create_execution_record] project_id is required")
        raise ValueError("project_id is required for create_execution_record")

    status = str(data.get("status", "QUEUED") or "QUEUED").upper()
    if status not in ("QUEUED", "RUNNING"):
        logger.warning(
            "[create_execution_record] Invalid initial status %r, defaulting to QUEUED",
            status,
        )
        status = "QUEUED"

    execution: dict[str, Any] = {
        "id": execution_id,
        "projectId": project_id,
        "createdAt": now,
        "status": status,
        "statusUpdatedAt": now,
        "playbookName": data.get("playbookName", "dynamic_playbook"),
        "mode": data.get("mode", "PER_GROUP"),
        "inventorySnapshot": data.get("inventorySnapshot", {}),
        "selectionSnapshot": data.get("selectionSnapshot", {}),
        "stats": data.get("stats", {}),
        "warnings": data.get("warnings", []),
    }
    if status == "QUEUED":
        execution["queuedAt"] = now
    if status == "RUNNING":
        execution["startedAt"] = now
        if "workerId" in data:
            execution["workerId"] = data.get("workerId")
    if "workerId" in data and status == "QUEUED":
        execution["workerId"] = data.get("workerId")
    for key in ("runName", "tag", "description", "runParams", "playbookId", "kind"):
        if key in data and data.get(key) is not None:
            execution[key] = data.get(key)
        elif key == "kind" and data.get("kind"):
            execution["kind"] = data.get("kind")

    executions_dir = get_project_executions_dir(project_id)
    executions_dir.mkdir(parents=True, exist_ok=True)
    execution_file = executions_dir / f"{execution_id}.json"
    try:
        execution_file.write_text(
            json.dumps(execution, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
        return execution_id
    except OSError as exc:
        logger.error("Error creating execution record: %s", exc)
        return None
