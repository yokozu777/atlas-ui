"""Playbook CRUD, queue run, check_host, atlas/run helpers (no Flask)."""
from __future__ import annotations

import json
import logging
import os
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

import yaml

from atlas_inspect import InspectError, resolve_inspect_cluster_id
from atlas_rbac import atlas_run_error
from clusterctl_config import inspect_run_params_from_project
from executions_create import create_execution_record
from executions_store import get_project_dir
from inventory_http import list_groups, require_project_id, resolve_host_vars_file, secrets_dir
from playbook_generator import PlaybookGenerator
from playbook_parser import PlaybookParseError, PlaybookParser
from playbook_storage import PlaybookStorage
from playbook_validator import PlaybookValidator

logger = logging.getLogger(__name__)


class PlaybookHttpError(Exception):
    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.message = message


_generator = PlaybookGenerator()
_parser = PlaybookParser()


def playbook_store(projects_dir: Path) -> PlaybookStorage:
    return PlaybookStorage(projects_dir)


def generated_playbook_path(project_id: str, execution_id: str) -> Path:
    path = (
        get_project_dir(project_id)
        / "runtime"
        / "generated_playbooks"
        / f"{execution_id}.yml"
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def list_playbooks(storage: PlaybookStorage, project_id: str) -> list[dict[str, Any]]:
    return storage.list_playbooks(project_id)


def create_playbook(
    storage: PlaybookStorage, project_id: str, name: str, description: str = ""
) -> dict[str, Any]:
    name = (name or "").strip()
    if not name:
        raise PlaybookHttpError(400, "Playbook name is required")
    if storage.check_name_conflict(project_id, name):
        raise PlaybookHttpError(409, f'Playbook with name "{name}" already exists')
    playbook = storage.create_playbook(project_id, name, description.strip())
    if not playbook:
        raise PlaybookHttpError(500, "Failed to create playbook")
    return playbook


def get_playbook(storage: PlaybookStorage, project_id: str, playbook_id: str) -> dict[str, Any]:
    playbook = storage.get_playbook(project_id, playbook_id)
    if not playbook:
        raise PlaybookHttpError(404, "Playbook not found")
    return playbook


def update_playbook(
    storage: PlaybookStorage,
    project_id: str,
    playbook_id: str,
    body: dict[str, Any],
) -> dict[str, Any]:
    existing = get_playbook(storage, project_id, playbook_id)
    if "name" in body:
        new_name = str(body["name"]).strip()
        if not new_name:
            raise PlaybookHttpError(400, "Playbook name cannot be empty")
        if storage.check_name_conflict(project_id, new_name, exclude_playbook_id=playbook_id):
            raise PlaybookHttpError(409, f'Playbook with name "{new_name}" already exists')
        existing["name"] = new_name
    if "description" in body:
        existing["description"] = str(body.get("description") or "").strip()
    if "yaml" in body and body.get("yaml") is not None:
        yaml_content = body.get("yaml")
        if not isinstance(yaml_content, str):
            raise PlaybookHttpError(400, "yaml must be a string")
        if not yaml_content.strip():
            existing["plays"] = []
        else:
            try:
                parsed = _parser.parse(yaml_content, existing.get("name"))
            except PlaybookParseError as exc:
                raise PlaybookHttpError(400, str(exc)) from exc
            existing["plays"] = parsed.get("plays", [])
    if "plays" in body:
        existing["plays"] = body["plays"]
    metadata = existing.get("metadata")
    if not isinstance(metadata, dict):
        metadata = {}
        existing["metadata"] = metadata
    body_meta = body.get("metadata") if isinstance(body.get("metadata"), dict) else {}
    if "tags" in body or "tags" in body_meta:
        raw_tags = body["tags"] if "tags" in body else body_meta.get("tags")
        tags = _normalize_tags(raw_tags)
        existing["tags"] = tags
        metadata["tags"] = tags
        joined = ", ".join(tags)
        if tags:
            existing["tag"] = joined
            metadata["tag"] = joined
        else:
            existing.pop("tag", None)
            metadata.pop("tag", None)
    if "disabled" in body or "disabled" in body_meta:
        disabled = bool(body["disabled"] if "disabled" in body else body_meta.get("disabled"))
        existing["disabled"] = disabled
        metadata["disabled"] = disabled
    if not storage.save_playbook(project_id, existing):
        raise PlaybookHttpError(500, "Failed to save playbook")
    return existing


def _normalize_tags(raw: Any) -> list[str]:
    if isinstance(raw, list):
        return [str(item).strip() for item in raw if str(item).strip()]
    if isinstance(raw, str) and raw.strip():
        return [part.strip() for part in raw.split(",") if part.strip()]
    return []


def preview_playbook(playbook: dict[str, Any]) -> str:
    return _generator.generate(playbook) or ""


def validate_playbook_payload(
    storage: PlaybookStorage,
    project_id: str,
    playbook_id: str,
    body: dict[str, Any],
) -> dict[str, Any]:
    get_playbook(storage, project_id, playbook_id)
    playbook = body.get("playbook")
    if not isinstance(playbook, dict):
        raise PlaybookHttpError(400, "Playbook data is required")
    inventory_groups = body.get("inventory_groups")
    available_roles = body.get("available_roles")
    validator = PlaybookValidator(
        inventory_groups=inventory_groups if isinstance(inventory_groups, dict) else {},
        available_roles=available_roles if isinstance(available_roles, list) else [],
    )
    return {"success": True, "validation": validator.validate(playbook)}


def get_schedule(storage: PlaybookStorage, project_id: str, playbook_id: str) -> dict[str, Any]:
    if not storage.playbook_exists(project_id, playbook_id):
        raise PlaybookHttpError(404, "Playbook not found")
    schedule = storage.get_schedule(project_id, playbook_id)
    if schedule:
        return {"success": True, "schedule": schedule}
    return {"success": False, "schedule": None, "error": "Schedule not configured"}


def save_schedule(
    storage: PlaybookStorage, project_id: str, playbook_id: str, body: dict[str, Any]
) -> dict[str, Any]:
    if not storage.playbook_exists(project_id, playbook_id):
        raise PlaybookHttpError(404, "Playbook not found")
    enabled = bool(body.get("enabled", False))
    cron = str(body.get("cron") or "").strip()
    timezone = str(body.get("timezone") or "UTC")
    if enabled:
        if not cron:
            raise PlaybookHttpError(400, "Cron expression is required when schedule is enabled")
        try:
            from playbook_scheduler import PlaybookScheduler

            ok, err = PlaybookScheduler.validate_cron(cron)
            if not ok:
                raise PlaybookHttpError(400, err or "Invalid cron expression")
        except PlaybookHttpError:
            raise
        except Exception:
            pass
        try:
            import pytz

            pytz.timezone(timezone)
        except Exception as exc:
            raise PlaybookHttpError(400, f"Invalid timezone: {timezone}") from exc
    if not storage.save_schedule(
        project_id, playbook_id, {"enabled": enabled, "cron": cron, "timezone": timezone}
    ):
        raise PlaybookHttpError(500, "Failed to save schedule")
    return {"success": True, "schedule": {"enabled": enabled, "cron": cron, "timezone": timezone}}


def next_run_time(storage: PlaybookStorage, project_id: str, playbook_id: str) -> dict[str, Any]:
    if not storage.playbook_exists(project_id, playbook_id):
        raise PlaybookHttpError(404, "Playbook not found")
    schedule = storage.get_schedule(project_id, playbook_id)
    if not schedule or not schedule.get("enabled"):
        raise PlaybookHttpError(404, "Schedule not enabled")
    cron_expr = schedule.get("cron") or ""
    if not cron_expr:
        raise PlaybookHttpError(400, "Cron expression not set")
    import pytz
    from croniter import croniter

    timezone_str = schedule.get("timezone") or "UTC"
    try:
        tz = pytz.timezone(timezone_str)
    except pytz.exceptions.UnknownTimeZoneError:
        tz = pytz.UTC
    current_utc = datetime.utcnow()
    current_in_tz = current_utc.replace(tzinfo=pytz.UTC).astimezone(tz)
    current_naive = current_in_tz.replace(tzinfo=None)
    cron = croniter(cron_expr, current_naive)
    next_time = cron.get_next(datetime)
    next_time_aware = tz.localize(next_time) if next_time.tzinfo is None else next_time.replace(tzinfo=tz)
    return {"success": True, "next_run_time": next_time_aware.astimezone(pytz.UTC).isoformat()}


def queue_playbook_run(
    storage: PlaybookStorage,
    project_id: str,
    playbook_id: str,
    body: dict[str, Any],
) -> dict[str, Any]:
    playbook = get_playbook(storage, project_id, playbook_id)
    inventory_files = body.get("inventory_files")
    if not inventory_files:
        inventory_files = ["inventory.yml"]
    ansible_config = body.get("ansible_config") or "ansible-config/ansible.cfg"
    check_mode = bool(body.get("check_mode", False))
    verbosity = (body.get("verbosity") or "").strip() or None
    yaml_content = _generator.generate(playbook)
    if not yaml_content or not str(yaml_content).strip():
        raise PlaybookHttpError(400, "Playbook is empty")
    execution_id = str(uuid.uuid4())
    playbook_path = generated_playbook_path(project_id, execution_id)
    playbook_path.write_text(yaml_content, encoding="utf-8")
    plays_list = playbook.get("plays") or []
    strategy = plays_list[0].get("strategy", "linear") if plays_list else "linear"
    vault_id = None
    for play in plays_list:
        if play.get("vars_files") and play.get("vault_id"):
            vault_id = play.get("vault_id")
            break
    inventory_snapshot = {"groups": []}
    try:
        groups = list_groups(project_id, list(inventory_files))
        for group_name, group_data in groups.items():
            group_hosts = group_data.get("hosts") or []
            inventory_snapshot["groups"].append(
                {
                    "groupId": group_name,
                    "groupName": group_name,
                    "hosts": [{"hostId": host, "ip": host} for host in group_hosts],
                }
            )
    except Exception as exc:
        logger.warning("Error creating inventory snapshot: %s", exc)
    run_params = {
        "temp_playbook": str(playbook_path),
        "inventory_files": inventory_files,
        "ansible_config": ansible_config,
        "project_dir": str(get_project_dir(project_id)),
        "check_mode": check_mode,
        "verbosity": verbosity,
        "forks": None,
        "force_handlers": bool(body.get("force_handlers", False)),
        "connection_timeout": None,
        "strategy": strategy,
        "vault_id": vault_id,
    }
    created = create_execution_record(
        {
            "playbookName": playbook.get("name", "playbook"),
            "playbookId": playbook_id,
            "mode": "PER_GROUP",
            "inventorySnapshot": inventory_snapshot,
            "selectionSnapshot": {
                "playbookId": playbook_id,
                "playbookName": playbook.get("name", "playbook"),
            },
            "stats": {"hostsTargeted": 0, "totalRoleExecutions": 0},
            "warnings": [],
            "status": "QUEUED",
            "runParams": run_params,
        },
        project_id=project_id,
        execution_id=execution_id,
    )
    if not created:
        raise PlaybookHttpError(500, "Failed to create execution record")
    return {
        "success": True,
        "message": f'Playbook "{playbook.get("name", "playbook")}" queued',
        "status": "queued",
        "executionId": created,
    }


def _materialize_ssh_key(project_id: str, secret_name: str, dest: Path) -> Optional[str]:
    ssh_keys = secrets_dir(project_id) / "ssh_keys" / f"{secret_name}.json"
    secret_file = ssh_keys if ssh_keys.exists() else secrets_dir(project_id) / f"{secret_name}.json"
    if not secret_file.exists():
        return None
    secret_data = json.loads(secret_file.read_text(encoding="utf-8"))
    if secret_data.get("type") != "ssh_key":
        return None
    private_key = secret_data.get("privateKey") or ""
    if not private_key:
        return None
    dest.write_text(private_key if private_key.endswith("\n") else private_key + "\n", encoding="utf-8")
    os.chmod(dest, 0o600)
    return str(dest.resolve())


def queue_host_check(project_id: str, body: dict[str, Any]) -> dict[str, Any]:
    return _queue_host_probe(project_id, body, kind="check")


def queue_host_facts(project_id: str, body: dict[str, Any]) -> dict[str, Any]:
    return _queue_host_probe(project_id, body, kind="facts")


def _queue_host_probe(
    project_id: str, body: dict[str, Any], *, kind: str
) -> dict[str, Any]:
    host = str(body.get("host") or body.get("host_name") or "").strip()
    if not host:
        raise PlaybookHttpError(400, "Host not specified")
    require_project_id(project_id)
    ansible_config = body.get("ansible_config")
    if not ansible_config:
        raise PlaybookHttpError(400, "ansible_config is required")
    selected_inventory_files = body.get("inventory_files") or ["inventory.yml"]
    inventory_file = ""
    if isinstance(selected_inventory_files, list) and selected_inventory_files:
        inventory_file = str(selected_inventory_files[0] or "")
    host_file = resolve_host_vars_file(project_id, host, inventory_file)
    host_vars: dict[str, Any] = {}
    if host_file.exists():
        loaded = yaml.safe_load(host_file.read_text(encoding="utf-8")) or {}
        if isinstance(loaded, dict):
            host_vars = loaded
    ansible_host = str(host_vars.get("ansible_host") or host)
    secret_username = str(host_vars.get("ansible_user") or "root")
    entry: dict[str, Any] = {}
    for key, value in host_vars.items():
        if str(key).startswith("ansible_") or key == "ansible_host":
            entry[key] = value
    execution_id = str(uuid.uuid4())
    generated_dir = generated_playbook_path(project_id, execution_id).parent
    temp_key_files: list[str] = []
    key_file = host_vars.get("ansible_ssh_private_key_file")
    connection_secret = host_vars.get("connectionSecret")
    if connection_secret:
        pem = generated_dir / f"key_{execution_id}.pem"
        materialized = _materialize_ssh_key(project_id, str(connection_secret), pem)
        if materialized:
            entry["ansible_ssh_private_key_file"] = materialized
            temp_key_files.append(materialized)
    elif key_file:
        entry["ansible_ssh_private_key_file"] = key_file
    has_conn = bool(
        entry.get("ansible_ssh_private_key_file")
        or entry.get("ansible_password")
        or entry.get("ansible_ssh_pass")
    )
    if not has_conn:
        raise PlaybookHttpError(
            400,
            "Connection secret not specified. Select a connection secret for the host in Hosts & Groups.",
        )
    simple_inventory = {"all": {"hosts": {ansible_host: entry}}}
    playbook_path = generated_playbook_path(project_id, execution_id)
    inventory_path = generated_dir / f"inventory_{execution_id}.yml"
    if kind == "facts":
        playbook_text = f"""---
- hosts: all
  remote_user: {secret_username}
  gather_facts: no
  vars:
    ansible_executable: /bin/sh
    ansible_python_interpreter: auto_silent
  tasks:
    - name: Gather facts
      ansible.builtin.setup:
      register: facts_result
    - name: Convert facts to JSON string
      ansible.builtin.set_fact:
        facts_json: "{{{{ facts_result.ansible_facts | to_json }}}}"
    - name: Output facts as JSON
      ansible.builtin.debug:
        msg: "{{{{ facts_json }}}}"
"""
        mode = "HOST_FACTS"
        execution_type = "HOST_FACTS"
        playbook_name = f"get_facts_{host}"
        description = f"Get host facts: {host}"
        message = "Get facts queued for execution"
    else:
        playbook_text = f"""---
- hosts: all
  remote_user: {secret_username}
  gather_facts: no
  vars:
    ansible_executable: /bin/sh
    ansible_python_interpreter: auto_silent
  tasks:
    - name: Test connectivity to host
      ansible.builtin.ping:
"""
        mode = "HOST_CHECK"
        execution_type = "HOST_CHECK"
        playbook_name = f"host_check_{host}"
        description = f"Check host availability: {host}"
        message = "Host check queued for execution"
    playbook_path.write_text(playbook_text, encoding="utf-8")
    inventory_path.write_text(
        yaml.safe_dump(simple_inventory, default_flow_style=False, allow_unicode=True, sort_keys=False),
        encoding="utf-8",
    )
    project_dir = get_project_dir(project_id)
    cfg_path = project_dir / ansible_config if str(ansible_config).startswith("ansible-config/") else project_dir / "ansible-config" / ansible_config
    created = create_execution_record(
        {
            "status": "QUEUED",
            "playbookName": playbook_name,
            "mode": mode,
            "runParams": {
                "temp_playbook": str(playbook_path),
                "temp_inventory": str(inventory_path),
                "inventory_files": selected_inventory_files,
                "ansible_config": str(cfg_path) if cfg_path.exists() else None,
                "project_dir": str(project_dir),
                "host": host,
                "limit_host": ansible_host,
                "execution_type": execution_type,
                "temp_key_files": temp_key_files,
            },
            "description": description,
        },
        project_id=project_id,
        execution_id=execution_id,
    )
    if not created:
        raise PlaybookHttpError(500, "Failed to create execution record")
    return {
        "success": True,
        "executionId": created,
        "message": message,
        "status": "QUEUED",
    }


def queue_atlas_run(
    project: dict[str, Any],
    project_id: str,
    body: dict[str, Any],
    *,
    can_execute: bool,
    can_root_ssh: bool,
) -> dict[str, Any]:
    if project.get("kind") != "atlas":
        raise PlaybookHttpError(400, "Not an atlas project")
    root_ssh = bool(body.get("root_ssh") or body.get("rootSsh"))
    rbac_err = atlas_run_error(
        can_execute=can_execute, can_root_ssh=can_root_ssh, root_ssh=root_ssh
    )
    if rbac_err:
        raise PlaybookHttpError(403, rbac_err)
    phases = body.get("phases") or []
    if isinstance(phases, str):
        phases = [item.strip() for item in phases.split(",") if item.strip()]
    requested = body.get("cluster_id") or body.get("clusterId")
    fallback = project.get("cluster_id")
    try:
        cluster_id = resolve_inspect_cluster_id(
            requested=str(requested).strip() if requested else None,
            fallback=str(fallback).strip() if fallback else None,
            run_params=inspect_run_params_from_project(project),
        )
    except InspectError as exc:
        raise PlaybookHttpError(400, str(exc)) from exc
    if not cluster_id:
        raise PlaybookHttpError(400, "cluster_id missing on atlas project")
    argv = ["--cluster", str(cluster_id), "run"]
    if phases:
        argv.extend(["--phases", ",".join(phases)])
    if body.get("dry_run") or body.get("dryRun"):
        argv.append("--dry-run")
    if root_ssh:
        argv.append("--root-ssh")
    extra = body.get("extra_args") or body.get("extraArgs") or []
    if isinstance(extra, list):
        argv.extend(str(item) for item in extra)
    execution_id = str(uuid.uuid4())
    created = create_execution_record(
        {
            "kind": "atlas",
            "playbookName": "clusterctl",
            "mode": "ATLAS",
            "status": "QUEUED",
            "runParams": {
                "executor": "clusterctl",
                "cluster_id": cluster_id,
                "clusterctl_root": body.get("clusterctl_root") or project.get("clusterctlRoot"),
                "clusters_root": body.get("clusters_root") or project.get("clustersRoot"),
                "workspace_root": body.get("workspace_root") or project.get("workspaceRoot"),
                "phases": phases,
                "argv": argv,
                "root_ssh": root_ssh,
                "project_dir": str(get_project_dir(project_id)),
            },
        },
        project_id=project_id,
        execution_id=execution_id,
    )
    if not created:
        raise PlaybookHttpError(500, "Failed to queue atlas run")
    return {
        "success": True,
        "status": "queued",
        "executionId": execution_id,
        "kind": "atlas",
    }


def queue_atlas_workspace_reset(
    project: dict[str, Any],
    project_id: str,
    body: dict[str, Any],
    *,
    can_execute: bool,
) -> dict[str, Any]:
    if project.get("kind") != "atlas":
        raise PlaybookHttpError(400, "Not an atlas project")
    rbac_err = atlas_run_error(
        can_execute=can_execute, can_root_ssh=True, root_ssh=False
    )
    if rbac_err:
        raise PlaybookHttpError(403, rbac_err)
    payload = body or {}
    requested = payload.get("cluster_id") or payload.get("clusterId")
    fallback = project.get("cluster_id")
    try:
        cluster_id = resolve_inspect_cluster_id(
            requested=str(requested).strip() if requested else None,
            fallback=str(fallback).strip() if fallback else None,
            run_params=inspect_run_params_from_project(project),
        )
    except InspectError as exc:
        raise PlaybookHttpError(400, str(exc)) from exc
    if not cluster_id:
        raise PlaybookHttpError(400, "cluster_id missing on atlas project")
    argv = ["workspace", "reset", "--yes"]
    execution_id = str(uuid.uuid4())
    created = create_execution_record(
        {
            "kind": "atlas",
            "playbookName": "workspace reset",
            "mode": "ATLAS",
            "status": "QUEUED",
            "runParams": {
                "executor": "clusterctl",
                "cluster_id": cluster_id,
                "clusterctl_root": payload.get("clusterctl_root")
                or project.get("clusterctlRoot"),
                "clusters_root": payload.get("clusters_root")
                or project.get("clustersRoot"),
                "workspace_root": payload.get("workspace_root")
                or project.get("workspaceRoot"),
                "argv": argv,
                "project_dir": str(get_project_dir(project_id)),
            },
        },
        project_id=project_id,
        execution_id=execution_id,
    )
    if not created:
        raise PlaybookHttpError(500, "Failed to queue workspace reset")
    return {
        "success": True,
        "status": "queued",
        "executionId": execution_id,
        "kind": "atlas",
    }


def _atlas_repos_sync_token(raw: Any, field: str) -> str:
    value = str(raw or "").strip()
    if not value:
        return ""
    if value.startswith("-") or ".." in value or "/" in value or "\\" in value:
        raise PlaybookHttpError(400, f"invalid {field}")
    return value


def queue_atlas_repos_sync(
    project: dict[str, Any],
    project_id: str,
    body: dict[str, Any],
    *,
    can_execute: bool,
) -> dict[str, Any]:
    if project.get("kind") != "atlas":
        raise PlaybookHttpError(400, "Not an atlas project")
    rbac_err = atlas_run_error(
        can_execute=can_execute, can_root_ssh=True, root_ssh=False
    )
    if rbac_err:
        raise PlaybookHttpError(403, rbac_err)
    payload = body or {}
    requested = payload.get("cluster_id") or payload.get("clusterId")
    fallback = project.get("cluster_id")
    try:
        cluster_id = resolve_inspect_cluster_id(
            requested=str(requested).strip() if requested else None,
            fallback=str(fallback).strip() if fallback else None,
            run_params=inspect_run_params_from_project(project),
        )
    except InspectError as exc:
        raise PlaybookHttpError(400, str(exc)) from exc
    if not cluster_id:
        raise PlaybookHttpError(400, "cluster_id missing on atlas project")
    repo = _atlas_repos_sync_token(payload.get("repo"), "repo")
    phase = _atlas_repos_sync_token(payload.get("phase"), "phase")
    argv = ["repos", "sync"]
    playbook_name = "repos sync"
    if repo:
        argv.extend(["--repo", repo])
        playbook_name = f"repos sync --repo {repo}"
    if phase:
        argv.extend(["--phase", phase])
        playbook_name = f"{playbook_name} --phase {phase}"
    execution_id = str(uuid.uuid4())
    created = create_execution_record(
        {
            "kind": "atlas",
            "playbookName": playbook_name,
            "mode": "ATLAS",
            "status": "QUEUED",
            "runParams": {
                "executor": "clusterctl",
                "cluster_id": cluster_id,
                "clusterctl_root": payload.get("clusterctl_root")
                or project.get("clusterctlRoot"),
                "clusters_root": payload.get("clusters_root")
                or project.get("clustersRoot"),
                "workspace_root": payload.get("workspace_root")
                or project.get("workspaceRoot"),
                "argv": argv,
                "project_dir": str(get_project_dir(project_id)),
            },
        },
        project_id=project_id,
        execution_id=execution_id,
    )
    if not created:
        raise PlaybookHttpError(500, "Failed to queue repos sync")
    return {
        "success": True,
        "status": "queued",
        "executionId": execution_id,
        "kind": "atlas",
    }
