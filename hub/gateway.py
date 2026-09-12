#!/usr/bin/env python3
"""FastAPI control plane for atlas-ui hub (projects, workers, ansible, atlas inspect)."""
from __future__ import annotations

import os
import logging
import shutil
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator, Optional

from fastapi import Body, FastAPI, File, Header, HTTPException, Query, Response, UploadFile
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse

_app_dir = Path(__file__).resolve().parent
# hub/ locally (repo root = parent); Docker copies hub files to /app.
BASE_DIR = _app_dir.parent if _app_dir.name in {"backend", "hub"} else _app_dir
DATA_DIR = Path(os.environ.get("DATA_DIR", str(BASE_DIR / "data")))
DATA_DIR.mkdir(parents=True, exist_ok=True)
PROJECTS_CONFIG_FILE = DATA_DIR / "projects.json"
PROJECTS_DIR = DATA_DIR / "projects"
PROJECTS_DIR.mkdir(parents=True, exist_ok=True)
logger = logging.getLogger(__name__)

from atlas_cluster_fs import (  # noqa: E402
    AtlasClusterFsError,
    is_atlas_project,
    list_atlas_playbook_entries,
    list_atlas_role_packs,
    read_atlas_cluster_yaml,
    read_atlas_playbook_yaml,
    resolve_atlas_inventory_leaf,
    write_atlas_cluster_yaml,
    write_atlas_playbook_yaml,
)
from atlas_inspect import (  # noqa: E402
    InspectError,
    inspect_atlas,
    list_atlas_inventory_clusters,
    list_atlas_logs,
    list_atlas_workspace,
    read_atlas_file,
    read_atlas_log,
    read_atlas_workspace_file,
    resolve_inspect_cluster_id,
)
from clusterctl_config import (  # noqa: E402
    apply_project_path_fields,
    clusterctl_root_from_project,
    inspect_run_params_from_project,
    load_path_defaults,
)
from clusterctl_git import (  # noqa: E402
    ClusterctlGitError,
    clone_clusterctl,
    inspect_checkout,
    pull_clusterctl,
)
from git_pull import (  # noqa: E402
    GitPullError,
    apply_git_pull_fields,
    claim_run_params_with_git_pull,
    cleanup_git_pull_keys,
)
from project_kind import (  # noqa: E402
    ProjectKindError,
    reject_kind_mutation,
    with_kind,
)
from projects_create import create_project_record  # noqa: E402
from projects_store import get_project, load_projects, save_projects  # noqa: E402
from executions_http import (  # noqa: E402
    ExecutionHttpError,
    cancel_execution,
    iter_execution_log_sse,
    list_executions,
    stop_execution,
)
from executions_store import (  # noqa: E402
    append_execution_log,
    get_execution,
    update_execution_record,
)
from autosync_http import (  # noqa: E402
    AutosyncHttpError,
    get_autosync,
    update_autosync,
)
from host_status import get_host_statuses, set_host_check_status  # noqa: E402
from inventory_http import (  # noqa: E402
    InventoryHttpError,
    add_group,
    add_host,
    assign_host_to_group,
    bind_atlas_inventory,
    delete_ansible_config,
    delete_group,
    delete_inventory_file,
    delete_vars_file,
    export_inventory_zip,
    get_ansible_config,
    get_group_vars,
    get_vars_file,
    import_inventory_archive,
    list_ansible_config,
    list_groups,
    list_hosts,
    list_inventory_files,
    list_preview_vars,
    list_vars_files,
    put_group_vars,
    put_vars_file,
    read_inventory_file,
    require_project_id as require_inventory_project,
    reset_atlas_inventory,
    save_ansible_config,
    save_inventory_file,
    select_ansible_config,
    set_group_hosts,
    set_host_connection_secret,
)
from permissions_http import (  # noqa: E402
    PermissionsHttpError,
    create_permission as create_permission_record,
    delete_permission as delete_permission_record,
    get_permission as get_permission_record,
    list_permissions,
    list_permissions_by_resource,
    update_permission as update_permission_record,
)
from playbook_storage import PlaybookStorage  # noqa: E402
from playbooks_http import (  # noqa: E402
    PlaybookHttpError,
    create_playbook as create_playbook_record,
    get_playbook,
    get_schedule,
    list_playbooks as list_playbook_records,
    next_run_time,
    preview_playbook,
    queue_atlas_init,
    queue_atlas_repos_sync,
    queue_atlas_run,
    queue_atlas_workspace_reset,
    queue_host_check,
    queue_host_facts,
    queue_playbook_run,
    save_schedule,
    update_playbook as update_playbook_record,
    validate_playbook_payload,
)
from secrets_http import (  # noqa: E402
    SecretsHttpError,
    create_secret,
    delete_secret,
    get_secret,
    list_secrets,
    list_secrets_meta,
    update_secret,
)
from roles_files_http import (  # noqa: E402
    RolesFilesHttpError,
    bind_atlas_role_packs,
    get_role_file,
    get_role_handbook_file,
    get_roles_storage,
    list_role_files,
    list_role_handbook,
    put_role_file,
    reset_atlas_role_packs,
)
from sources_http import (  # noqa: E402
    SourcesHttpError,
    get_sources,
    get_sources_status,
    sync_source,
    test_source,
    update_sources,
)
from users_http import (  # noqa: E402
    UsersHttpError,
    create_user as create_user_record,
    delete_user as delete_user_record,
    get_user as get_user_record,
    list_users,
    update_user as update_user_record,
)
from roles_http import (  # noqa: E402
    RolesHttpError,
    create_role as create_role_record,
    delete_role as delete_role_record,
    get_role as get_role_record,
    list_roles,
    update_role as update_role_record,
)
from vault_files_http import (  # noqa: E402
    VaultFilesHttpError,
    decrypt_vault_file,
    encrypt_vault_file,
    get_vault_file,
    save_vault_file,
)
from vault_http import (  # noqa: E402
    VaultHttpError,
    create_vault,
    create_vault_key,
    decrypt_vault_content,
    delete_vault,
    delete_vault_key,
    encrypt_vault_content,
    get_vault,
    get_vault_key,
    list_vault_keys,
    list_vaults,
    update_vault,
    update_vault_key,
)
from backup_http import (  # noqa: E402
    BackupHttpError,
    create_project_archive,
    download_archive_path,
    get_backup_settings,
    list_project_archives,
    restore_project_archive,
    update_backup_settings,
)
from server_logs_http import list_server_logs  # noqa: E402
from execution_settings_http import (  # noqa: E402
    ExecutionSettingsHttpError,
    clear_all_executions,
    configure_hub_file_logging,
    get_execution_stats,
    load_execution_settings,
    update_execution_settings,
)
from global_secrets_http import (  # noqa: E402
    GlobalSecretsHttpError,
    create_encryption_key,
    create_global_secret,
    delete_global_secret,
    encryption_key_status,
    get_global_secret,
    global_secret_options,
    global_secrets_permissions,
    list_global_secrets,
    replace_encryption_key,
    update_global_secret,
)
from worker_claim import server_claim_next_execution  # noqa: E402
from worker_registry import (  # noqa: E402
    create_worker,
    delete_worker,
    disable_worker,
    enable_worker,
    ensure_default_worker,
    ensure_worker_token_file_mode,
    infer_worker_runtime,
    load_all_workers,
    load_worker,
    rotate_worker_token,
    save_worker,
    update_worker,
    update_worker_heartbeat,
    verify_token as verify_worker_token,
)

try:
    from auth import generate_token, verify_token, get_token_from_header
    from user_service import UserService
    from role_service import RoleService, PermissionService
    from auth_validators import validate_username, validate_password
    from auth_seed import seed_default_roles, seed_default_user
except ImportError:
    generate_token = None  # type: ignore
    verify_token = None  # type: ignore
    get_token_from_header = None  # type: ignore
    UserService = None  # type: ignore
    RoleService = None  # type: ignore
    PermissionService = None  # type: ignore
    seed_default_roles = None  # type: ignore
    seed_default_user = None  # type: ignore
    validate_username = None  # type: ignore
    validate_password = None  # type: ignore

app = FastAPI(title="atlas-ui hub", version="0.1.0")
user_service = UserService(DATA_DIR) if UserService else None
role_service = RoleService(DATA_DIR) if RoleService else None
permission_service = PermissionService(DATA_DIR) if PermissionService else None
playbook_storage = PlaybookStorage(PROJECTS_DIR)
try:
    from permission_service import AccessControlService
except ImportError:
    AccessControlService = None  # type: ignore
access_control = AccessControlService(DATA_DIR) if AccessControlService else None
if user_service and role_service and permission_service and seed_default_roles and seed_default_user:
    seed_default_roles(
        role_service, permission_service, DATA_DIR, user_service=user_service
    )
    seed_default_user(user_service, role_service, DATA_DIR)
ensure_default_worker()
ensure_worker_token_file_mode()


def _bearer(authorization: Optional[str]) -> Optional[str]:
    if get_token_from_header:
        return get_token_from_header(authorization)
    if not authorization:
        return None
    parts = authorization.split()
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1]
    return None


def _require_user(authorization: Optional[str], *, allow_must_change: bool = False) -> dict[str, Any]:
    token = _bearer(authorization)
    if not token or not verify_token:
        raise HTTPException(status_code=401, detail="Authentication required")
    payload = verify_token(token, DATA_DIR, token_type="access")
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    if payload.get("must_change_password") and not allow_must_change:
        raise HTTPException(status_code=403, detail="Password change required")
    return payload


def _role_names_for_user(user: Any) -> list[str]:
    names: list[str] = []
    if not role_service:
        return names
    for role_id in user.roles or []:
        role = role_service.get_role_by_id(role_id)
        if role:
            names.append(role.name)
    return names


def _token_extra(user: Any) -> dict[str, Any]:
    return {"must_change_password": bool(getattr(user, "must_change_password", False))}


