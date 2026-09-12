#!/usr/bin/env python3
"""Run atlas-clusterctl for atlas-kind executions."""
from __future__ import annotations

import os
import queue
import re
import shutil
import signal
import subprocess
import threading
import time
from pathlib import Path
from typing import Any, Mapping, Optional

from clusterctl_config import (
    clusterctl_root_from_project,
    resolve_clusters_root,
    resolve_workspace_root,
)

CLUSTER_CONFIG_NAME = "cluster.yaml"
_PLAYBOOKS_SSH_KEY_RE = re.compile(r"^PLAYBOOKS_[A-Z0-9_]+_SSH_KEY$")
ENV_FORCE_LOCAL = "CLUSTER_EXECUTOR_FORCE_LOCAL"
ENV_EXECUTION_ID = "ATLAS_EXECUTION_ID"

logger = None


def _log():
    global logger
    if logger is None:
        import logging
        logger = logging.getLogger(__name__)
    return logger


def atlas_subcommand(argv: list[str]) -> str:
    """First clusterctl subcommand, skipping global --cluster / --executor flags."""
    index = 0
    while index < len(argv):
        token = argv[index]
        if token in {"--cluster", "--executor"}:
            index += 2
            continue
        if token.startswith("--cluster=") or token.startswith("--executor="):
            index += 1
            continue
        if token.startswith("-"):
            index += 1
            continue
        return token
    return ""


def build_atlas_argv(run_params: dict[str, Any]) -> list[str]:
    argv = list(run_params.get("argv") or ["run"])
    cluster_id = run_params.get("cluster_id")
    if cluster_id and "--cluster" not in argv and atlas_subcommand(argv) != "init":
        argv = ["--cluster", str(cluster_id), *argv]
    return argv


def clusterctl_root_from_params(run_params: Mapping[str, Any] | None = None) -> Path:
    params = run_params or {}
    payload: dict[str, Any] = {}
    raw = params.get("clusterctl_root")
    if raw and str(raw).strip():
        payload["clusterctlRoot"] = str(raw).strip()
    found = clusterctl_root_from_project(payload)
    if found is None:
        raise ValueError(
            "ATLAS_CLUSTER_ROOT is empty: set it on the worker to the atlas-clusterctl "
            "checkout (the directory that contains the ./cluster binary)."
        )
    root = Path(found).expanduser().resolve()
    binary = root / "cluster"
    if not binary.is_file():
        raise ValueError(
            f"clusterctl not found: {binary} (ATLAS_CLUSTER_ROOT={root})"
        )
    return root


def argv_executor(argv: list[str]) -> Optional[str]:
    for index, token in enumerate(argv):
        if token == "--executor" and index + 1 < len(argv):
            return str(argv[index + 1]).strip().lower()
        if token.startswith("--executor="):
            return token.split("=", 1)[1].strip().lower()
    return None


def cluster_yaml_execution_mode(leaf: Path) -> Optional[str]:
    cfg = Path(leaf) / CLUSTER_CONFIG_NAME
    if not cfg.is_file():
        return None
    try:
        import yaml
    except ImportError:
        return None
    try:
        raw = yaml.safe_load(cfg.read_text(encoding="utf-8")) or {}
    except (OSError, yaml.YAMLError):
        return None
    if not isinstance(raw, dict):
        return None
    block = raw.get("execution")
    if not isinstance(block, dict):
        return None
    mode = str(block.get("mode") or "").strip().lower()
    return mode or None


def resolved_executor_mode(argv: list[str], leaf: Path) -> str:
    override = argv_executor(argv)
    if override in {"local", "docker"}:
        return override
    configured = cluster_yaml_execution_mode(leaf)
    if configured in {"local", "docker"}:
        return configured
    return "local"


def require_docker_cli_if_needed(argv: list[str], leaf: Path) -> str:
    mode = resolved_executor_mode(argv, leaf)
    if mode == "docker" and shutil.which("docker") is None:
        raise ValueError(
            "execution.mode=docker requires docker CLI on PATH "
            "(install docker or pass --executor local)"
        )
    return mode


def docker_executor_container_name(execution_id: str) -> str:
    safe = "".join(
        ch if ch.isalnum() or ch in ".-_" else "-"
        for ch in str(execution_id).strip()
    )
    if not safe or not safe[0].isalnum():
        safe = "x" + safe
    return f"atlas-exec-{safe}"[:63]


