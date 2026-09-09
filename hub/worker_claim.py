"""Atomic worker claim of QUEUED executions (no Flask)."""
from __future__ import annotations

import fcntl
import json
import logging
import os
import time
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)


def _projects_dir() -> Path:
    raw = os.environ.get("DATA_DIR")
    if raw and str(raw).strip():
        return Path(raw).expanduser().resolve() / "projects"
    here = Path(__file__).resolve().parent
    base = here.parent if here.name in {"backend", "hub"} else here
    return (base / "data" / "projects").resolve()


def check_execution_requirements(
    execution: dict, worker_capabilities: dict, worker_tags: list
) -> bool:
    run_params = execution.get("runParams") or {}
    requirements = run_params.get("requirements") or {}
    required_tags = requirements.get("tags") or []
    if required_tags:
        if not set(required_tags).issubset(set(worker_tags or [])):
            return False
    required_caps = requirements.get("capabilities") or {}
    if required_caps:
        for cap_key, cap_value in required_caps.items():
            if worker_capabilities.get(cap_key) != cap_value:
                return False
    return True


def _active_runs_count(worker_id: str, projects_dir: Path) -> int:
    count = 0
    if not projects_dir.is_dir():
        return 0
    for proj_dir in projects_dir.iterdir():
        if not proj_dir.is_dir():
            continue
        executions_dir = proj_dir / "history" / "executions"
        if not executions_dir.is_dir():
            continue
        for exec_file in executions_dir.glob("*.json"):
            try:
                execution = json.loads(exec_file.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue
            if (
                execution.get("status") == "RUNNING"
                and execution.get("workerId") == worker_id
            ):
                count += 1
    return count


def server_claim_next_execution(
    worker_id,
    worker_data,
    project_id=None,
    max_concurrency=1,
    tags=None,
    projects_dir: Optional[Path] = None,
):
    """Atomically claim the next QUEUED execution. Returns (id, data, project_id) or (None, None, None)."""
    root = Path(projects_dir) if projects_dir is not None else _projects_dir()
    try:
        if _active_runs_count(worker_id, root) >= max_concurrency:
            logger.debug(
                "Worker %s has active runs at maxConcurrency=%s",
                worker_id,
                max_concurrency,
            )
            return None, None, None

        worker_capabilities = worker_data.get("capabilities") or {}
        worker_tags = tags or worker_data.get("tags") or []

        if project_id:
            project_dirs = [root / project_id]
        elif root.is_dir():
            project_dirs = [d for d in root.iterdir() if d.is_dir()]
        else:
            project_dirs = []

        queued_runs: list[tuple[Any, Path, dict, str]] = []
        total_checked = 0
        for proj_dir in project_dirs:
            if not proj_dir.is_dir():
                continue
            proj_id = proj_dir.name
            executions_dir = proj_dir / "history" / "executions"
            if not executions_dir.is_dir():
                continue
            for exec_file in executions_dir.glob("*.json"):
                try:
                    with open(exec_file, "r", encoding="utf-8") as handle:
                        try:
                            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                        except OSError:
                            continue
                        try:
                            execution = json.load(handle)
                            if execution.get("status") != "QUEUED":
                                continue
                            if not check_execution_requirements(
                                execution, worker_capabilities, worker_tags
                            ):
                                continue
                            queued_at = execution.get(
                                "queuedAt", execution.get("createdAt", 0)
                            )
                            queued_runs.append((queued_at, exec_file, execution, proj_id))
                            total_checked += 1
                        finally:
                            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
                except Exception as exc:
                    logger.warning("Error reading execution file %s: %s", exec_file, exc)
                    continue

        if not queued_runs:
            logger.debug(
                "[Server Claim] No QUEUED runs (checked %s files in %s project(s))",
                total_checked,
                len(project_dirs),
            )
            return None, None, None

        queued_runs.sort(key=lambda item: item[0])
        for _queued_at, exec_file, execution, proj_id in queued_runs:
            execution_id = execution.get("id")
            if not execution_id:
                continue
            try:
                with open(exec_file, "r+", encoding="utf-8") as handle:
                    fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
                    try:
                        handle.seek(0)
                        execution = json.load(handle)
                        if execution.get("status") != "QUEUED":
                            continue
                        if _active_runs_count(worker_id, root) >= max_concurrency:
                            continue
                        execution["status"] = "RUNNING"
                        execution["startedAt"] = time.time()
                        execution["workerId"] = worker_id
                        execution["workerName"] = worker_data.get("name", "Unknown")
                        execution["workerTags"] = worker_data.get("tags") or []
                        handle.seek(0)
                        handle.truncate()
                        json.dump(execution, handle, indent=2, ensure_ascii=False)
                        handle.flush()
                        os.fsync(handle.fileno())
                        logger.info(
                            "Server claimed run %s for project %s by worker %s",
                            execution_id,
                            proj_id,
                            worker_id,
                        )
                        return execution_id, execution, proj_id
                    finally:
                        fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
            except OSError:
                continue
            except Exception as exc:
                logger.error("Error claiming run %s: %s", execution_id, exc)
                continue
        return None, None, None
    except Exception as exc:
        logger.error("Error in server_claim_next_execution: %s", exc, exc_info=True)
        return None, None, None