def _require_worker(authorization: Optional[str]) -> tuple[str, dict[str, Any]]:
    token = _bearer(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")
    result = verify_worker_token(token)
    if not result:
        raise HTTPException(status_code=401, detail="Invalid worker token")
    return result


_claim_rate_limits: dict[str, float] = {}
CLAIM_RATE_LIMIT_SECONDS = 1


def _execution_http_error(exc: ExecutionHttpError) -> JSONResponse:
    return JSONResponse({"success": False, "error": exc.message}, status_code=exc.status_code)


def _domain_error(
    exc: InventoryHttpError
    | PlaybookHttpError
    | VaultHttpError
    | SecretsHttpError
    | SourcesHttpError
    | RolesFilesHttpError
    | UsersHttpError
    | RolesHttpError
    | PermissionsHttpError
    | VaultFilesHttpError
    | AutosyncHttpError
    | ExecutionSettingsHttpError
    | GlobalSecretsHttpError
    | BackupHttpError
    | AtlasClusterFsError,
) -> JSONResponse:
    payload: dict[str, Any] = {"success": False, "error": exc.message}
    code = getattr(exc, "error_code", None)
    if code:
        payload["errorCode"] = code
    extra = getattr(exc, "extra", None)
    if isinstance(extra, dict):
        payload.update(extra)
    return JSONResponse(payload, status_code=exc.status_code)


def _user_can(payload: dict[str, Any], names: list[str]) -> bool:
    roles = payload.get("roles") or []
    if "admin" in roles:
        return True
    user_id = payload.get("user_id")
    if access_control and user_id:
        return access_control.has_any_permission(user_id, names)
    return False


def _query_project_id(
    project_id: Optional[str] = None,
    body: Optional[dict[str, Any]] = None,
) -> str:
    raw = project_id or (body or {}).get("project_id")
    return require_inventory_project(str(raw) if raw else None)


@app.get("/health")
def health():
    return {"ok": True, "plane": "fastapi"}


@app.post("/api/auth/login")
def login(body: dict[str, Any]):
    if not user_service or not generate_token:
        raise HTTPException(status_code=503, detail="Auth modules unavailable")
    username = str(body.get("username") or "").strip()
    password = str(body.get("password") or "")
    if validate_username:
        ok, err = validate_username(username)
        if not ok:
            raise HTTPException(status_code=400, detail=err)
    if validate_password:
        ok, err = validate_password(password)
        if not ok:
            raise HTTPException(status_code=400, detail=err)
    user = user_service.authenticate(username, password)
    if not user:
        raise HTTPException(status_code=401, detail="Incorrect username or password")
    role_names = _role_names_for_user(user)
    extra = _token_extra(user)
    access_token = generate_token(
        user_id=user.id,
        username=user.username,
        roles=role_names,
        data_dir=DATA_DIR,
        token_type="access",
        extra=extra,
    )
    refresh_token = generate_token(
        user_id=user.id,
        username=user.username,
        roles=role_names,
        data_dir=DATA_DIR,
        token_type="refresh",
        extra=extra,
    )
    return {
        "success": True,
        "access_token": access_token,
        "refresh_token": refresh_token,
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "roles": role_names,
            "must_change_password": bool(user.must_change_password),
        },
    }


@app.get("/api/auth/me")
def me(authorization: Optional[str] = Header(None)):
    payload = _require_user(authorization, allow_must_change=True)
    user = user_service.get_user_by_id(payload.get("user_id")) if user_service else None
    must_change = bool(user.must_change_password) if user else bool(payload.get("must_change_password"))
    username = (user.username if user else None) or payload.get("username")
    return {
        "success": True,
        "username": username,
        "must_change_password": must_change,
        "user": {
            "id": payload.get("user_id"),
            "username": username,
            "roles": payload.get("roles") or [],
            "must_change_password": must_change,
        },
    }


@app.post("/api/auth/change-password")
def change_password(body: dict[str, Any], authorization: Optional[str] = Header(None)):
    payload = _require_user(authorization, allow_must_change=True)
    if not user_service:
        raise HTTPException(status_code=503, detail="Auth modules unavailable")
    old_password = str(body.get("old_password") or body.get("current_password") or "")
    new_password = str(body.get("new_password") or "")
    if validate_password:
        ok, err = validate_password(new_password)
        if not ok:
            raise HTTPException(status_code=400, detail=err)
    user_id = str(payload.get("user_id") or "")
    if not user_service.change_password(user_id, old_password, new_password):
        raise HTTPException(status_code=401, detail="Current password is incorrect")
    user = user_service.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    extra = _token_extra(user)
    roles = _role_names_for_user(user)
    return {
        "success": True,
        "access_token": generate_token(
            user_id=user.id,
            username=user.username,
            roles=roles,
            data_dir=DATA_DIR,
            token_type="access",
            extra=extra,
        ),
        "refresh_token": generate_token(
            user_id=user.id,
            username=user.username,
            roles=roles,
            data_dir=DATA_DIR,
            token_type="refresh",
            extra=extra,
        ),
        "user": {
            "id": user.id,
            "username": user.username,
            "roles": roles,
            "must_change_password": False,
        },
    }


@app.get("/api/projects")
def list_projects(include_archived: bool = False, authorization: Optional[str] = Header(None)):
    _require_user(authorization)
    projects = load_projects(PROJECTS_CONFIG_FILE)
    if not include_archived:
        projects = [p for p in projects if not p.get("isArchived")]
    return {"success": True, "projects": projects}


@app.post("/api/projects")
def create_project(body: dict[str, Any], authorization: Optional[str] = Header(None)):
    payload = _require_user(authorization)
    try:
        return create_project_record(
            body,
            username=str(payload.get("username") or "current_user"),
            config_file=PROJECTS_CONFIG_FILE,
            projects_dir=PROJECTS_DIR,
        )
    except ProjectKindError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/projects/{project_id}")
def get_project_route(project_id: str, authorization: Optional[str] = Header(None)):
    _require_user(authorization)
    project = get_project(PROJECTS_CONFIG_FILE, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"success": True, "project": with_kind(project)}


@app.put("/api/projects/{project_id}")
def update_project(project_id: str, body: dict[str, Any], authorization: Optional[str] = Header(None)):
    _require_user(authorization)
    projects = load_projects(PROJECTS_CONFIG_FILE)
    project = next((p for p in projects if p.get("id") == project_id), None)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    try:
        reject_kind_mutation(project, body)
    except ProjectKindError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if "name" in body:
        new_name = str(body["name"]).strip()
        if not new_name:
            raise HTTPException(status_code=400, detail="Project name cannot be empty")
        project["name"] = new_name
    if "description" in body:
        project["description"] = str(body["description"]).strip()
    if "isArchived" in body:
        project["isArchived"] = bool(body["isArchived"])
    apply_project_path_fields(project, body)
    try:
        apply_git_pull_fields(
            project, body, data_dir=DATA_DIR, project_id=project_id
        )
    except GitPullError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    project["updatedAt"] = time.time()
    save_projects(PROJECTS_CONFIG_FILE, projects)
    return {"success": True, "project": with_kind(project)}