def stop_atlas_child(
    process: subprocess.Popen,
    pgid: Optional[int],
    execution_id: str,
    grace_period: int,
) -> None:
    """Stop clusterctl and the named docker executor container, if any."""
    log = _log()
    name = docker_executor_container_name(execution_id)
    docker = shutil.which("docker")
    if docker:
        try:
            subprocess.run(
                [docker, "stop", "-t", str(max(1, int(grace_period))), name],
                check=False,
                capture_output=True,
                timeout=max(5, int(grace_period) + 20),
            )
        except Exception as exc:
            log.warning("[execute_atlas_run] docker stop %s failed: %s", name, exc)
    if process.poll() is not None:
        return
    try:
        if pgid is not None:
            os.killpg(pgid, signal.SIGTERM)
        else:
            process.terminate()
    except (ProcessLookupError, PermissionError) as exc:
        log.debug("[execute_atlas_run] SIGTERM: %s", exc)
    deadline = time.time() + max(1, int(grace_period))
    while time.time() < deadline:
        if process.poll() is not None:
            return
        time.sleep(0.2)
    if docker:
        try:
            subprocess.run(
                [docker, "kill", name],
                check=False,
                capture_output=True,
                timeout=10,
            )
        except Exception as exc:
            log.warning("[execute_atlas_run] docker kill %s failed: %s", name, exc)
    try:
        if pgid is not None:
            os.killpg(pgid, signal.SIGKILL)
        else:
            process.kill()
    except (ProcessLookupError, PermissionError) as exc:
        log.debug("[execute_atlas_run] SIGKILL: %s", exc)


def inventory_leaf_path(clusters_root: Path, cluster_id: str) -> Path:
    return Path(clusters_root) / str(cluster_id).strip()


def require_inventory_leaf(clusters_root: Path, cluster_id: Optional[str]) -> Path:
    if not cluster_id or not str(cluster_id).strip():
        raise ValueError(
            "cluster_id is required for atlas run (inventory leaf, e.g. dev/k8s)"
        )
    cid = str(cluster_id).strip()
    leaf = inventory_leaf_path(clusters_root, cid)
    cfg = leaf / CLUSTER_CONFIG_NAME
    if not cfg.is_file():
        raise ValueError(
            f"Inventory leaf missing: {cfg} "
            f"(ATLAS_CLUSTERS_ROOT={clusters_root}, cluster_id={cid}). "
            "Checkout or bind atlas-inventory and set ATLAS_CLUSTERS_ROOT."
        )
    return leaf


def is_atlas_git_env_key(key: str) -> bool:
    return key == "GIT_SSH_COMMAND" or bool(_PLAYBOOKS_SSH_KEY_RE.fullmatch(key))


def git_ssh_material_dir(project_id: str, execution_id: str) -> Path:
    data = Path(os.environ.get("DATA_DIR") or "/app/data")
    return data / "projects" / str(project_id) / "tmp" / "git-ssh" / str(execution_id)


def cleanup_git_ssh_material(project_id: str, execution_id: str) -> None:
    shutil.rmtree(git_ssh_material_dir(project_id, execution_id), ignore_errors=True)


def merge_atlas_git_env(env: dict[str, str], extra: Any) -> dict[str, str]:
    """Copy GIT_SSH_COMMAND / PLAYBOOKS_*_SSH_KEY from runParams.env. Never SSH_KEY."""
    if not isinstance(extra, dict):
        return env
    for raw_key, raw_value in extra.items():
        key = str(raw_key)
        if not is_atlas_git_env_key(key):
            continue
        value = str(raw_value or "").strip()
        if value:
            env[key] = value
    return env


def prepare_atlas_run(run_params: Mapping[str, Any] | None = None) -> dict[str, Any]:
    params = dict(run_params or {})
    root = clusterctl_root_from_params(params)
    cluster_id = params.get("cluster_id")
    clusters_root = resolve_clusters_root(root, params)
    raw_argv = list(params.get("argv") or ["run"])
    creating = atlas_subcommand(raw_argv) == "init"
    if creating:
        if not cluster_id or not str(cluster_id).strip():
            raise ValueError(
                "cluster_id is required for atlas init (inventory leaf, e.g. dev/k8s)"
            )
        leaf = inventory_leaf_path(clusters_root, str(cluster_id).strip())
        workspace_root = resolve_workspace_root(root, params)
        argv = build_atlas_argv(params)
        executor_mode = "local"
    else:
        leaf = require_inventory_leaf(clusters_root, cluster_id)
        workspace_root = resolve_workspace_root(root, params)
        argv = build_atlas_argv(params)
        executor_mode = require_docker_cli_if_needed(argv, leaf)
    env = os.environ.copy()
    env.pop(ENV_FORCE_LOCAL, None)
    env["ATLAS_CLUSTER_ROOT"] = str(root)
    env["ATLAS_CLUSTERS_ROOT"] = str(clusters_root)
    env["ATLAS_WORKSPACE_ROOT"] = str(workspace_root)
    env["CLUSTER_ID"] = str(cluster_id).strip()
    merge_atlas_git_env(env, params.get("env"))
    return {
        "clusterctl_root": root,
        "binary": root / "cluster",
        "clusters_root": clusters_root,
        "workspace_root": workspace_root,
        "leaf": leaf,
        "argv": argv,
        "env": env,
        "cluster_id": str(cluster_id).strip(),
        "executor_mode": executor_mode,
    }


