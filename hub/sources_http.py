"""Project sources (git/local) for FastAPI — same DATA_DIR layout as Flask."""
from __future__ import annotations

import json
import logging
import os
import time
from pathlib import Path
from typing import Any, Optional

from executions_store import PROJECTS_DIR, get_project_dir
from git_source_manager import GitSourceError, GitSourceManager
from inventory_http import ensure_all_inventory_dirs
from source_sync_service import SourceSyncService

logger = logging.getLogger(__name__)

_STANDARD_PATHS = {
    "repo": "repo",
    "roles_playbooks": "roles-playbooks",
    "inventory": "inventory",
    "ansible_config": "ansible.cfg",
    "group_vars_storage": "group_vars",
    "host_vars_storage": "host_vars",
    "secrets_storage": "secrets-storage",
}
_STATUS_KEYS = (
    "inventory",
    "roles_playbooks",
    "ansible_config",
    "group_vars_storage",
    "host_vars_storage",
    "secrets_storage",
)
_REQUIRED_STATUS = {
    "inventory",
    "group_vars_storage",
    "host_vars_storage",
    "roles_playbooks",
    "secrets_storage",
}
_IDLE_SYNC = {
    "lastPushAt": None,
    "lastPullAt": None,
    "lastPushStatus": "idle",
    "lastPullStatus": "idle",
    "lastPushError": None,
    "lastPullError": None,
    "lastPushRevision": None,
    "lastPullRevision": None,
}
_DEFAULT_LAYOUT = {"playbooks": "playbooks", "roles": "roles", "inventories": "inventories"}

_git_manager: Optional[GitSourceManager] = None
_sync_service: Optional[SourceSyncService] = None


class SourcesHttpError(Exception):
    def __init__(self, status_code: int, message: str, error_code: Optional[str] = None):
        super().__init__(message)
        self.status_code = status_code
        self.message = message
        self.error_code = error_code


def _data_dir() -> Path:
    env = os.environ.get("DATA_DIR")
    if env and str(env).strip():
        return Path(env).expanduser().resolve()
    return PROJECTS_DIR.parent


def git_manager() -> GitSourceManager:
    global _git_manager
    if _git_manager is None:
        data = _data_dir()
        _git_manager = GitSourceManager(data / "cache" / "git", PROJECTS_DIR, data)
    return _git_manager


def sync_service() -> SourceSyncService:
    global _sync_service
    if _sync_service is None:
        _sync_service = SourceSyncService(PROJECTS_DIR, git_manager())
    return _sync_service


def project_config_file(project_id: str) -> Path:
    return get_project_dir(project_id) / "project.json"


def load_project_config(project_id: str) -> dict[str, Any]:
    path = project_config_file(project_id)
    if not path.exists():
        return {}
    try:
        with open(path, encoding="utf-8") as fh:
            data = json.load(fh)
        return data if isinstance(data, dict) else {}
    except (json.JSONDecodeError, OSError) as exc:
        logger.error("Invalid project config %s: %s", project_id, exc)
        return {}