def _require_atlas_project(project_id: str) -> dict[str, Any]:
    project = get_project(PROJECTS_CONFIG_FILE, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    project = with_kind(project)
    if project.get("kind") != "atlas":
        raise HTTPException(
            status_code=400, detail="atlas inspect is only available for atlas projects"
        )
    if not str(project.get("cluster_id") or "").strip():
        raise HTTPException(status_code=400, detail="cluster_id is required")
    return project


def _inspect_params(project: dict[str, Any]) -> dict[str, Any]:
    return inspect_run_params_from_project(project)


def _requested_cluster_id(*values: Any) -> Optional[str]:
    for raw in values:
        if raw is None:
            continue
        text = str(raw).strip()
        if text:
            return text
    return None


@contextmanager
def _atlas_infra_scope(project_id: str, *cluster_values: Any) -> Iterator[None]:
    requested = _requested_cluster_id(*cluster_values)
    project = get_project(PROJECTS_CONFIG_FILE, project_id)
    leaf = resolve_atlas_inventory_leaf(project_id, requested, project=project)
    packs = None
    if leaf is not None:
        packs = {
            name: path
            for name, path in list_atlas_role_packs(
                project_id, requested, project=project
            )
        }
    elif is_atlas_project(project_id, project=project):
        packs = {}
    inv_token = bind_atlas_inventory(leaf)
    roles_token = bind_atlas_role_packs(packs)
    try:
        yield
    finally:
        reset_atlas_role_packs(roles_token)
        reset_atlas_inventory(inv_token)


def _resolve_atlas_cluster_id(
    project: dict[str, Any], requested: Optional[str] = None
) -> str:
    return resolve_inspect_cluster_id(
        requested=requested,
        fallback=str(project.get("cluster_id") or "").strip() or None,
        run_params=_inspect_params(project),
    )


@app.get("/api/projects/{project_id}/atlas/path-defaults")
def atlas_path_defaults_route(
    project_id: str, authorization: Optional[str] = Header(None)
):
    _require_user(authorization)
    project = _require_atlas_project(project_id)
    defaults = load_path_defaults(clusterctl_root_from_project(project))
    return {"success": True, **defaults}


@app.get("/api/projects/{project_id}/atlas/clusters")
def atlas_clusters_route(
    project_id: str, authorization: Optional[str] = Header(None)
):
    _require_user(authorization)
    project = _require_atlas_project(project_id)
    try:
        listed = list_atlas_inventory_clusters(_inspect_params(project))
    except InspectError as exc:
        return _inspect_http_error(exc)
    return {"success": True, **listed}


def _inspect_http_error(exc: InspectError) -> JSONResponse:
    return JSONResponse({"success": False, "error": str(exc)}, status_code=400)


@app.post("/api/projects/{project_id}/atlas/inspect")
def atlas_inspect_route(
    project_id: str,
    body: dict[str, Any],
    authorization: Optional[str] = Header(None),
):
    _require_user(authorization)
    project = _require_atlas_project(project_id)
    argv = body.get("argv") if isinstance(body, dict) else None
    if not isinstance(argv, list):
        raise HTTPException(status_code=400, detail="argv must be an array")
    requested = _requested_cluster_id(
        body.get("cluster_id") if isinstance(body, dict) else None,
        body.get("clusterId") if isinstance(body, dict) else None,
    )
    try:
        cluster_id = _resolve_atlas_cluster_id(project, requested)
        result = inspect_atlas(
            argv,
            cluster_id,
            _inspect_params(project),
        )
    except InspectError as exc:
        return _inspect_http_error(exc)
    return {"success": True, **result}


@app.get("/api/projects/{project_id}/atlas/log")
def atlas_log_route(
    project_id: str,
    stamp: Optional[str] = Query(None),
    cluster_id: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
):
    _require_user(authorization)
    project = _require_atlas_project(project_id)
    params = _inspect_params(project)
    try:
        resolved = _resolve_atlas_cluster_id(
            project, _requested_cluster_id(cluster_id)
        )
        if stamp:
            log = read_atlas_log(resolved, stamp, params)
            return {"success": True, "stamp": stamp, "log": log}
        listed = list_atlas_logs(resolved, params)
        return {"success": True, **listed}
    except InspectError as exc:
        return _inspect_http_error(exc)


@app.get("/api/projects/{project_id}/atlas/file")
def atlas_file_route(
    project_id: str,
    rel: str = Query(...),
    cluster_id: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
):
    _require_user(authorization)
    project = _require_atlas_project(project_id)
    try:
        resolved = _resolve_atlas_cluster_id(
            project, _requested_cluster_id(cluster_id)
        )
        payload = read_atlas_file(resolved, rel, _inspect_params(project))
    except InspectError as exc:
        return _inspect_http_error(exc)
    return {"success": True, **payload}


@app.get("/api/projects/{project_id}/atlas/workspace/ls")
def atlas_workspace_ls_route(
    project_id: str,
    rel: Optional[str] = Query(""),
    cluster_id: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
):
    _require_user(authorization)
    project = _require_atlas_project(project_id)
    try:
        resolved = _resolve_atlas_cluster_id(
            project, _requested_cluster_id(cluster_id)
        )
        payload = list_atlas_workspace(
            resolved, rel or "", _inspect_params(project)
        )
    except InspectError as exc:
        return _inspect_http_error(exc)
    return {"success": True, **payload}


@app.get("/api/projects/{project_id}/atlas/workspace/file")
def atlas_workspace_file_route(
    project_id: str,
    rel: str = Query(...),
    cluster_id: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
):
    _require_user(authorization)
    project = _require_atlas_project(project_id)
    try:
        resolved = _resolve_atlas_cluster_id(
            project, _requested_cluster_id(cluster_id)
        )
        payload = read_atlas_workspace_file(
            resolved, rel, _inspect_params(project)
        )
    except InspectError as exc:
        return _inspect_http_error(exc)
    return {"success": True, **payload}


@app.get("/api/projects/{project_id}/atlas/cluster-yaml")
def atlas_cluster_yaml_get(
    project_id: str,
    cluster_id: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
):
    _require_user(authorization)
    project = get_project(PROJECTS_CONFIG_FILE, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    try:
        payload = read_atlas_cluster_yaml(
            project_id, _requested_cluster_id(cluster_id), project=project
        )
    except AtlasClusterFsError as exc:
        return _domain_error(exc)
    return {"success": True, **payload}


@app.put("/api/projects/{project_id}/atlas/cluster-yaml")
def atlas_cluster_yaml_put(
    project_id: str,
    body: dict[str, Any],
    cluster_id: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
):
    _require_user(authorization)
    project = get_project(PROJECTS_CONFIG_FILE, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    requested = _requested_cluster_id(cluster_id, (body or {}).get("cluster_id"))
    content = (body or {}).get("content")
    if content is None:
        content = (body or {}).get("yaml")
    if content is None:
        raise HTTPException(status_code=400, detail="content is required")
    try:
        payload = write_atlas_cluster_yaml(
            project_id, str(content), requested, project=project
        )
    except AtlasClusterFsError as exc:
        return _domain_error(exc)
    return {"success": True, **payload}


@app.post("/api/projects/{project_id}/restore")
def restore_project(project_id: str, authorization: Optional[str] = Header(None)):
    _require_user(authorization)
    projects = load_projects(PROJECTS_CONFIG_FILE)
    project = next((p for p in projects if p.get("id") == project_id), None)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if not project.get("isArchived"):
        raise HTTPException(status_code=400, detail="Project is not archived")
    project["isArchived"] = False
    project["updatedAt"] = time.time()
    save_projects(PROJECTS_CONFIG_FILE, projects)
    return {"success": True, "project": with_kind(project)}


@app.delete("/api/projects/{project_id}")
def delete_project(project_id: str, authorization: Optional[str] = Header(None)):
    _require_user(authorization)
    projects = load_projects(PROJECTS_CONFIG_FILE)
    project = next((p for p in projects if p.get("id") == project_id), None)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    remaining = [p for p in projects if p.get("id") != project_id]
    save_projects(PROJECTS_CONFIG_FILE, remaining)
    project_dir = PROJECTS_DIR / project_id
    if project_dir.exists():
        shutil.rmtree(project_dir, ignore_errors=True)
    return {"success": True, "message": "Project deleted permanently"}


@app.post("/api/auth/refresh")
def auth_refresh(body: dict[str, Any]):
    if not user_service or not generate_token or not verify_token:
        raise HTTPException(status_code=503, detail="Auth modules unavailable")
    refresh_token = str(body.get("refresh_token") or "").strip()
    if not refresh_token:
        raise HTTPException(status_code=400, detail="Refresh token обязателен")
    payload = verify_token(refresh_token, DATA_DIR, token_type="refresh")
    if not payload:
        raise HTTPException(status_code=401, detail="Невалидный или истекший refresh token")
    user = user_service.get_user_by_id(payload.get("user_id"))
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Пользователь не найден или неактивен")
    extra = _token_extra(user)
    role_names = _role_names_for_user(user)
    access_token = generate_token(
        user_id=user.id,
        username=user.username,
        roles=role_names,
        data_dir=DATA_DIR,
        token_type="access",
        extra=extra,
    )
    return {"success": True, "access_token": access_token}


@app.post("/api/worker/register")
def worker_register(body: dict[str, Any], authorization: Optional[str] = Header(None)):
    payload = _require_user(authorization)
    if not _user_can(payload, ["admin"]):
        return JSONResponse({"success": False, "error": "Permission denied"}, status_code=403)
    name = str((body or {}).get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Worker name is required")
    worker_id, worker_token = create_worker(
        name,
        (body or {}).get("capabilities") or {},
        (body or {}).get("tags") or [],
    )
    return {"success": True, "workerId": worker_id, "workerToken": worker_token}


@app.post("/api/worker/claim")
def worker_claim(body: dict[str, Any], authorization: Optional[str] = Header(None)):
    worker_id, worker_data = _require_worker(authorization)
    now = time.time()
    last = _claim_rate_limits.get(worker_id, 0)
    if now - last < CLAIM_RATE_LIMIT_SECONDS:
        raise HTTPException(status_code=429, detail="Rate limit exceeded")
    _claim_rate_limits[worker_id] = now
    payload = body or {}
    execution_id, execution, proj_id = server_claim_next_execution(
        worker_id=worker_id,
        worker_data=worker_data,
        project_id=payload.get("projectId"),
        max_concurrency=payload.get("maxConcurrency", 1),
        tags=payload.get("tags"),
        projects_dir=PROJECTS_DIR,
    )
    if not execution_id:
        return Response(status_code=204)
    update_worker_heartbeat(worker_id, current_execution_id=execution_id)
    project = get_project(PROJECTS_CONFIG_FILE, proj_id) or {}
    try:
        run_params = claim_run_params_with_git_pull(
            execution,
            project=project,
            project_id=str(proj_id),
            execution_id=str(execution_id),
            data_dir=DATA_DIR,
        )
    except GitPullError as exc:
        logger.warning(
            "git pull secret materialize failed for %s: %s", execution_id, exc.message
        )
        try:
            update_execution_record(
                execution_id,
                {"status": "FAILED", "error": exc.message, "finishedAt": time.time()},
                project_id=proj_id,
            )
        except Exception:
            logger.exception("failed to mark execution %s FAILED after gitPull error", execution_id)
        cleanup_git_pull_keys(str(proj_id), str(execution_id), data_dir=DATA_DIR)
        return Response(status_code=204)
    return {
        "success": True,
        "executionId": execution_id,
        "projectId": proj_id,
        "playbookId": execution.get("playbookId"),
        "kind": execution.get("kind"),
        "runParams": run_params,
        "queuedAt": execution.get("queuedAt"),
        "createdAt": execution.get("createdAt"),
        "selectionSnapshot": execution.get("selectionSnapshot", {}),
        "inventorySnapshot": execution.get("inventorySnapshot", {}),
    }


@app.post("/api/worker/heartbeat")
def worker_heartbeat(body: dict[str, Any], authorization: Optional[str] = Header(None)):
    worker_id, _worker = _require_worker(authorization)
    payload = body or {}
    update_worker_heartbeat(worker_id, current_execution_id=payload.get("currentExecutionId"))
    worker = load_worker(worker_id)
    request_system_info = bool(worker and worker.get("systemInfoRequested"))
    if request_system_info and worker:
        worker["systemInfoRequested"] = False
        save_worker(worker)
    cancel_requested = False
    current_id = payload.get("currentExecutionId")
    if current_id:
        running = get_execution(str(current_id))
        cancel_requested = bool(running and running.get("status") == "CANCELING")
    return {
        "success": True,
        "workerId": worker_id,
        "requestSystemInfo": request_system_info,
        "cancelRequested": cancel_requested,
    }


@app.post("/api/worker/system-info")
def worker_system_info(body: dict[str, Any], authorization: Optional[str] = Header(None)):
    worker_id, _worker = _require_worker(authorization)
    system_info = (body or {}).get("systemInfo")
    if not system_info:
        raise HTTPException(status_code=400, detail="Missing systemInfo")
    worker = load_worker(worker_id)
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")
    worker["systemInfo"] = system_info
    worker["systemInfoUpdatedAt"] = time.time()
    runtime = infer_worker_runtime(worker)
    if runtime:
        worker["runtime"] = runtime
    if not save_worker(worker):
        raise HTTPException(status_code=500, detail="Failed to save worker")
    return Response(status_code=204)


@app.get("/api/worker/executions/{execution_id}")
def worker_get_execution(
    execution_id: str, authorization: Optional[str] = Header(None)
):
    worker_id, _worker = _require_worker(authorization)
    execution = get_execution(execution_id)
    if not execution:
        raise HTTPException(status_code=404, detail="Execution not found")
    owner = execution.get("workerId")
    if owner and owner != worker_id:
        raise HTTPException(status_code=403, detail="Worker does not own this execution")
    status = execution.get("status")
    return {
        "success": True,
        "executionId": execution_id,
        "status": status,
        "cancelRequested": status == "CANCELING",
        "execution": {"id": execution_id, "status": status},
    }


@app.post("/api/worker/executions/{execution_id}/log")
def worker_execution_log(
    execution_id: str,
    body: dict[str, Any],
    authorization: Optional[str] = Header(None),
):
    worker_id, _worker = _require_worker(authorization)
    text = (body or {}).get("text", "")
    if not text:
        raise HTTPException(status_code=400, detail="Log text is required")
    execution = get_execution(execution_id)
    if not execution:
        raise HTTPException(status_code=404, detail="Execution not found")
    project_id = execution.get("projectId")
    if not project_id:
        raise HTTPException(status_code=400, detail="Execution has no projectId")
    if execution.get("workerId") != worker_id:
        raise HTTPException(status_code=403, detail="Worker does not own this execution")
    append_execution_log(execution_id, text, project_id=project_id)
    return {"success": True}


@app.post("/api/worker/executions/{execution_id}/finish")
def worker_execution_finish(
    execution_id: str,
    body: dict[str, Any],
    authorization: Optional[str] = Header(None),
):
    worker_id, _worker = _require_worker(authorization)
    payload = body or {}
    status = payload.get("status")
    if status not in ("SUCCESS", "FAILED", "CANCELED"):
        raise HTTPException(
            status_code=400, detail="Status must be SUCCESS, FAILED or CANCELED"
        )
    execution = get_execution(execution_id)
    if not execution:
        raise HTTPException(status_code=404, detail="Execution not found")
    project_id = execution.get("projectId")
    if not project_id:
        raise HTTPException(status_code=400, detail="Execution has no projectId")
    execution_worker_id = execution.get("workerId")
    if execution_worker_id and execution_worker_id != worker_id:
        raise HTTPException(status_code=403, detail="Worker does not own this execution")
    current = str(execution.get("status") or "")
    if current == "CANCELING" and status in ("SUCCESS", "FAILED", "CANCELED"):
        status = "CANCELED"
    elif current == "CANCELED":
        status = "CANCELED"
    updates: dict[str, Any] = {
        "status": status,
        "finishedAt": payload.get("finishedAt", time.time()),
    }
    if payload.get("duration") is not None:
        updates["duration"] = payload.get("duration")
    if payload.get("returnCode") is not None:
        updates["returnCode"] = payload.get("returnCode")
    if payload.get("error"):
        updates["error"] = payload.get("error")
    result = payload.get("result")
    if result:
        updates["result"] = result
    try:
        from execution_cleanup import cleanup_generated_playbooks_for_execution
    except ImportError:
        cleanup_generated_playbooks_for_execution = None  # type: ignore
    run_params = execution.get("runParams") or {}
    if set_host_check_status and run_params.get("execution_type") == "HOST_CHECK":
        hosts_list = run_params.get("hosts")
        if isinstance(hosts_list, list) and len(hosts_list) > 1 and isinstance(result, dict) and "hosts" in result:
            for host_name, host_status in (result.get("hosts") or {}).items():
                if host_name and host_status in ("online", "offline"):
                    set_host_check_status(project_id, host_name, host_status)
        else:
            host_name = run_params.get("host") or run_params.get("limit_host")
            host_status = "unknown"
            if status == "SUCCESS" and isinstance(result, dict):
                host_status = "online" if result.get("available") else "offline"
            elif status in ("FAILED", "CANCELED"):
                host_status = "offline"
            if host_name:
                set_host_check_status(project_id, host_name, host_status)
    update_execution_record(execution_id, updates, project_id=project_id)
    cleanup_git_pull_keys(str(project_id), str(execution_id), data_dir=DATA_DIR)
    if cleanup_generated_playbooks_for_execution:
        try:
            cleanup_generated_playbooks_for_execution(project_id, execution_id)
        except Exception:
            pass
    update_worker_heartbeat(worker_id, current_execution_id=None)
    return {"success": True}


@app.get("/api/executions")
def executions_list(
    project_id: Optional[str] = Query(None),
    limit: Optional[int] = Query(None),
    offset: int = Query(0),
    q: Optional[str] = Query(None),
    playbook_id: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
):
    _require_user(authorization)
    if not project_id:
        raise HTTPException(status_code=400, detail="Project ID is required")
    try:
        rows = list_executions(
            project_id,
            limit=limit,
            offset=offset,
            search_query=q or None,
            playbook_id=(playbook_id or "").strip() or None,
        )
    except ExecutionHttpError as exc:
        return _execution_http_error(exc)
    return {"success": True, "executions": rows}


@app.post("/api/executions/clear")
def executions_clear(
    body: dict[str, Any] = Body(default_factory=dict),
    authorization: Optional[str] = Header(None),
):
    _require_user(authorization)
    project_id = body.get("project_id")
    deleted = clear_all_executions(str(project_id) if project_id else None)
    return {"success": True, "deletedCount": deleted}


@app.get("/api/executions/{execution_id}")
def executions_get(
    execution_id: str,
    project_id: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
):
    _require_user(authorization)
    execution = get_execution(execution_id, project_id=project_id)
    if not execution:
        raise HTTPException(status_code=404, detail="Execution not found")
    return {"success": True, "execution": execution}


@app.get("/api/executions/{execution_id}/log/stream")
def executions_log_stream(
    execution_id: str,
    project_id: Optional[str] = Query(None),
    offset: int = Query(0),
    authorization: Optional[str] = Header(None),
):
    _require_user(authorization)
    if not project_id:
        raise HTTPException(status_code=400, detail="Project ID is required")

    def generate():
        yield from iter_execution_log_sse(execution_id, project_id, offset=offset)

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@app.post("/api/projects/{project_id}/executions/{execution_id}/cancel")
def executions_cancel(
    project_id: str,
    execution_id: str,
    authorization: Optional[str] = Header(None),
):
    _require_user(authorization)
    try:
        return cancel_execution(project_id, execution_id)
    except ExecutionHttpError as exc:
        return _execution_http_error(exc)


@app.post("/api/projects/{project_id}/executions/{execution_id}/stop")
def executions_stop(
    project_id: str,
    execution_id: str,
    authorization: Optional[str] = Header(None),
):
    _require_user(authorization)
    try:
        return stop_execution(project_id, execution_id)
    except ExecutionHttpError as exc:
        return _execution_http_error(exc)


def _public_worker(worker_id: str, worker_data: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": worker_id,
        "name": worker_data.get("name"),
        "description": worker_data.get("description"),
        "enabled": worker_data.get("enabled", True),
        "capabilities": worker_data.get("capabilities") or {},
        "tags": worker_data.get("tags") or [],
        "tagColors": worker_data.get("tagColors") or {},
        "createdAt": worker_data.get("createdAt"),
        "lastSeenAt": worker_data.get("lastSeenAt"),
        "currentExecutionId": worker_data.get("currentExecutionId"),
        "runtime": infer_worker_runtime(worker_data),
    }


@app.get("/api/admin/workers")
def admin_list_workers(authorization: Optional[str] = Header(None)):
    _require_user(authorization)
    workers = load_all_workers()
    return {
        "success": True,
        "workers": [
            _public_worker(worker_id, data) for worker_id, data in workers.items()
        ],
    }


@app.post("/api/admin/workers")
def admin_create_worker(body: dict[str, Any], authorization: Optional[str] = Header(None)):
    payload = _require_user(authorization)
    if not _user_can(payload, ["admin"]):
        return JSONResponse({"success": False, "error": "Permission denied"}, status_code=403)
    name = str((body or {}).get("name") or "").strip()
    if not name:
        return JSONResponse({"success": False, "error": "Worker name is required"}, status_code=400)
    worker_id, plaintext_token = create_worker(
        name,
        (body or {}).get("capabilities") or {},
        (body or {}).get("tags") or [],
    )
    return {
        "success": True,
        "workerId": worker_id,
        "workerToken": plaintext_token,
        "message": "IMPORTANT: Save this token! It will not be shown again.",
    }


@app.post("/api/admin/workers/{worker_id}/rotate-token")
def admin_rotate_worker(worker_id: str, authorization: Optional[str] = Header(None)):
    payload = _require_user(authorization)
    if not _user_can(payload, ["admin"]):
        return JSONResponse({"success": False, "error": "Permission denied"}, status_code=403)
    try:
        plaintext_token = rotate_worker_token(worker_id)
    except ValueError:
        return JSONResponse({"success": False, "error": "Worker not found"}, status_code=404)
    return {
        "success": True,
        "workerToken": plaintext_token,
        "message": "IMPORTANT: Save this token! It will not be shown again.",
    }


@app.post("/api/admin/workers/{worker_id}/enable")
def admin_enable_worker(worker_id: str, authorization: Optional[str] = Header(None)):
    _require_user(authorization)
    if not enable_worker(worker_id):
        raise HTTPException(status_code=404, detail="Worker not found")
    return {"success": True}


@app.post("/api/admin/workers/{worker_id}/disable")
def admin_disable_worker(worker_id: str, authorization: Optional[str] = Header(None)):
    _require_user(authorization)
    if not disable_worker(worker_id):
        raise HTTPException(status_code=404, detail="Worker not found")
    return {"success": True}


@app.get("/api/admin/workers/{worker_id}")
def admin_get_worker(worker_id: str, authorization: Optional[str] = Header(None)):
    _require_user(authorization)
    worker = load_worker(worker_id)
    if not worker:
        return JSONResponse({"success": False, "error": "Worker not found"}, status_code=404)
    return {"success": True, "worker": _public_worker(worker_id, worker)}


@app.patch("/api/admin/workers/{worker_id}")
def admin_patch_worker(
    worker_id: str,
    body: dict[str, Any],
    authorization: Optional[str] = Header(None),
):
    payload = _require_user(authorization)
    if not _user_can(payload, ["admin"]):
        return JSONResponse({"success": False, "error": "Permission denied"}, status_code=403)
    tags = body.get("tags") if isinstance(body, dict) else None
    if tags is not None and not isinstance(tags, list):
        return JSONResponse({"success": False, "error": "tags must be a list"}, status_code=400)
    ok = update_worker(
        worker_id,
        name=body.get("name") if "name" in (body or {}) else None,
        description=body.get("description") if "description" in (body or {}) else None,
        tags=tags,
    )
    if not ok:
        return JSONResponse({"success": False, "error": "Worker not found"}, status_code=404)
    worker = load_worker(worker_id) or {}
    return {"success": True, "worker": _public_worker(worker_id, worker)}


@app.delete("/api/admin/workers/{worker_id}")
def admin_delete_worker(worker_id: str, authorization: Optional[str] = Header(None)):
    payload = _require_user(authorization)
    if not _user_can(payload, ["admin"]):
        return JSONResponse({"success": False, "error": "Permission denied"}, status_code=403)
    if not delete_worker(worker_id):
        return JSONResponse({"success": False, "error": "Worker not found"}, status_code=404)
    return {"success": True, "message": "Worker deleted"}


@app.get("/api/inventory/list")
def inventory_list(
    project_id: Optional[str] = Query(None),
    cluster_id: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
):
    _require_user(authorization)
    try:
        pid = _query_project_id(project_id)
        with _atlas_infra_scope(pid, cluster_id):
            return {"success": True, "files": list_inventory_files(pid)}
    except InventoryHttpError as exc:
        return _domain_error(exc)


@app.get("/api/inventory/hosts")
def inventory_hosts(
    project_id: Optional[str] = Query(None),
    inventory_files: Optional[list[str]] = Query(None),
    cluster_id: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
):
    _require_user(authorization)
    try:
        pid = _query_project_id(project_id)
        with _atlas_infra_scope(pid, cluster_id):
            return {"success": True, "hosts": list_hosts(pid, inventory_files)}
    except InventoryHttpError as exc:
        return _domain_error(exc)


@app.get("/api/inventory/host-status")
def inventory_host_status(
    project_id: Optional[str] = Query(None),
    cluster_id: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
):
    _require_user(authorization)
    try:
        pid = _query_project_id(project_id)
        with _atlas_infra_scope(pid, cluster_id):
            return {"success": True, "hosts": get_host_statuses(pid)}
    except InventoryHttpError as exc:
        return _domain_error(exc)


@app.get("/api/inventory/preview")
def inventory_preview(
    project_id: Optional[str] = Query(None),
    cluster_id: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
):
    _require_user(authorization)
    try:
        pid = _query_project_id(project_id)
        with _atlas_infra_scope(pid, cluster_id):
            return list_preview_vars(pid)
    except InventoryHttpError as exc:
        return _domain_error(exc)


@app.get("/api/inventory/groups")
def inventory_groups_get(
    project_id: Optional[str] = Query(None),
    inventory_files: Optional[list[str]] = Query(None),
    cluster_id: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
):
    _require_user(authorization)
    try:
        pid = _query_project_id(project_id)
        with _atlas_infra_scope(pid, cluster_id):
            return {"success": True, "groups": list_groups(pid, inventory_files)}
    except InventoryHttpError as exc:
        return _domain_error(exc)


@app.post("/api/inventory/groups")
def inventory_groups_post(body: dict[str, Any], authorization: Optional[str] = Header(None)):
    _require_user(authorization)
    try:
        pid = _query_project_id(None, body)
        with _atlas_infra_scope(pid, body.get("cluster_id")):
            return add_group(
                pid,
                str(body.get("group_name") or ""),
                inventory_file=str(body.get("inventory_file") or ""),
                hosts=body.get("hosts") or [],
            )
    except InventoryHttpError as exc:
        return _domain_error(exc)


@app.post("/api/inventory/add_host")
def inventory_add_host(body: dict[str, Any], authorization: Optional[str] = Header(None)):
    _require_user(authorization)
    try:
        pid = _query_project_id(None, body)
        with _atlas_infra_scope(pid, body.get("cluster_id")):
            return add_host(
                pid,
                str(body.get("host_name") or ""),
                inventory_file=str(body.get("inventory_file") or "inventory.yml"),
                group_name=str(body.get("group_name") or "all"),
                host_ip=str(body.get("host_ip") or ""),
                vars_file=str(body.get("vars_file") or ""),
            )
    except InventoryHttpError as exc:
        return _domain_error(exc)


@app.get("/api/inventory/get")
def inventory_get(
    project_id: Optional[str] = Query(None),
    file: str = Query("inventories/inventory.yml"),
    cluster_id: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
):
    _require_user(authorization)
    try:
        pid = _query_project_id(project_id)
        with _atlas_infra_scope(pid, cluster_id):
            return read_inventory_file(pid, file)
    except InventoryHttpError as exc:
        return _domain_error(exc)


@app.post("/api/inventory/save")
def inventory_save(body: dict[str, Any], authorization: Optional[str] = Header(None)):
    _require_user(authorization)
    try:
        pid = _query_project_id(None, body)
        with _atlas_infra_scope(pid, body.get("cluster_id")):
            return save_inventory_file(
                pid,
                str(body.get("file") or "inventories/inventory.yml"),
                str(body.get("content") or ""),
            )
    except InventoryHttpError as exc:
        return _domain_error(exc)


@app.get("/api/inventory/export")
def inventory_export(
    project_id: Optional[str] = Query(None),
    cluster_id: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
):
    _require_user(authorization)
    try:
        pid = _query_project_id(project_id)
        with _atlas_infra_scope(pid, cluster_id):
            payload, filename = export_inventory_zip(pid)
    except InventoryHttpError as exc:
        return _domain_error(exc)
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    return Response(content=payload, media_type="application/zip", headers=headers)


@app.post("/api/inventory/import")
async def inventory_import(
    project_id: Optional[str] = Query(None),
    cluster_id: Optional[str] = Query(None),
    file: UploadFile = File(...),
    authorization: Optional[str] = Header(None),
):
    _require_user(authorization)
    try:
        pid = _query_project_id(project_id)
        payload = await file.read()
        with _atlas_infra_scope(pid, cluster_id):
            return import_inventory_archive(pid, file.filename or "", payload)
    except InventoryHttpError as exc:
        return _domain_error(exc)


@app.post("/api/inventory/delete")
def inventory_delete(body: dict[str, Any], authorization: Optional[str] = Header(None)):
    _require_user(authorization)
    try:
        pid = _query_project_id(None, body)
        with _atlas_infra_scope(pid, body.get("cluster_id")):
            return delete_inventory_file(pid, str(body.get("file") or body.get("path") or ""))
    except InventoryHttpError as exc:
        return _domain_error(exc)


@app.get("/api/inventory/vars")
def inventory_vars_list(
    project_id: Optional[str] = Query(None),
    kind: str = Query("group"),
    cluster_id: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
):
    _require_user(authorization)
    try:
        pid = _query_project_id(project_id)
        with _atlas_infra_scope(pid, cluster_id):
            return {"success": True, "files": list_vars_files(pid, kind)}
    except InventoryHttpError as exc:
        return _domain_error(exc)


@app.get("/api/inventory/vars/file")
def inventory_vars_get(
    project_id: Optional[str] = Query(None),
    path: str = Query(""),
    cluster_id: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
):
    _require_user(authorization)
    try:
        pid = _query_project_id(project_id)
        with _atlas_infra_scope(pid, cluster_id):
            return get_vars_file(pid, path)
    except InventoryHttpError as exc:
        return _domain_error(exc)


@app.put("/api/inventory/vars/file")
def inventory_vars_put(body: dict[str, Any], authorization: Optional[str] = Header(None)):
    _require_user(authorization)
    try:
        pid = _query_project_id(None, body)
        content = body.get("content")
        if content is None and "vars" in body:
            content = body.get("vars")
        if content is None:
            raise InventoryHttpError(400, "content is required")
        with _atlas_infra_scope(pid, body.get("cluster_id")):
            return put_vars_file(pid, str(body.get("path") or ""), content)
    except InventoryHttpError as exc:
        return _domain_error(exc)


@app.delete("/api/inventory/vars/file")
def inventory_vars_delete(
    project_id: Optional[str] = Query(None),
    path: str = Query(""),
    cluster_id: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
):
    _require_user(authorization)
    try:
        pid = _query_project_id(project_id)
        with _atlas_infra_scope(pid, cluster_id):
            return delete_vars_file(pid, path)
    except InventoryHttpError as exc:
        return _domain_error(exc)


@app.get("/api/inventory/group-vars/{group_name}")
def inventory_group_vars_get(
    group_name: str,
    project_id: Optional[str] = Query(None),
    cluster_id: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
):
    _require_user(authorization)
    try:
        pid = _query_project_id(project_id)
        with _atlas_infra_scope(pid, cluster_id):
            return get_group_vars(pid, group_name)
    except InventoryHttpError as exc:
        return _domain_error(exc)


@app.put("/api/inventory/group-vars/{group_name}")
def inventory_group_vars_put(
    group_name: str,
    body: dict[str, Any],
    project_id: Optional[str] = Query(None),
    cluster_id: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
):
    _require_user(authorization)
    try:
        pid = _query_project_id(project_id, body)
        content = body.get("content")
        if content is None and "vars" in body:
            content = body.get("vars")
        if content is None:
            raise InventoryHttpError(400, "content is required")
        with _atlas_infra_scope(pid, cluster_id, body.get("cluster_id")):
            return put_group_vars(pid, group_name, content)
    except InventoryHttpError as exc:
        return _domain_error(exc)


@app.delete("/api/inventory/groups/{group_name}")
def inventory_groups_delete(
    group_name: str,
    project_id: Optional[str] = Query(None),
    inventory_file: Optional[str] = Query(None),
    cluster_id: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
):
    _require_user(authorization)
    try:
        pid = _query_project_id(project_id)
        with _atlas_infra_scope(pid, cluster_id):
            return delete_group(pid, group_name, inventory_file=str(inventory_file or ""))
    except InventoryHttpError as exc:
        return _domain_error(exc)


@app.put("/api/inventory/groups/{group_name}/hosts")
def inventory_groups_hosts_put(
    group_name: str,
    body: dict[str, Any],
    authorization: Optional[str] = Header(None),
):
    _require_user(authorization)
    try:
        pid = _query_project_id(None, body)
        with _atlas_infra_scope(pid, body.get("cluster_id")):
            return set_group_hosts(
                pid,
                group_name,
                hosts=body.get("hosts") or [],
                inventory_file=str(body.get("inventory_file") or ""),
            )
    except InventoryHttpError as exc:
        return _domain_error(exc)


@app.post("/api/inventory/assign_host")
def inventory_assign_host(body: dict[str, Any], authorization: Optional[str] = Header(None)):
    _require_user(authorization)
    try:
        pid = _query_project_id(None, body)
        with _atlas_infra_scope(pid, body.get("cluster_id")):
            return assign_host_to_group(
                pid,
                str(body.get("host_name") or body.get("host") or ""),
                str(body.get("group_name") or "all"),
                inventory_file=str(body.get("inventory_file") or ""),
            )
    except InventoryHttpError as exc:
        return _domain_error(exc)


@app.put("/api/hosts/{host_name}/connection-secret")
def host_connection_secret(
    host_name: str,
    body: dict[str, Any],
    project_id: Optional[str] = Query(None),
    cluster_id: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
):
    _require_user(authorization)
    try:
        pid = _query_project_id(project_id, body)
        with _atlas_infra_scope(pid, cluster_id, body.get("cluster_id")):
            return set_host_connection_secret(
                pid,
                host_name,
                body.get("secretName"),
                ansible_user=str(body.get("ansibleUser") or "root"),
                port=str(body.get("port") or "22"),
                inventory_file=str(body.get("inventory_file") or ""),
            )
    except InventoryHttpError as exc:
        return _domain_error(exc)


@app.get("/api/ansible_config/list")
def ansible_config_list(
    project_id: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
):
    _require_user(authorization)
    try:
        pid = _query_project_id(project_id)
        return list_ansible_config(pid)
    except InventoryHttpError as exc:
        return _domain_error(exc)


@app.get("/api/ansible_config/get")
def ansible_config_get(
    project_id: Optional[str] = Query(None),
    file: str = Query("ansible-config/ansible.cfg"),
    authorization: Optional[str] = Header(None),
):
    _require_user(authorization)
    try:
        pid = _query_project_id(project_id)
        return get_ansible_config(pid, file)
    except InventoryHttpError as exc:
        return _domain_error(exc)


@app.post("/api/ansible_config/save")
def ansible_config_save(body: dict[str, Any], authorization: Optional[str] = Header(None)):
    _require_user(authorization)
    try:
        pid = _query_project_id(None, body)
        return save_ansible_config(
            pid,
            str(body.get("file") or body.get("path") or "ansible-config/ansible.cfg"),
            str(body.get("content") or ""),
        )
    except InventoryHttpError as exc:
        return _domain_error(exc)


@app.post("/api/ansible_config/select")
def ansible_config_select(body: dict[str, Any], authorization: Optional[str] = Header(None)):
    _require_user(authorization)
    try:
        pid = _query_project_id(None, body)
        return select_ansible_config(
            pid,
            str(body.get("file") or body.get("selected_config") or "ansible-config/ansible.cfg"),
        )
    except InventoryHttpError as exc:
        return _domain_error(exc)


@app.post("/api/ansible_config/delete")
def ansible_config_delete(body: dict[str, Any], authorization: Optional[str] = Header(None)):
    _require_user(authorization)
    try:
        pid = _query_project_id(None, body)
        return delete_ansible_config(pid, str(body.get("file") or body.get("path") or ""))
    except InventoryHttpError as exc:
        return _domain_error(exc)


@app.get("/api/projects/{project_id}/playbooks")
def playbooks_list(
    project_id: str,
    cluster_id: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
):
    _require_user(authorization)
    project = get_project(PROJECTS_CONFIG_FILE, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if resolve_atlas_inventory_leaf(project_id, cluster_id, project=project) is not None:
        return {
            "success": True,
            "playbooks": list_atlas_playbook_entries(
                project_id, cluster_id, project=project
            ),
        }
    return {"success": True, "playbooks": list_playbook_records(playbook_storage, project_id)}


@app.post("/api/projects/{project_id}/playbooks")
def playbooks_create(
    project_id: str, body: dict[str, Any], authorization: Optional[str] = Header(None)
):
    _require_user(authorization)
    project = get_project(PROJECTS_CONFIG_FILE, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if is_atlas_project(project_id, project=project):
        raise HTTPException(
            status_code=400,
            detail="Creating playbooks is not available for atlas clusters",
        )
    try:
        playbook = create_playbook_record(
            playbook_storage,
            project_id,
            str(body.get("name") or ""),
            str(body.get("description") or ""),
        )
    except PlaybookHttpError as exc:
        return _domain_error(exc)
    return JSONResponse({"success": True, "playbook": playbook}, status_code=201)


@app.get("/api/projects/{project_id}/playbooks/{playbook_id}")
def playbooks_get(
    project_id: str,
    playbook_id: str,
    cluster_id: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
):
    _require_user(authorization)
    project = get_project(PROJECTS_CONFIG_FILE, project_id)
    try:
        if resolve_atlas_inventory_leaf(project_id, cluster_id, project=project) is not None:
            return {
                "success": True,
                "playbook": read_atlas_playbook_yaml(
                    project_id, playbook_id, cluster_id, project=project
                ),
            }
        return {"success": True, "playbook": get_playbook(playbook_storage, project_id, playbook_id)}
    except (PlaybookHttpError, AtlasClusterFsError) as exc:
        return _domain_error(exc)


@app.put("/api/projects/{project_id}/playbooks/{playbook_id}")
def playbooks_put(
    project_id: str,
    playbook_id: str,
    body: dict[str, Any],
    cluster_id: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
):
    _require_user(authorization)
    project = get_project(PROJECTS_CONFIG_FILE, project_id)
    try:
        requested = _requested_cluster_id(cluster_id, (body or {}).get("cluster_id"))
        if resolve_atlas_inventory_leaf(project_id, requested, project=project) is not None:
            content = body.get("yaml")
            if content is None:
                content = body.get("content")
            if content is None:
                raise PlaybookHttpError(400, "yaml is required")
            playbook = write_atlas_playbook_yaml(
                project_id,
                playbook_id,
                str(content),
                requested,
                project=project,
            )
        else:
            playbook = update_playbook_record(playbook_storage, project_id, playbook_id, body)
    except (PlaybookHttpError, AtlasClusterFsError) as exc:
        return _domain_error(exc)
    return {"success": True, "playbook": playbook}


@app.post("/api/projects/{project_id}/playbooks/{playbook_id}/preview")
def playbooks_preview(
    project_id: str,
    playbook_id: str,
    body: dict[str, Any],
    authorization: Optional[str] = Header(None),
):
    _require_user(authorization)
    playbook = body.get("playbook")
    if not playbook:
        raise HTTPException(status_code=400, detail="Playbook data is required")
    return {"success": True, "yaml": preview_playbook(playbook)}


@app.post("/api/projects/{project_id}/playbooks/{playbook_id}/validate")
def playbooks_validate(
    project_id: str,
    playbook_id: str,
    body: dict[str, Any],
    authorization: Optional[str] = Header(None),
):
    _require_user(authorization)
    try:
        return validate_playbook_payload(
            playbook_storage, project_id, playbook_id, body or {}
        )
    except PlaybookHttpError as exc:
        return _domain_error(exc)


@app.get("/api/projects/{project_id}/playbooks/{playbook_id}/schedule")
def playbooks_schedule_get(
    project_id: str, playbook_id: str, authorization: Optional[str] = Header(None)
):
    _require_user(authorization)
    project = get_project(PROJECTS_CONFIG_FILE, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if is_atlas_project(project_id, project=project):
        raise HTTPException(
            status_code=400,
            detail="Playbook schedules are not available for atlas clusters",
        )
    try:
        return get_schedule(playbook_storage, project_id, playbook_id)
    except PlaybookHttpError as exc:
        return _domain_error(exc)


@app.put("/api/projects/{project_id}/playbooks/{playbook_id}/schedule")
def playbooks_schedule_put(
    project_id: str,
    playbook_id: str,
    body: dict[str, Any],
    authorization: Optional[str] = Header(None),
):
    _require_user(authorization)
    project = get_project(PROJECTS_CONFIG_FILE, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if is_atlas_project(project_id, project=project):
        raise HTTPException(
            status_code=400,
            detail="Playbook schedules are not available for atlas clusters",
        )
    try:
        return save_schedule(playbook_storage, project_id, playbook_id, body or {})
    except PlaybookHttpError as exc:
        return _domain_error(exc)


@app.get("/api/projects/{project_id}/playbooks/{playbook_id}/schedule/next-run")
def playbooks_schedule_next(
    project_id: str, playbook_id: str, authorization: Optional[str] = Header(None)
):
    _require_user(authorization)
    project = get_project(PROJECTS_CONFIG_FILE, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if is_atlas_project(project_id, project=project):
        raise HTTPException(
            status_code=400,
            detail="Playbook schedules are not available for atlas clusters",
        )
    try:
        return next_run_time(playbook_storage, project_id, playbook_id)
    except PlaybookHttpError as exc:
        return _domain_error(exc)


@app.post("/api/projects/{project_id}/playbooks/{playbook_id}/run")
def playbooks_run(
    project_id: str,
    playbook_id: str,
    body: dict[str, Any],
    authorization: Optional[str] = Header(None),
):
    _require_user(authorization)
    project = get_project(PROJECTS_CONFIG_FILE, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if is_atlas_project(project_id, project=project):
        raise HTTPException(
            status_code=400,
            detail="Running catalog playbooks is not available for atlas clusters",
        )
    try:
        return queue_playbook_run(playbook_storage, project_id, playbook_id, body or {})
    except PlaybookHttpError as exc:
        return _domain_error(exc)


@app.post("/api/check_host")
def check_host_route(body: dict[str, Any], authorization: Optional[str] = Header(None)):
    _require_user(authorization)
    try:
        pid = _query_project_id(None, body)
        return queue_host_check(pid, body or {})
    except (InventoryHttpError, PlaybookHttpError) as exc:
        return _domain_error(exc)


@app.post("/api/hosts/{host_name}/facts")
def host_facts_route(
    host_name: str,
    body: dict[str, Any],
    authorization: Optional[str] = Header(None),
):
    _require_user(authorization)
    try:
        pid = _query_project_id(None, body)
        payload = dict(body or {})
        payload.setdefault("host", host_name)
        return queue_host_facts(pid, payload)
    except (InventoryHttpError, PlaybookHttpError) as exc:
        return _domain_error(exc)


@app.post("/api/projects/{project_id}/atlas/run")
def atlas_run_route(
    project_id: str, body: dict[str, Any], authorization: Optional[str] = Header(None)
):
    payload = _require_user(authorization)
    project = get_project(PROJECTS_CONFIG_FILE, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    try:
        return queue_atlas_run(
            with_kind(project),
            project_id,
            body or {},
            can_execute=_user_can(payload, ["atlas.execute"]),
            can_root_ssh=_user_can(payload, ["atlas.execute_root_ssh"]),
        )
    except PlaybookHttpError as exc:
        return _domain_error(exc)


@app.post("/api/projects/{project_id}/atlas/workspace/reset")
def atlas_workspace_reset_route(
    project_id: str, body: dict[str, Any], authorization: Optional[str] = Header(None)
):
    payload = _require_user(authorization)
    project = get_project(PROJECTS_CONFIG_FILE, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    try:
        return queue_atlas_workspace_reset(
            with_kind(project),
            project_id,
            body or {},
            can_execute=_user_can(payload, ["atlas.execute"]),
        )
    except PlaybookHttpError as exc:
        return _domain_error(exc)


@app.post("/api/projects/{project_id}/atlas/init")
def atlas_init_route(
    project_id: str, body: dict[str, Any], authorization: Optional[str] = Header(None)
):
    payload = _require_user(authorization)
    project = get_project(PROJECTS_CONFIG_FILE, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    try:
        return queue_atlas_init(
            with_kind(project),
            project_id,
            body or {},
            can_execute=_user_can(payload, ["atlas.execute"]),
        )
    except PlaybookHttpError as exc:
        return _domain_error(exc)


@app.post("/api/projects/{project_id}/atlas/repos/sync")
def atlas_repos_sync_route(
    project_id: str, body: dict[str, Any], authorization: Optional[str] = Header(None)
):
    payload = _require_user(authorization)
    project = get_project(PROJECTS_CONFIG_FILE, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    try:
        return queue_atlas_repos_sync(
            with_kind(project),
            project_id,
            body or {},
            can_execute=_user_can(payload, ["atlas.execute"]),
        )
    except PlaybookHttpError as exc:
        return _domain_error(exc)


def _require_project(project_id: str) -> None:
    if not get_project(PROJECTS_CONFIG_FILE, project_id):
        raise HTTPException(status_code=404, detail="Project not found")


@app.get("/api/projects/{project_id}/vault-keys")
def vault_keys_list(project_id: str, authorization: Optional[str] = Header(None)):
    _require_user(authorization)
    _require_project(project_id)
    return list_vault_keys(project_id)


@app.post("/api/projects/{project_id}/vault-keys")
def vault_keys_create(
    project_id: str, body: dict[str, Any], authorization: Optional[str] = Header(None)
):
    _require_user(authorization)
    _require_project(project_id)
    try:
        return create_vault_key(project_id, body or {})
    except VaultHttpError as exc:
        return _domain_error(exc)


@app.get("/api/projects/{project_id}/vault-keys/{key_id}")
def vault_keys_get(project_id: str, key_id: str, authorization: Optional[str] = Header(None)):
    _require_user(authorization)
    _require_project(project_id)
    try:
        return get_vault_key(project_id, key_id)
    except VaultHttpError as exc:
        return _domain_error(exc)


@app.put("/api/projects/{project_id}/vault-keys/{key_id}")
def vault_keys_put(
    project_id: str,
    key_id: str,
    body: dict[str, Any],
    authorization: Optional[str] = Header(None),
):
    _require_user(authorization)
    _require_project(project_id)
    try:
        return update_vault_key(project_id, key_id, body or {})
    except VaultHttpError as exc:
        return _domain_error(exc)


@app.delete("/api/projects/{project_id}/vault-keys/{key_id}")
def vault_keys_delete(project_id: str, key_id: str, authorization: Optional[str] = Header(None)):
    _require_user(authorization)
    _require_project(project_id)
    try:
        return delete_vault_key(project_id, key_id)
    except VaultHttpError as exc:
        return _domain_error(exc)


@app.get("/api/projects/{project_id}/vaults")
def vaults_list(project_id: str, authorization: Optional[str] = Header(None)):
    _require_user(authorization)
    _require_project(project_id)
    return list_vaults(project_id)


@app.post("/api/projects/{project_id}/vaults")
def vaults_create(
    project_id: str, body: dict[str, Any], authorization: Optional[str] = Header(None)
):
    _require_user(authorization)
    _require_project(project_id)
    try:
        return create_vault(project_id, body or {})
    except VaultHttpError as exc:
        return _domain_error(exc)


@app.get("/api/projects/{project_id}/vaults/{vault_id}")
def vaults_get(project_id: str, vault_id: str, authorization: Optional[str] = Header(None)):
    _require_user(authorization)
    _require_project(project_id)
    try:
        return get_vault(project_id, vault_id)
    except VaultHttpError as exc:
        return _domain_error(exc)


@app.put("/api/projects/{project_id}/vaults/{vault_id}")
def vaults_put(
    project_id: str,
    vault_id: str,
    body: dict[str, Any],
    authorization: Optional[str] = Header(None),
):
    _require_user(authorization)
    _require_project(project_id)
    try:
        return update_vault(project_id, vault_id, body or {})
    except VaultHttpError as exc:
        return _domain_error(exc)


@app.delete("/api/projects/{project_id}/vaults/{vault_id}")
def vaults_delete(project_id: str, vault_id: str, authorization: Optional[str] = Header(None)):
    _require_user(authorization)
    _require_project(project_id)
    try:
        return delete_vault(project_id, vault_id)
    except VaultHttpError as exc:
        return _domain_error(exc)


@app.post("/api/projects/{project_id}/vaults/{vault_id}/encrypt")
def vaults_encrypt(
    project_id: str,
    vault_id: str,
    body: dict[str, Any],
    authorization: Optional[str] = Header(None),
):
    _require_user(authorization)
    _require_project(project_id)
    try:
        return encrypt_vault_content(project_id, vault_id, str((body or {}).get("content") or ""))
    except VaultHttpError as exc:
        return _domain_error(exc)


@app.post("/api/projects/{project_id}/vaults/{vault_id}/decrypt")
def vaults_decrypt(
    project_id: str,
    vault_id: str,
    body: dict[str, Any],
    authorization: Optional[str] = Header(None),
):
    _require_user(authorization)
    _require_project(project_id)
    try:
        return decrypt_vault_content(project_id, vault_id, str((body or {}).get("content") or ""))
    except VaultHttpError as exc:
        return _domain_error(exc)


@app.get("/api/projects/{project_id}/vault-files/get")
def vault_files_get(
    project_id: str,
    path: str = Query(""),
    vault_id: Optional[str] = Query(None),
    vaultId: Optional[str] = Query(None),
    keyId: Optional[str] = Query(None),
    key_id: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
):
    _require_user(authorization)
    _require_project(project_id)
    try:
        return get_vault_file(
            project_id,
            path,
            vault_id=vaultId or vault_id,
            key_id=keyId or key_id,
        )
    except (VaultHttpError, VaultFilesHttpError) as exc:
        return _domain_error(exc)


@app.post("/api/projects/{project_id}/vault-files/encrypt")
def vault_files_encrypt(
    project_id: str, body: dict[str, Any], authorization: Optional[str] = Header(None)
):
    _require_user(authorization)
    _require_project(project_id)
    try:
        return encrypt_vault_file(project_id, body or {})
    except (VaultHttpError, VaultFilesHttpError) as exc:
        return _domain_error(exc)


@app.post("/api/projects/{project_id}/vault-files/decrypt")
def vault_files_decrypt(
    project_id: str, body: dict[str, Any], authorization: Optional[str] = Header(None)
):
    _require_user(authorization)
    _require_project(project_id)
    try:
        return decrypt_vault_file(project_id, body or {})
    except (VaultHttpError, VaultFilesHttpError) as exc:
        return _domain_error(exc)


@app.post("/api/projects/{project_id}/vault-files/save")
def vault_files_save(
    project_id: str, body: dict[str, Any], authorization: Optional[str] = Header(None)
):
    _require_user(authorization)
    _require_project(project_id)
    try:
        return save_vault_file(project_id, body or {})
    except (VaultHttpError, VaultFilesHttpError) as exc:
        return _domain_error(exc)


@app.get("/api/secrets/meta")
def secrets_meta(
    project_id: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
):
    _require_user(authorization)
    try:
        pid = _query_project_id(project_id)
        return list_secrets_meta(pid)
    except (InventoryHttpError, SecretsHttpError) as exc:
        return _domain_error(exc)


@app.get("/api/secrets")
def secrets_list(
    project_id: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
):
    _require_user(authorization)
    try:
        pid = _query_project_id(project_id)
        return list_secrets(pid)
    except (InventoryHttpError, SecretsHttpError) as exc:
        return _domain_error(exc)


@app.post("/api/secrets")
def secrets_create(
    body: dict[str, Any],
    project_id: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
):
    _require_user(authorization)
    try:
        pid = _query_project_id(project_id, body)
        return create_secret(pid, body or {})
    except (InventoryHttpError, SecretsHttpError) as exc:
        return _domain_error(exc)


@app.get("/api/secrets/{secret_name}")
def secrets_get(
    secret_name: str,
    project_id: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
):
    _require_user(authorization)
    try:
        pid = _query_project_id(project_id)
        return get_secret(pid, secret_name)
    except (InventoryHttpError, SecretsHttpError) as exc:
        return _domain_error(exc)


@app.put("/api/secrets/{secret_name}")
def secrets_put(
    secret_name: str,
    body: dict[str, Any],
    project_id: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
):
    _require_user(authorization)
    try:
        pid = _query_project_id(project_id, body)
        return update_secret(pid, secret_name, body or {})
    except (InventoryHttpError, SecretsHttpError) as exc:
        return _domain_error(exc)


@app.delete("/api/secrets/{secret_name}")
def secrets_delete(
    secret_name: str,
    project_id: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
):
    _require_user(authorization)
    try:
        pid = _query_project_id(project_id)
        return delete_secret(pid, secret_name)
    except (InventoryHttpError, SecretsHttpError) as exc:
        return _domain_error(exc)


@app.get("/api/projects/{project_id}/sources/status")
def sources_status(project_id: str, authorization: Optional[str] = Header(None)):
    _require_user(authorization)
    _require_project(project_id)
    return get_sources_status(project_id)


@app.post("/api/projects/{project_id}/sources/test")
def sources_test(
    project_id: str, body: dict[str, Any], authorization: Optional[str] = Header(None)
):
    _require_user(authorization)
    _require_project(project_id)
    try:
        return test_source(project_id, body or {})
    except SourcesHttpError as exc:
        return _domain_error(exc)


@app.post("/api/projects/{project_id}/sources/sync")
def sources_sync(
    project_id: str,
    body: Optional[dict[str, Any]] = None,
    authorization: Optional[str] = Header(None),
):
    _require_user(authorization)
    _require_project(project_id)
    try:
        return sync_source(project_id, body or {})
    except SourcesHttpError as exc:
        return _domain_error(exc)


@app.get("/api/projects/{project_id}/sources")
def sources_get(project_id: str, authorization: Optional[str] = Header(None)):
    _require_user(authorization)
    _require_project(project_id)
    return get_sources(project_id)


@app.put("/api/projects/{project_id}/sources")
def sources_put(
    project_id: str, body: dict[str, Any], authorization: Optional[str] = Header(None)
):
    _require_user(authorization)
    _require_project(project_id)
    try:
        return update_sources(project_id, body or {})
    except SourcesHttpError as exc:
        return _domain_error(exc)


@app.get("/api/projects/{project_id}/autosync")
def autosync_get(project_id: str, authorization: Optional[str] = Header(None)):
    _require_user(authorization)
    _require_project(project_id)
    try:
        return get_autosync(project_id)
    except AutosyncHttpError as exc:
        return _domain_error(exc)


@app.put("/api/projects/{project_id}/autosync")
def autosync_put(
    project_id: str, body: dict[str, Any], authorization: Optional[str] = Header(None)
):
    _require_user(authorization)
    _require_project(project_id)
    try:
        return update_autosync(project_id, body or {})
    except AutosyncHttpError as exc:
        return _domain_error(exc)


@app.get("/api/roles/storage")
def roles_storage_get(
    project_id: Optional[str] = Query(None),
    cluster_id: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
):
    _require_user(authorization)
    try:
        pid = _query_project_id(project_id)
        with _atlas_infra_scope(pid, cluster_id):
            return get_roles_storage(pid)
    except (InventoryHttpError, RolesFilesHttpError) as exc:
        return _domain_error(exc)


@app.get("/api/roles/handbook")
def roles_handbook_get(
    project_id: Optional[str] = Query(None),
    cluster_id: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
):
    _require_user(authorization)
    try:
        pid = _query_project_id(project_id)
        with _atlas_infra_scope(pid, cluster_id):
            return list_role_handbook(pid)
    except (InventoryHttpError, RolesFilesHttpError) as exc:
        return _domain_error(exc)


@app.get("/api/roles/handbook/file")
def roles_handbook_file_get(
    pack: str = Query(...),
    doc: str = Query(...),
    project_id: Optional[str] = Query(None),
    cluster_id: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
):
    _require_user(authorization)
    try:
        pid = _query_project_id(project_id)
        with _atlas_infra_scope(pid, cluster_id):
            return get_role_handbook_file(pid, pack, doc)
    except (InventoryHttpError, RolesFilesHttpError) as exc:
        return _domain_error(exc)


@app.get("/api/roles/files/{role_path:path}")
def roles_files_get(
    role_path: str,
    project_id: Optional[str] = Query(None),
    cluster_id: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
):
    _require_user(authorization)
    try:
        pid = _query_project_id(project_id)
        with _atlas_infra_scope(pid, cluster_id):
            return list_role_files(pid, role_path)
    except (InventoryHttpError, RolesFilesHttpError) as exc:
        return _domain_error(exc)


@app.get("/api/roles/file/{pack_id}/{role_name}/{file_path:path}")
def roles_file_get(
    pack_id: str,
    role_name: str,
    file_path: str,
    project_id: Optional[str] = Query(None),
    cluster_id: Optional[str] = Query(None),
    vault_id: Optional[str] = Query(None),
    vaultId: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
):
    _require_user(authorization)
    try:
        pid = _query_project_id(project_id)
        with _atlas_infra_scope(pid, cluster_id):
            return get_role_file(
                pid, pack_id, role_name, file_path, vault_id=vaultId or vault_id
            )
    except (InventoryHttpError, RolesFilesHttpError, VaultHttpError) as exc:
        return _domain_error(exc)


@app.put("/api/roles/file/{pack_id}/{role_name}/{file_path:path}")
def roles_file_put(
    pack_id: str,
    role_name: str,
    file_path: str,
    body: dict[str, Any],
    project_id: Optional[str] = Query(None),
    cluster_id: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
):
    _require_user(authorization)
    try:
        pid = _query_project_id(project_id)
        with _atlas_infra_scope(pid, cluster_id, (body or {}).get("cluster_id")):
            return put_role_file(pid, pack_id, role_name, file_path, body or {})
    except (InventoryHttpError, RolesFilesHttpError, VaultHttpError) as exc:
        return _domain_error(exc)


@app.get("/api/roles")
def rbac_roles_get(authorization: Optional[str] = Header(None)):
    _require_user(authorization)
    if not role_service:
        raise HTTPException(status_code=503, detail="Role service unavailable")
    try:
        return list_roles(role_service, permission_service)
    except RolesHttpError as exc:
        return _domain_error(exc)


@app.post("/api/roles")
def rbac_roles_post(body: dict[str, Any], authorization: Optional[str] = Header(None)):
    _require_user(authorization)
    if not role_service:
        raise HTTPException(status_code=503, detail="Role service unavailable")
    try:
        return JSONResponse(
            create_role_record(role_service, permission_service, body or {}),
            status_code=201,
        )
    except RolesHttpError as exc:
        return _domain_error(exc)


@app.get("/api/roles/{role_id}")
def rbac_roles_get_one(role_id: str, authorization: Optional[str] = Header(None)):
    _require_user(authorization)
    if not role_service:
        raise HTTPException(status_code=503, detail="Role service unavailable")
    try:
        return get_role_record(role_service, permission_service, role_id)
    except RolesHttpError as exc:
        return _domain_error(exc)


@app.put("/api/roles/{role_id}")
def rbac_roles_put(
    role_id: str, body: dict[str, Any], authorization: Optional[str] = Header(None)
):
    _require_user(authorization)
    if not role_service:
        raise HTTPException(status_code=503, detail="Role service unavailable")
    try:
        return update_role_record(role_service, permission_service, role_id, body or {})
    except RolesHttpError as exc:
        return _domain_error(exc)


@app.delete("/api/roles/{role_id}")
def rbac_roles_delete(role_id: str, authorization: Optional[str] = Header(None)):
    _require_user(authorization)
    if not role_service:
        raise HTTPException(status_code=503, detail="Role service unavailable")
    try:
        return delete_role_record(role_service, role_id)
    except RolesHttpError as exc:
        return _domain_error(exc)


@app.get("/api/users")
def users_get(authorization: Optional[str] = Header(None)):
    _require_user(authorization)
    if not user_service or not role_service:
        raise HTTPException(status_code=503, detail="User service unavailable")
    try:
        return list_users(user_service, role_service)
    except UsersHttpError as exc:
        return _domain_error(exc)


@app.post("/api/users")
def users_post(body: dict[str, Any], authorization: Optional[str] = Header(None)):
    _require_user(authorization)
    if not user_service or not role_service:
        raise HTTPException(status_code=503, detail="User service unavailable")
    try:
        return JSONResponse(
            create_user_record(user_service, role_service, body or {}),
            status_code=201,
        )
    except UsersHttpError as exc:
        return _domain_error(exc)


@app.get("/api/users/{user_id}")
def users_get_one(user_id: str, authorization: Optional[str] = Header(None)):
    _require_user(authorization)
    if not user_service or not role_service:
        raise HTTPException(status_code=503, detail="User service unavailable")
    try:
        return get_user_record(user_service, role_service, user_id)
    except UsersHttpError as exc:
        return _domain_error(exc)


@app.put("/api/users/{user_id}")
def users_put(
    user_id: str, body: dict[str, Any], authorization: Optional[str] = Header(None)
):
    payload = _require_user(authorization)
    if not user_service or not role_service:
        raise HTTPException(status_code=503, detail="User service unavailable")
    try:
        return update_user_record(
            user_service,
            role_service,
            user_id,
            body or {},
            payload.get("user_id"),
        )
    except UsersHttpError as exc:
        return _domain_error(exc)


@app.delete("/api/users/{user_id}")
def users_delete(user_id: str, authorization: Optional[str] = Header(None)):
    payload = _require_user(authorization)
    if not user_service:
        raise HTTPException(status_code=503, detail="User service unavailable")
    try:
        return delete_user_record(user_service, user_id, payload.get("user_id"))
    except UsersHttpError as exc:
        return _domain_error(exc)


@app.get("/api/permissions/by-resource/{resource}")
def permissions_by_resource(resource: str, authorization: Optional[str] = Header(None)):
    _require_user(authorization)
    if not permission_service:
        raise HTTPException(status_code=503, detail="Permission service unavailable")
    try:
        return list_permissions_by_resource(permission_service, resource)
    except PermissionsHttpError as exc:
        return _domain_error(exc)


@app.get("/api/permissions")
def permissions_get(authorization: Optional[str] = Header(None)):
    _require_user(authorization)
    if not permission_service:
        raise HTTPException(status_code=503, detail="Permission service unavailable")
    try:
        return list_permissions(permission_service)
    except PermissionsHttpError as exc:
        return _domain_error(exc)


@app.post("/api/permissions")
def permissions_post(body: dict[str, Any], authorization: Optional[str] = Header(None)):
    _require_user(authorization)
    if not permission_service:
        raise HTTPException(status_code=503, detail="Permission service unavailable")
    try:
        return JSONResponse(
            create_permission_record(permission_service, body or {}),
            status_code=201,
        )
    except PermissionsHttpError as exc:
        return _domain_error(exc)


@app.get("/api/permissions/{perm_id}")
def permissions_get_one(perm_id: str, authorization: Optional[str] = Header(None)):
    _require_user(authorization)
    if not permission_service:
        raise HTTPException(status_code=503, detail="Permission service unavailable")
    try:
        return get_permission_record(permission_service, perm_id)
    except PermissionsHttpError as exc:
        return _domain_error(exc)


@app.put("/api/permissions/{perm_id}")
def permissions_put(
    perm_id: str, body: dict[str, Any], authorization: Optional[str] = Header(None)
):
    _require_user(authorization)
    if not permission_service:
        raise HTTPException(status_code=503, detail="Permission service unavailable")
    try:
        return update_permission_record(permission_service, perm_id, body or {})
    except PermissionsHttpError as exc:
        return _domain_error(exc)


@app.delete("/api/permissions/{perm_id}")
def permissions_delete(perm_id: str, authorization: Optional[str] = Header(None)):
    _require_user(authorization)
    if not permission_service:
        raise HTTPException(status_code=503, detail="Permission service unavailable")
    try:
        return delete_permission_record(permission_service, perm_id)
    except PermissionsHttpError as exc:
        return _domain_error(exc)


@app.get("/api/server_logs")
def server_logs_get(
    lines: int = Query(1000),
    service: str = Query("all"),
    level: str = Query("all"),
    search: str = Query(""),
    date_from: str = Query(""),
    date_to: str = Query(""),
    authorization: Optional[str] = Header(None),
):
    _require_user(authorization)
    return list_server_logs(
        DATA_DIR,
        lines=lines,
        service=service,
        level=level,
        search=search,
        date_from=date_from,
        date_to=date_to,
    )


@app.get("/api/atlas/clusterctl")
def atlas_clusterctl_get(
    authorization: Optional[str] = Header(None),
    url: Optional[str] = Query(None),
    dest: Optional[str] = Query(None),
):
    _require_user(authorization)
    return inspect_checkout(url=url, dest=dest)


@app.post("/api/atlas/clusterctl/clone")
def atlas_clusterctl_clone(
    body: dict[str, Any] = Body(default_factory=dict),
    authorization: Optional[str] = Header(None),
):
    _require_user(authorization)
    try:
        return clone_clusterctl(url=body.get("url"), dest=body.get("dest"))
    except ClusterctlGitError as exc:
        return JSONResponse(
            {"success": False, "error": exc.message},
            status_code=exc.status_code,
        )


@app.post("/api/atlas/clusterctl/pull")
def atlas_clusterctl_pull(
    body: dict[str, Any] = Body(default_factory=dict),
    authorization: Optional[str] = Header(None),
):
    _require_user(authorization)
    try:
        return pull_clusterctl(url=body.get("url"), dest=body.get("dest"))
    except ClusterctlGitError as exc:
        return JSONResponse(
            {"success": False, "error": exc.message},
            status_code=exc.status_code,
        )


@app.get("/api/execution_settings")
def execution_settings_get(authorization: Optional[str] = Header(None)):
    _require_user(authorization)
    return {
        "success": True,
        "settings": load_execution_settings(DATA_DIR),
        "stats": get_execution_stats(),
    }


@app.post("/api/execution_settings")
def execution_settings_post(
    body: dict[str, Any],
    authorization: Optional[str] = Header(None),
):
    _require_user(authorization)
    try:
        return update_execution_settings(DATA_DIR, body or {})
    except ExecutionSettingsHttpError as exc:
        return _domain_error(exc)


@app.get("/api/backup-settings")
def backup_settings_get(authorization: Optional[str] = Header(None)):
    _require_user(authorization)
    return get_backup_settings(DATA_DIR)


@app.put("/api/backup-settings")
def backup_settings_put(
    body: dict[str, Any],
    authorization: Optional[str] = Header(None),
):
    _require_user(authorization)
    try:
        return update_backup_settings(DATA_DIR, body or {})
    except BackupHttpError as exc:
        return _domain_error(exc)


@app.post("/api/backups/create")
def backups_create(
    body: dict[str, Any],
    authorization: Optional[str] = Header(None),
):
    _require_user(authorization)
    try:
        project_id = str((body or {}).get("project_id") or "").strip()
        reason = str((body or {}).get("reason") or "manual")
        return create_project_archive(DATA_DIR, project_id, reason=reason)
    except BackupHttpError as exc:
        return _domain_error(exc)


@app.get("/api/backups/archives/list")
def backups_archives_list(
    project_id: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
):
    _require_user(authorization)
    try:
        return list_project_archives(DATA_DIR, str(project_id or ""))
    except BackupHttpError as exc:
        return _domain_error(exc)


@app.get("/api/backups/archives/download")
def backups_archives_download(
    project_id: Optional[str] = Query(None),
    path: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
):
    _require_user(authorization)
    try:
        archive = download_archive_path(DATA_DIR, str(project_id or ""), path)
    except BackupHttpError as exc:
        return _domain_error(exc)
    return FileResponse(
        path=archive,
        filename=archive.name,
        media_type="application/gzip",
    )


@app.post("/api/backups/archives/restore")
def backups_archives_restore(
    body: dict[str, Any],
    authorization: Optional[str] = Header(None),
):
    _require_user(authorization)
    try:
        payload = body or {}
        project_id = str(payload.get("project_id") or "").strip()
        path = payload.get("path") or payload.get("archive")
        return restore_project_archive(DATA_DIR, project_id, path)
    except BackupHttpError as exc:
        return _domain_error(exc)


@app.get("/api/global/secrets")
def global_secrets_list(
    secret_type: Optional[str] = Query(None, alias="type"),
    search: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
):
    _require_user(authorization)
    try:
        return list_global_secrets(DATA_DIR, secret_type=secret_type, search=search)
    except GlobalSecretsHttpError as exc:
        return _domain_error(exc)


@app.post("/api/global/secrets")
def global_secrets_create(
    body: dict[str, Any],
    authorization: Optional[str] = Header(None),
):
    _require_user(authorization)
    try:
        payload, status = create_global_secret(DATA_DIR, body or {})
        return JSONResponse(payload, status_code=status)
    except GlobalSecretsHttpError as exc:
        return _domain_error(exc)


@app.get("/api/global/secrets/options")
def global_secrets_options(
    purpose: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
):
    _require_user(authorization)
    try:
        return global_secret_options(DATA_DIR, purpose=purpose)
    except GlobalSecretsHttpError as exc:
        return _domain_error(exc)


@app.get("/api/global/secrets/permissions")
def global_secrets_perms(authorization: Optional[str] = Header(None)):
    _require_user(authorization)
    return global_secrets_permissions()


@app.get("/api/global/secrets/encryption-key")
def global_secrets_key_get(authorization: Optional[str] = Header(None)):
    _require_user(authorization)
    return encryption_key_status(DATA_DIR)


@app.post("/api/global/secrets/encryption-key")
def global_secrets_key_post(
    body: dict[str, Any],
    authorization: Optional[str] = Header(None),
):
    _require_user(authorization)
    try:
        return replace_encryption_key(DATA_DIR, str((body or {}).get("key") or ""))
    except GlobalSecretsHttpError as exc:
        return _domain_error(exc)


@app.post("/api/global/secrets/encryption-key/create")
def global_secrets_key_create(authorization: Optional[str] = Header(None)):
    _require_user(authorization)
    try:
        return create_encryption_key(DATA_DIR)
    except GlobalSecretsHttpError as exc:
        return _domain_error(exc)


@app.get("/api/global/secrets/encryption-key/download")
def global_secrets_key_download(authorization: Optional[str] = Header(None)):
    _require_user(authorization)
    return JSONResponse(
        {
            "success": False,
            "error": "Endpoint disabled for security",
            "errorCode": "DISABLED",
        },
        status_code=404,
    )


@app.get("/api/global/secrets/{secret_id}")
def global_secrets_get(
    secret_id: str,
    authorization: Optional[str] = Header(None),
):
    _require_user(authorization)
    try:
        return get_global_secret(DATA_DIR, secret_id)
    except GlobalSecretsHttpError as exc:
        return _domain_error(exc)


@app.put("/api/global/secrets/{secret_id}")
def global_secrets_put(
    secret_id: str,
    body: dict[str, Any],
    authorization: Optional[str] = Header(None),
):
    _require_user(authorization)
    try:
        return update_global_secret(DATA_DIR, secret_id, body or {})
    except GlobalSecretsHttpError as exc:
        return _domain_error(exc)


@app.delete("/api/global/secrets/{secret_id}")
def global_secrets_delete(
    secret_id: str,
    authorization: Optional[str] = Header(None),
):
    _require_user(authorization)
    try:
        return delete_global_secret(DATA_DIR, secret_id)
    except GlobalSecretsHttpError as exc:
        return _domain_error(exc)


def main() -> None:
    from lab_secrets import resolve_encryption_key, resolve_jwt_secret

    try:
        resolve_jwt_secret(DATA_DIR)
        resolve_encryption_key(DATA_DIR)
    except RuntimeError as exc:
        raise SystemExit(str(exc)) from exc

    from autosync_scheduler import AutosyncScheduler
    from executions_store import get_project_dir
    from sources_http import load_project_config, save_project_config, sync_service

    scheduler = AutosyncScheduler(
        source_sync_service=sync_service(),
        load_project_config_func=load_project_config,
        get_project_dir_func=get_project_dir,
    )
    scheduler._save_project_config = save_project_config
    scheduler.start()
    configure_hub_file_logging(DATA_DIR)
    import uvicorn

    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")


if __name__ == "__main__":
    main()