def execute_atlas_run(
    execution_id: str,
    execution_data: dict,
    project_id: str,
    http_client,
    heartbeat_interval: float = 30,
    grace_period: int = 10,
) -> dict[str, Any]:
    log = _log()
    run_params = execution_data.get("runParams") or {}
    try:
        spec = prepare_atlas_run(run_params)
    except ValueError as exc:
        msg = str(exc)
        log.error("[execute_atlas_run] %s", msg)
        try:
            http_client.send_log(execution_id, f"ERROR: {msg}\n")
        except Exception as send_exc:
            log.warning("[execute_atlas_run] send_log failed: %s", send_exc)
        try:
            http_client.finish_execution(
                execution_id,
                status="FAILED",
                finished_at=time.time(),
                error=msg,
            )
        except Exception as finish_exc:
            log.error("[execute_atlas_run] finish failed: %s", finish_exc)
        cleanup_git_ssh_material(project_id, execution_id)
        return {"status": "FAILED", "error": msg}

    root = spec["clusterctl_root"]
    cmd = [str(spec["binary"]), *spec["argv"]]
    env = spec["env"]
    env[ENV_EXECUTION_ID] = execution_id
    executor_mode = spec.get("executor_mode") or "local"
    log.info(
        "[execute_atlas_run] %s cwd=%s clusters=%s workspace=%s leaf=%s "
        "executor=%s FORCE_LOCAL=unset project=%s",
        cmd,
        root,
        spec["clusters_root"],
        spec["workspace_root"],
        spec["leaf"],
        executor_mode,
        project_id,
    )
    try:
        http_client.send_log(
            execution_id,
            (
                f"atlas: clusterctl={root} clusters={spec['clusters_root']} "
                f"workspace={spec['workspace_root']} leaf={spec['leaf']}\n"
                f"atlas: executor={executor_mode} "
                f"({ENV_FORCE_LOCAL} unset on worker child env)\n"
            ),
        )
    except Exception as send_exc:
        log.warning("[execute_atlas_run] send_log failed: %s", send_exc)
    heartbeat_stop = threading.Event()

    def heartbeat_loop():
        while not heartbeat_stop.wait(heartbeat_interval):
            try:
                http_client.heartbeat(current_execution_id=execution_id)
            except Exception as exc:
                log.warning("[execute_atlas_run] heartbeat failed: %s", exc)

    thread = threading.Thread(target=heartbeat_loop, daemon=True)
    thread.start()
    start = time.time()
    process = subprocess.Popen(
        cmd,
        cwd=str(root),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
        start_new_session=True,
    )
    try:
        pgid: Optional[int] = os.getpgid(process.pid)
    except OSError:
        pgid = None
    chunks: list[str] = []
    was_canceling = False
    output_queue: queue.Queue[Optional[str]] = queue.Queue()

    def read_output() -> None:
        try:
            if process.stdout is not None:
                for line in process.stdout:
                    output_queue.put(line)
        except Exception as exc:
            log.warning("[execute_atlas_run] stdout reader failed: %s", exc)
        finally:
            output_queue.put(None)

    threading.Thread(target=read_output, daemon=True).start()
    last_status_check = 0.0
    try:
        while True:
            now = time.time()
            if now - last_status_check >= 1.0:
                last_status_check = now
                try:
                    execution_status = http_client.get_execution_status(
                        execution_id, project_id
                    )
                except Exception as exc:
                    log.warning(
                        "[execute_atlas_run] status check failed: %s", exc
                    )
                    execution_status = None
                if execution_status in {"SUCCESS", "FAILED", "CANCELED"}:
                    if process.poll() is None:
                        stop_atlas_child(
                            process, pgid, execution_id, grace_period
                        )
                    if execution_status == "CANCELED":
                        was_canceling = True
                    break
                if execution_status == "CANCELING" and not was_canceling:
                    was_canceling = True
                    log.info(
                        "[execute_atlas_run] %s CANCELING, stopping child",
                        execution_id,
                    )
                    try:
                        http_client.send_log(
                            execution_id,
                            "[worker] Stop requested, terminating clusterctl/docker\n",
                        )
                    except Exception:
                        pass
                    stop_atlas_child(process, pgid, execution_id, grace_period)
            try:
                line = output_queue.get(timeout=0.4)
            except queue.Empty:
                if process.poll() is not None and output_queue.empty():
                    break
                continue
            if line is None:
                break
            chunks.append(line)
            try:
                http_client.send_log(execution_id, line)
            except Exception as exc:
                log.warning("[execute_atlas_run] send_log failed: %s", exc)
        return_code = process.wait()
        if process.stdout is not None:
            process.stdout.close()
    finally:
        heartbeat_stop.set()
        try:
            if process.poll() is None:
                stop_atlas_child(process, pgid, execution_id, grace_period)
                process.wait(timeout=grace_period)
        except Exception:
            pass

    duration = time.time() - start
    if was_canceling:
        status = "CANCELED"
    elif return_code == 0:
        status = "SUCCESS"
    else:
        status = "FAILED"
    try:
        http_client.finish_execution(
            execution_id,
            status=status,
            finished_at=time.time(),
            duration=int(duration),
            return_code=return_code,
        )
    except Exception as exc:
        log.error("[execute_atlas_run] finish failed: %s", exc)
    cleanup_git_ssh_material(project_id, execution_id)
    return {
        "status": status,
        "return_code": return_code,
        "duration": duration,
        "output": "".join(chunks),
    }
