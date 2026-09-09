"""User-facing executions helpers for FastAPI (list, cancel, stop, SSE)."""
from __future__ import annotations

import fcntl
import json
import logging
import os
import time
from typing import Any, Iterator, Optional

from executions_store import (
    append_execution_log,
    get_execution,
    get_project_executions_dir,
    read_log_chunk,
    validate_status_transition,
)

logger = logging.getLogger(__name__)


class ExecutionHttpError(Exception):
    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.message = message


def list_executions(
    project_id: str,
    limit: Optional[int] = None,
    offset: int = 0,
    search_query: Optional[str] = None,
    playbook_id: Optional[str] = None,
) -> list[dict[str, Any]]:
    if not project_id:
        raise ExecutionHttpError(400, "Project ID is required")
    executions_dir = get_project_executions_dir(project_id)
    if not executions_dir.exists():
        return []
    executions: list[dict[str, Any]] = []
    for execution_file in sorted(
        executions_dir.glob("*.json"), key=lambda path: path.stat().st_mtime, reverse=True
    ):
        try:
            execution = json.loads(execution_file.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            logger.warning("Error reading execution file %s: %s", execution_file, exc)
            continue
        if playbook_id:
            selection = execution.get("selectionSnapshot") or {}
            if selection.get("playbookId") != playbook_id:
                continue
        if search_query:
            query_lower = search_query.lower()
            hay = execution.get("id", "").lower()
            if query_lower not in hay:
                continue
        executions.append(execution)
    if limit:
        return executions[offset : offset + limit]
    if offset:
        return executions[offset:]
    return executions


def _lock_update(project_id: str, execution_id: str) -> Path:
    executions_dir = get_project_executions_dir(project_id)
    execution_file = executions_dir / f"{execution_id}.json"
    if not execution_file.exists():
        raise ExecutionHttpError(404, "Execution not found")
    return execution_file


def cancel_execution(project_id: str, execution_id: str) -> dict[str, Any]:
    execution_file = _lock_update(project_id, execution_id)
    with open(execution_file, "r+", encoding="utf-8") as handle:
        fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
        try:
            execution = json.load(handle)
            current_status = execution.get("status", "QUEUED")
            if current_status != "QUEUED":
                raise ExecutionHttpError(
                    409, f"Cannot cancel execution in status {current_status}"
                )
            try:
                validate_status_transition("QUEUED", "CANCELED")
            except ValueError as exc:
                raise ExecutionHttpError(409, str(exc)) from exc
            now = time.time()
            execution["status"] = "CANCELED"
            execution["canceledAt"] = now
            execution["cancelReason"] = "user"
            execution["statusUpdatedAt"] = now
            handle.seek(0)
            handle.truncate()
            json.dump(execution, handle, indent=2, ensure_ascii=False)
            handle.flush()
            os.fsync(handle.fileno())
        finally:
            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
    append_execution_log(execution_id, "[api] Canceled by user\n", project_id=project_id)
    return {"success": True, "status": "CANCELED"}


def stop_execution(project_id: str, execution_id: str) -> dict[str, Any]:
    execution_file = _lock_update(project_id, execution_id)
    with open(execution_file, "r+", encoding="utf-8") as handle:
        fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
        try:
            execution = json.load(handle)
            current_status = execution.get("status", "QUEUED")
            if current_status == "CANCELING":
                return {
                    "success": True,
                    "status": "CANCELING",
                    "message": "Already stopping",
                }
            if current_status != "RUNNING":
                raise ExecutionHttpError(
                    409, f"Cannot stop execution in status {current_status}"
                )
            try:
                validate_status_transition("RUNNING", "CANCELING")
            except ValueError as exc:
                raise ExecutionHttpError(409, str(exc)) from exc
            now = time.time()
            execution["status"] = "CANCELING"
            execution["cancelRequestedAt"] = now
            execution["statusUpdatedAt"] = now
            handle.seek(0)
            handle.truncate()
            json.dump(execution, handle, indent=2, ensure_ascii=False)
            handle.flush()
            os.fsync(handle.fileno())
        finally:
            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
    append_execution_log(
        execution_id, "[api] Stop requested by user\n", project_id=project_id
    )
    return {"success": True, "status": "CANCELING"}


def iter_execution_log_sse(
    execution_id: str,
    project_id: str,
    offset: int = 0,
    sleep_s: float = 0.5,
    max_empty_reads: int = 300,
) -> Iterator[str]:
    if not project_id:
        yield f"data: {json.dumps({'type': 'error', 'error': 'Project ID is required'})}\n\n"
        return
    consecutive_empty_reads = 0
    while True:
        try:
            text, next_offset, file_size, is_complete = read_log_chunk(
                execution_id,
                offset=offset,
                limit=1024 * 1024,
                project_id=project_id,
            )
            execution = get_execution(execution_id, project_id=project_id)
            status = execution.get("status", "UNKNOWN") if execution else "UNKNOWN"
            if text:
                consecutive_empty_reads = 0
                yield (
                    "data: "
                    + json.dumps(
                        {
                            "type": "chunk",
                            "text": text,
                            "nextOffset": next_offset,
                            "fileSize": file_size,
                            "isComplete": is_complete,
                            "status": status,
                        }
                    )
                    + "\n\n"
                )
                offset = next_offset
            else:
                consecutive_empty_reads += 1
                if consecutive_empty_reads % 10 == 0:
                    yield (
                        "data: "
                        + json.dumps(
                            {
                                "type": "heartbeat",
                                "offset": offset,
                                "fileSize": file_size,
                                "isComplete": is_complete,
                                "status": status,
                            }
                        )
                        + "\n\n"
                    )
                if is_complete:
                    yield (
                        "data: "
                        + json.dumps(
                            {
                                "type": "status",
                                "status": status,
                                "isComplete": True,
                                "fileSize": file_size,
                            }
                        )
                        + "\n\n"
                    )
                    break
                if consecutive_empty_reads >= max_empty_reads and status not in (
                    "RUNNING",
                    "QUEUED",
                    "CANCELING",
                ):
                    break
            time.sleep(sleep_s)
        except Exception as exc:
            logger.error("Error in log stream for %s: %s", execution_id, exc, exc_info=True)
            yield f"data: {json.dumps({'type': 'error', 'error': str(exc)})}\n\n"
            break