def save_project_config(project_id: str, config: dict[str, Any]) -> None:
    path = project_config_file(project_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(config, fh, indent=2, ensure_ascii=False)


def get_default_sources(project_id: str) -> dict[str, Any]:
    return {"repo": {"mode": "local", "localPath": "repo"}}


def normalize_sources(sources: dict[str, Any], project_id: str) -> dict[str, Any]:
    defaults = get_default_sources(project_id)
    normalized: dict[str, Any] = {}
    for resource_type in ("repo",):
        if resource_type in sources:
            source = dict(sources[resource_type])
            if "mode" not in source:
                source["mode"] = defaults[resource_type]["mode"]
            if source["mode"] == "local" and "localPath" not in source:
                source["localPath"] = defaults[resource_type].get("localPath") or _STANDARD_PATHS.get(
                    resource_type, resource_type
                )
            if source["mode"] == "git":
                git_config = dict(source.get("git") or {})
                git_config.setdefault("ref", "main")
                git_config.setdefault("subdir", "")
                git_config.setdefault("authSecretId", None)
                source["git"] = git_config
            source.setdefault("syncDirection", "pull")
            source.setdefault(
                "syncStatus",
                {
                    "push": {"status": "idle", "lastSyncAt": None, "error": None},
                    "pull": {"status": "idle", "lastSyncAt": None, "error": None},
                },
            )
            normalized[resource_type] = source
        else:
            source = dict(defaults[resource_type])
            if source.get("mode") == "local" and not source.get("localPath"):
                source["localPath"] = _STANDARD_PATHS.get(resource_type, resource_type)
            source["syncDirection"] = "pull"
            source["syncStatus"] = {
                "push": {"status": "idle", "lastSyncAt": None, "error": None},
                "pull": {"status": "idle", "lastSyncAt": None, "error": None},
            }
            normalized[resource_type] = source
    return normalized


def validate_repo_layout_path(path: str) -> tuple[bool, Optional[str]]:
    if not path:
        return False, "Path cannot be empty"
    if Path(path).is_absolute():
        return False, "Path must be relative, not absolute"
    if ".." in path:
        return False, "Path cannot contain .. (path traversal)"
    if path.startswith("/") or path.endswith("/"):
        return False, "Path cannot start or end with /"
    if len(path) >= 2 and path[1] == ":":
        return False, "Path must be relative, not absolute (Windows path detected)"
    return True, None


def validate_repo_layout(repo_layout: Any) -> tuple[bool, Optional[str], Optional[str]]:
    if repo_layout is None:
        return True, None, None
    if not isinstance(repo_layout, dict):
        return False, "INVALID_REPO_LAYOUT_FORMAT", "repoLayout must be a dictionary"
    valid_keys = ("playbooks", "roles", "inventories", "vars")
    for key, value in repo_layout.items():
        if key not in valid_keys:
            return False, "INVALID_REPO_LAYOUT_KEY", f"Invalid repoLayout key: {key}. Must be one of {list(valid_keys)}"
        if not isinstance(value, str):
            return False, "INVALID_REPO_LAYOUT_VALUE", f"repoLayout.{key} must be a string"
        ok, err = validate_repo_layout_path(value)
        if not ok:
            return False, "INVALID_REPO_LAYOUT_PATH", f"repoLayout.{key}: {err}"
    return True, None, None


def validate_sources(sources: Any) -> tuple[bool, Optional[str], Optional[str]]:
    if not isinstance(sources, dict):
        return False, "INVALID_FORMAT", "Sources must be a dictionary"
    valid_modes = ("local", "git")
    valid_resource_types = ("repo",)
    for resource_type, source_config in sources.items():
        if resource_type not in valid_resource_types:
            return False, "INVALID_RESOURCE_TYPE", f"Invalid resource type: {resource_type}"
        if not isinstance(source_config, dict):
            return False, "INVALID_SOURCE_CONFIG", f"Source config for {resource_type} must be a dictionary"
        mode = source_config.get("mode")
        if mode not in valid_modes:
            return False, "UNSUPPORTED_MODE", f'Unsupported mode for {resource_type}: {mode}. Must be "local" or "git"'
        if mode == "local":
            local_path = source_config.get("localPath")
            if not local_path:
                return False, "MISSING_LOCAL_PATH", f"localPath is required for {resource_type} in local mode"
            if not isinstance(local_path, str):
                return False, "INVALID_LOCAL_PATH", f"localPath for {resource_type} must be a string"
            if ".." in local_path:
                return False, "INVALID_LOCAL_PATH", f"localPath for {resource_type} contains path traversal (..)"
        elif mode == "git":
            git_config = source_config.get("git")
            if not isinstance(git_config, dict):
                return False, "MISSING_GIT_CONFIG", f"git configuration is required for {resource_type} in git mode"
            repo = git_config.get("repo")
            if not repo:
                return False, "MISSING_GIT_REPO", f"git.repo is required for {resource_type} in git mode"
            if not isinstance(repo, str):
                return False, "INVALID_GIT_REPO", f"git.repo for {resource_type} must be a string"
            if not (
                repo.startswith("http://")
                or repo.startswith("https://")
                or repo.startswith("git@")
                or repo.startswith("git://")
            ):
                return False, "INVALID_GIT_REPO", f"git.repo for {resource_type} must be a valid Git URL"
            ref = git_config.get("ref")
            if ref and not isinstance(ref, str):
                return False, "INVALID_GIT_REF", f"git.ref for {resource_type} must be a string"
            subdir = git_config.get("subdir", "")
            if subdir:
                if not isinstance(subdir, str):
                    return False, "INVALID_GIT_SUBDIR", f"git.subdir for {resource_type} must be a string"
                if ".." in subdir or subdir.startswith("/"):
                    return (
                        False,
                        "INVALID_GIT_SUBDIR",
                        f"git.subdir for {resource_type} contains invalid characters (path traversal detected)",
                    )
            auth_secret_id = git_config.get("authSecretId")
            if auth_secret_id is not None and not isinstance(auth_secret_id, str):
                return False, "INVALID_AUTH_SECRET_ID", f"git.authSecretId for {resource_type} must be a string or null"
    return True, None, None


def get_project_storage_path(project_id: str, source_key: str) -> Path:
    project_dir = get_project_dir(project_id)
    repo_dir = project_dir / "repo"
    mapping = {
        "repo": repo_dir,
        "inventory": repo_dir / "inventories",
        "roles_playbooks": repo_dir,
        "ansible_config": project_dir / "ansible-config" / "ansible.cfg",
        "group_vars_storage": repo_dir / "group_vars",
        "host_vars_storage": repo_dir / "host_vars",
        "secrets_storage": project_dir / "secrets-storage",
    }
    if source_key not in mapping:
        raise ValueError(f"Unknown source_key: {source_key}")
    return mapping[source_key]


def resolve_project_source(project_id: str, source_key: str) -> dict[str, Any]:
    root_path = get_project_storage_path(project_id, source_key)
    if source_key != "ansible_config":
        root_path.mkdir(parents=True, exist_ok=True)
    else:
        root_path.parent.mkdir(parents=True, exist_ok=True)
    mode = "local"
    meta: dict[str, Any] = {}
    try:
        config = load_project_config(project_id)
        normalized = normalize_sources(config.get("sources") or {}, project_id)
        if source_key in normalized:
            source_config = normalized[source_key]
            mode = source_config.get("mode", "local")
            if mode == "local":
                local_path = source_config.get("localPath")
                if local_path:
                    meta = {"localPath": local_path, "projectDir": str(get_project_dir(project_id))}
            elif mode == "git":
                git_config = source_config.get("git") or {}
                repo_url = git_config.get("repo")
                if repo_url:
                    meta = {
                        "repoUrl": repo_url,
                        "ref": git_config.get("ref", "main"),
                        "subdir": git_config.get("subdir", ""),
                        "authSecretId": git_config.get("authSecretId"),
                    }
    except OSError as exc:
        logger.warning("Could not load source config for %s: %s", source_key, exc)
    return {"mode": mode, "rootPath": root_path.resolve(), "meta": meta}


def _idle_sync_status() -> dict[str, Any]:
    return {
        "push": {"status": "idle", "lastSyncAt": None, "error": None},
        "pull": {"status": "idle", "lastSyncAt": None, "error": None},
    }


def get_sources(project_id: str) -> dict[str, Any]:
    config = load_project_config(project_id)
    sources = config.get("sources") or {}
    sync_timestamps = config.get("syncTimestamps") or {}
    repo_layout = config.get("repoLayout")
    normalized = normalize_sources(sources, project_id)
    sync_status = config.get("syncStatus") or {}
    sources_with_sync: dict[str, Any] = {}
    for key, source in normalized.items():
        source_copy = dict(source)
        if key in sync_timestamps:
            source_copy["lastSyncedAt"] = sync_timestamps[key]
        source_copy["syncStatus"] = sync_status.get(key) or _idle_sync_status()
        source_copy["syncDirection"] = source.get("syncDirection", "none")
        try:
            source_copy["syncState"] = sync_service().get_sync_state(project_id, key)
        except Exception as exc:
            logger.warning("Error getting sync state for %s: %s", key, exc)
            source_copy["syncState"] = dict(_IDLE_SYNC)
        sources_with_sync[key] = source_copy
    return {
        "success": True,
        "sources": sources_with_sync,
        "repoLayout": repo_layout,
        "hasCustomSources": bool(sources),
        "syncTimestamps": sync_timestamps,
        "syncStatus": sync_status,
    }


def update_sources(project_id: str, body: dict[str, Any]) -> dict[str, Any]:
    sources = normalize_sources(body.get("sources") or {}, project_id)
    repo_layout = body.get("repoLayout")
    ok, code, message = validate_sources(sources)
    if not ok:
        raise SourcesHttpError(400, message or "Invalid sources", code)
    if repo_layout is not None:
        ok, code, message = validate_repo_layout(repo_layout)
        if not ok:
            raise SourcesHttpError(400, message or "Invalid repoLayout", code)
    for source_key, source_config in sources.items():
        mode = source_config.get("mode", "local")
        if mode == "local":
            local_path = source_config.get("localPath", "")
            if local_path and ".." in local_path:
                raise SourcesHttpError(400, f"Path traversal detected in {source_key}", "PATH_TRAVERSAL")
        elif mode == "git":
            git_config = source_config.get("git") or {}
            repo_url = git_config.get("repo", "")
            if repo_url and (".." in repo_url or str(repo_url).startswith("file://")):
                raise SourcesHttpError(400, f"Unsafe repository URL in {source_key}", "UNSAFE_REPO_URL")
            subdir = git_config.get("subdir", "")
            if subdir and ".." in subdir:
                raise SourcesHttpError(400, f"Path traversal in subdir for {source_key}", "SUBDIR_TRAVERSAL")
    config = load_project_config(project_id)
    config["sources"] = sources
    if repo_layout is not None:
        is_default = all(
            repo_layout.get(key, default) == default for key, default in _DEFAULT_LAYOUT.items()
        )
        if is_default:
            config.pop("repoLayout", None)
        else:
            config["repoLayout"] = repo_layout
    save_project_config(project_id, config)
    for source_key, source_config in sources.items():
        if source_config.get("mode", "local") != "local":
            continue
        local_path = source_config.get("localPath", "")
        if not local_path:
            continue
        external_path = Path(local_path)
        if not (external_path.is_absolute() and external_path.exists()):
            continue
        storage_path = get_project_storage_path(project_id, source_key)
        if storage_path.exists() and (not storage_path.is_dir() or any(storage_path.iterdir())):
            continue
        try:
            success, error_code, error_msg = sync_service().execute_sync(
                project_id=project_id,
                source_key=source_key,
                source_config=source_config,
                direction="pull",
            )
            if not success:
                logger.warning("Auto-sync failed for %s: %s %s", source_key, error_code, error_msg)
        except Exception as exc:
            logger.warning("Auto-sync error for %s: %s", source_key, exc)
    return {"success": True, "sources": normalize_sources(sources, project_id)}


def get_sources_status(project_id: str) -> dict[str, Any]:
    config = load_project_config(project_id)
    sources = config.get("sources") or {}
    normalized = normalize_sources(sources, project_id)
    status: dict[str, Any] = {"overall": "ok", "sources": {}}
    has_errors = False
    has_warnings = False
    for source_key in _STATUS_KEYS:
        source_config = normalized.get(source_key) or {}
        mode = source_config.get("mode", "local")
        source_status: dict[str, Any] = {
            "configured": source_key in sources,
            "mode": mode,
            "status": "ok",
            "message": "",
            "resolved": False,
            "path": None,
        }
        try:
            resolved = resolve_project_source(project_id, source_key)
            root_path = resolved["rootPath"]
            source_status["resolved"] = True
            source_status["path"] = str(root_path)
            if not root_path.exists():
                source_status["status"] = "error" if source_key in _REQUIRED_STATUS else "warning"
                source_status["message"] = f"Path does not exist: {root_path}"
                if source_key in _REQUIRED_STATUS:
                    has_errors = True
                else:
                    has_warnings = True
            elif not os.access(root_path, os.R_OK):
                source_status["status"] = "error"
                source_status["message"] = f"Path is not readable: {root_path}"
                has_errors = True
            elif source_key == "inventory":
                inv_files: list[Path] = []
                if root_path.is_file() and root_path.suffix in (".yml", ".yaml"):
                    inv_files = [root_path]
                elif root_path.is_dir():
                    inv_files = list(root_path.glob("*.yml")) + list(root_path.glob("*.yaml"))
                if not inv_files:
                    source_status["status"] = "warning"
                    source_status["message"] = "No inventory files found"
                    has_warnings = True
            elif source_key == "roles_playbooks" and root_path.is_dir():
                has_roles = (root_path / "roles").exists() or any(
                    (item / "tasks" / "main.yml").exists() or (item / "tasks" / "main.yaml").exists()
                    for item in root_path.iterdir()
                    if item.is_dir()
                )
                has_playbooks = (root_path / "playbooks").exists()
                if not has_roles and not has_playbooks:
                    source_status["status"] = "warning"
                    source_status["message"] = "Expected structure (roles/playbooks) not found"
                    has_warnings = True
            elif source_key == "ansible_config":
                if root_path.is_file():
                    pass
                elif root_path.parent.is_dir():
                    source_status["status"] = "warning"
                    source_status["message"] = "ansible.cfg file not found"
                    has_warnings = True
                else:
                    source_status["status"] = "warning"
                    source_status["message"] = "ansible-config directory not found"
                    has_warnings = True
            elif source_key in ("group_vars_storage", "host_vars_storage", "secrets_storage") and root_path.is_dir():
                files = (
                    list(root_path.glob("*.yml"))
                    + list(root_path.glob("*.yaml"))
                    + list(root_path.glob("*.json"))
                )
                if not files:
                    source_status["status"] = "warning"
                    source_status["message"] = "Directory is empty"
                    has_warnings = True
        except Exception as exc:
            logger.warning("Error resolving source %s: %s", source_key, exc)
            source_status["resolved"] = False
            source_status["status"] = "error" if source_key in _REQUIRED_STATUS else "warning"
            source_status["message"] = f"Failed to resolve: {exc}"
            if source_key in _REQUIRED_STATUS:
                has_errors = True
            else:
                has_warnings = True
        status["sources"][source_key] = source_status
    if has_errors:
        status["overall"] = "error"
    elif has_warnings:
        status["overall"] = "warning"
    return {"success": True, "status": status}


def _test_local(project_id: str, source_key: str, config: dict[str, Any]) -> dict[str, Any]:
    local_path = str(config.get("localPath") or "").strip()
    if not local_path:
        raise SourcesHttpError(400, "Local path is required", "MISSING_LOCAL_PATH")
    path_obj = Path(local_path)
    if not path_obj.is_absolute():
        project_dir = get_project_dir(project_id)
        path_obj = (project_dir / local_path).resolve()
        try:
            path_obj.relative_to(project_dir.resolve())
        except ValueError as exc:
            raise SourcesHttpError(400, "Path resolves outside project directory", "PATH_TRAVERSAL") from exc
    if not path_obj.exists():
        raise SourcesHttpError(400, f"Path does not exist: {path_obj}", "PATH_NOT_FOUND")
    if not os.access(path_obj, os.R_OK):
        raise SourcesHttpError(400, f"Path is not readable: {path_obj}", "PATH_NOT_READABLE")
    content_hint = ""
    if source_key == "inventory":
        if path_obj.is_file() and path_obj.suffix in (".yml", ".yaml"):
            content_hint = "Contains inventory file"
        elif path_obj.is_dir():
            inv_files = list(path_obj.glob("*.yml")) + list(path_obj.glob("*.yaml"))
            content_hint = (
                f"Contains {len(inv_files)} inventory file(s)"
                if inv_files
                else "Directory exists but no inventory files found"
            )
    elif source_key == "roles_playbooks" and path_obj.is_dir():
        role_dirs = [d for d in path_obj.iterdir() if d.is_dir()]
        content_hint = (
            f"Contains {len(role_dirs)} potential role directory(ies)"
            if role_dirs
            else "Directory exists but no role directories found"
        )
    elif source_key in ("group_vars_storage", "host_vars_storage", "secrets_storage") and path_obj.is_dir():
        files = list(path_obj.glob("*.yml")) + list(path_obj.glob("*.yaml")) + list(path_obj.glob("*.json"))
        content_hint = (
            f"Contains {len(files)} variable/secret file(s)"
            if files
            else "Directory exists but no variable/secret files found"
        )
    return {
        "success": True,
        "ok": True,
        "details": {
            "path": str(path_obj),
            "exists": True,
            "isFile": path_obj.is_file(),
            "isDir": path_obj.is_dir(),
            "readable": True,
            "contentHint": content_hint,
        },
    }


def _test_git(project_id: str, source_key: str, config: dict[str, Any]) -> dict[str, Any]:
    git_config = config.get("git") or {}
    repo_url = str(git_config.get("repo") or "").strip()
    ref = str(git_config.get("ref") or "main").strip()
    subdir = str(git_config.get("subdir") or "").strip()
    auth_secret_id = git_config.get("authSecretId")
    if not repo_url:
        raise SourcesHttpError(400, "Repository URL is required", "MISSING_REPO_URL")
    try:
        resolved_path = git_manager().resolve_path(
            project_id=project_id,
            source_key=source_key,
            repo_url=repo_url,
            ref=ref,
            subdir=subdir,
            auth_secret_id=auth_secret_id,
            force_refresh=True,
        )
    except GitSourceError as exc:
        raise SourcesHttpError(400, exc.message, exc.error_code) from exc
    if not resolved_path.exists():
        raise SourcesHttpError(400, f"Resolved path does not exist: {resolved_path}", "SUBDIR_NOT_FOUND")
    return {
        "success": True,
        "ok": True,
        "details": {
            "repo": repo_url,
            "ref": ref,
            "subdir": subdir,
            "resolvedPath": str(resolved_path),
            "exists": True,
            "isFile": resolved_path.is_file(),
            "isDir": resolved_path.is_dir(),
        },
    }


def test_source(project_id: str, body: dict[str, Any]) -> dict[str, Any]:
    source_key = body.get("sourceKey")
    config = body.get("config") or {}
    if not source_key:
        raise SourcesHttpError(400, "sourceKey is required", "MISSING_SOURCE_KEY")
    mode = config.get("mode", "local")
    if mode == "local":
        return _test_local(project_id, source_key, config)
    if mode == "git":
        return _test_git(project_id, source_key, config)
    raise SourcesHttpError(400, f"Invalid mode: {mode}", "INVALID_MODE")


def sync_source(project_id: str, body: dict[str, Any]) -> dict[str, Any]:
    source_key = body.get("sourceKey") or "repo"
    config = load_project_config(project_id)
    sources = config.get("sources") or {}
    normalized = normalize_sources(sources, project_id)
    if source_key not in normalized:
        raise SourcesHttpError(404, f"Source {source_key} not found", "SOURCE_NOT_FOUND")
    source_config = normalized[source_key]
    mode = source_config.get("mode", "local")
    if mode != "git":
        raise SourcesHttpError(
            400,
            f"Source {source_key} is not a git source (mode: {mode})",
            "NOT_GIT_SOURCE",
        )
    git_config = source_config.get("git") or {}
    repo_url = git_config.get("repo")
    ref = git_config.get("ref", "main")
    subdir = git_config.get("subdir", "")
    auth_secret_id = git_config.get("authSecretId")
    if not repo_url:
        raise SourcesHttpError(400, "Repository URL is required", "MISSING_REPO_URL")
    try:
        direction = str(body.get("direction") or "pull").strip().lower()
        if direction not in ("pull", "push", "both"):
            raise SourcesHttpError(400, "Invalid sync direction", "INVALID_DIRECTION")
        success, error_code, error_message = sync_service().execute_sync(
            project_id=project_id,
            source_key=source_key,
            source_config=source_config,
            direction=direction,
        )
    except GitSourceError as exc:
        raise SourcesHttpError(400, exc.message, exc.error_code) from exc
    if not success:
        raise SourcesHttpError(500, error_message or "Sync failed", error_code or "SYNC_FAILED")
    if "syncTimestamps" not in config:
        config["syncTimestamps"] = {}
    config["syncTimestamps"][source_key] = int(time.time())
    save_project_config(project_id, config)
    resolved_path = None
    try:
        resolved_path = git_manager().resolve_path(
            project_id=project_id,
            source_key=source_key,
            repo_url=repo_url,
            ref=ref,
            subdir=subdir,
            auth_secret_id=auth_secret_id,
            force_refresh=False,
        )
    except Exception as exc:
        logger.warning("Could not resolve path for response: %s", exc)
    if source_key == "repo" or subdir == "" or "inventor" in str(subdir).lower():
        try:
            ensure_all_inventory_dirs(project_id)
        except Exception as exc:
            logger.warning("Failed to ensure inventory directories after sync: %s", exc)
    return {
        "success": True,
        "ok": True,
        "syncedAt": config["syncTimestamps"][source_key],
        "details": {
            "repo": repo_url,
            "ref": ref,
            "subdir": subdir,
            "resolvedPath": str(resolved_path) if resolved_path else None,
            "exists": resolved_path.exists() if resolved_path else False,
            "isFile": resolved_path.is_file() if resolved_path else False,
            "isDir": resolved_path.is_dir() if resolved_path else False,
        },
    }
