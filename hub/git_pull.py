"""Atlas playbook git-pull secret bindings (project gitPull + claim materialize).

Bindings live on the atlas project record, not in cluster.yaml.
Material (private keys) stays in global/project secret storage until claim.
"""
from __future__ import annotations

import json
import logging
import os
import re
import shlex
import shutil
from pathlib import Path
from typing import Any, Mapping, MutableMapping, Optional

from executions_store import get_project_dir
from global_secrets_manager import GlobalSecretError, GlobalSecretsManager

logger = logging.getLogger(__name__)

REPO_NAME_RE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9._-]*$")
PLAYBOOKS_SSH_KEY_RE = re.compile(r"^PLAYBOOKS_[A-Z0-9_]+_SSH_KEY$")
ALLOWED_GLOBAL_TYPES = frozenset({"git_ssh_key"})
ALLOWED_PROJECT_TYPES = frozenset({"ssh_key"})


class GitPullError(Exception):
    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.message = message


def playbooks_ssh_key_env_name(repo_name: str) -> str:
    suffix = repo_name.upper().replace("-", "_").replace(".", "_")
    return f"PLAYBOOKS_{suffix}_SSH_KEY"


def is_atlas_git_env_key(key: str) -> bool:
    return key == "GIT_SSH_COMMAND" or bool(PLAYBOOKS_SSH_KEY_RE.fullmatch(key))


def resolve_git_ssh_command(ssh_key: str) -> str:
    return (
        f"ssh -i {shlex.quote(ssh_key)} -o IdentitiesOnly=yes "
        "-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null"
    )


def public_git_pull(project: Mapping[str, Any] | None) -> dict[str, Any]:
    block = (project or {}).get("gitPull")
    default_id = None
    repo_ids: dict[str, str] = {}
    if isinstance(block, Mapping):
        raw_default = block.get("defaultSecretId")
        if raw_default is not None and str(raw_default).strip():
            default_id = str(raw_default).strip()
        raw_repos = block.get("repoSecretIds")
        if isinstance(raw_repos, Mapping):
            for name, secret_id in raw_repos.items():
                repo = str(name).strip()
                sid = "" if secret_id is None else str(secret_id).strip()
                if repo and sid:
                    repo_ids[repo] = sid
    return {"defaultSecretId": default_id, "repoSecretIds": repo_ids}


def git_ssh_material_dir(
    project_id: str,
    execution_id: str,
    *,
    data_dir: Path | None = None,
) -> Path:
    if data_dir is not None:
        base = Path(data_dir) / "projects" / project_id
    else:
        base = get_project_dir(project_id)
    return base / "tmp" / "git-ssh" / str(execution_id)


def cleanup_git_pull_keys(
    project_id: str,
    execution_id: str,
    *,
    data_dir: Path | None = None,
) -> None:
    path = git_ssh_material_dir(project_id, execution_id, data_dir=data_dir)
    shutil.rmtree(path, ignore_errors=True)
    parent = path.parent
    try:
        if parent.is_dir() and not any(parent.iterdir()):
            parent.rmdir()
    except OSError:
        pass


def _normalize_secret_id(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _validate_repo_name(name: str) -> None:
    if not REPO_NAME_RE.fullmatch(name):
        raise GitPullError(
            400,
            f"unknown playbook repo {name!r} — use letters, digits, '.', '_', '-'",
        )


def _project_secret_file(project_id: str, secret_id: str) -> Optional[Path]:
    root = get_project_dir(project_id) / "secrets"
    for candidate in (
        root / "ssh_keys" / f"{secret_id}.json",
        root / "git_auth" / f"{secret_id}.json",
        root / f"{secret_id}.json",
    ):
        if candidate.is_file():
            return candidate
    return None


def _load_project_secret(project_id: str, secret_id: str) -> Optional[dict[str, Any]]:
    path = _project_secret_file(project_id, secret_id)
    if path is None:
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise GitPullError(400, f"Failed to read project secret {secret_id}") from exc


def resolve_git_pull_secret(
    secret_id: str,
    *,
    project_id: str,
    data_dir: Path,
    include_material: bool,
) -> dict[str, Any]:
    """Load a git-pull secret (global git_ssh_key, else project ssh_key)."""
    manager = GlobalSecretsManager(data_dir)
    try:
        secret = manager.get_secret(secret_id, include_material=include_material)
    except GlobalSecretError as exc:
        raise GitPullError(400, str(exc)) from exc
    if secret:
        secret_type = str(secret.get("type") or "")
        if secret_type not in ALLOWED_GLOBAL_TYPES:
            raise GitPullError(
                400,
                f"secret {secret_id} type {secret_type!r} is not a git SSH key",
            )
        if include_material and not str(secret.get("privateKey") or "").strip():
            raise GitPullError(400, f"secret {secret_id} is missing privateKey")
        return secret

    project_secret = _load_project_secret(project_id, secret_id)
    if not project_secret:
        raise GitPullError(400, f"secret {secret_id} not found")
    secret_type = str(project_secret.get("type") or "")
    if secret_type not in ALLOWED_PROJECT_TYPES:
        raise GitPullError(
            400,
            f"secret {secret_id} type {secret_type!r} is not a git SSH key",
        )
    if include_material and not str(project_secret.get("privateKey") or "").strip():
        raise GitPullError(400, f"secret {secret_id} is missing privateKey")
    return project_secret


def _write_key_file(path: Path, private_key: str) -> Path:
    content = private_key.strip()
    if not content.endswith("\n"):
        content += "\n"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    os.chmod(path.parent, 0o700)
    os.chmod(path, 0o600)
    return path


def apply_git_pull_fields(
    project: MutableMapping[str, Any],
    body: Mapping[str, Any],
    *,
    data_dir: Path,
    project_id: str,
) -> None:
    if "gitPull" not in body:
        return
    kind = str(project.get("kind") or "").strip().lower()
    if kind != "atlas":
        raise GitPullError(400, "gitPull is only valid for atlas projects")

    incoming = body.get("gitPull")
    if incoming is None:
        project.pop("gitPull", None)
        return
    if not isinstance(incoming, Mapping):
        raise GitPullError(400, "gitPull must be an object")

    current = public_git_pull(project)
    if "defaultSecretId" in incoming:
        current["defaultSecretId"] = _normalize_secret_id(incoming.get("defaultSecretId"))
    if "repoSecretIds" in incoming:
        patch = incoming.get("repoSecretIds")
        if patch is None:
            current["repoSecretIds"] = {}
        elif not isinstance(patch, Mapping):
            raise GitPullError(400, "gitPull.repoSecretIds must be an object")
        else:
            repos = dict(current["repoSecretIds"])
            for raw_name, raw_id in patch.items():
                name = str(raw_name).strip()
                _validate_repo_name(name)
                secret_id = _normalize_secret_id(raw_id)
                if secret_id is None:
                    repos.pop(name, None)
                else:
                    repos[name] = secret_id
            current["repoSecretIds"] = repos

    if current["defaultSecretId"]:
        resolve_git_pull_secret(
            current["defaultSecretId"],
            project_id=project_id,
            data_dir=data_dir,
            include_material=False,
        )
    for name, secret_id in current["repoSecretIds"].items():
        _validate_repo_name(name)
        resolve_git_pull_secret(
            secret_id,
            project_id=project_id,
            data_dir=data_dir,
            include_material=False,
        )

    if not current["defaultSecretId"] and not current["repoSecretIds"]:
        project.pop("gitPull", None)
        return
    project["gitPull"] = {
        "defaultSecretId": current["defaultSecretId"],
        "repoSecretIds": current["repoSecretIds"],
    }


def is_atlas_clusterctl_execution(execution: Mapping[str, Any] | None) -> bool:
    data = execution or {}
    if str(data.get("kind") or "").strip().lower() == "atlas":
        return True
    params = data.get("runParams") or {}
    return str(params.get("executor") or "").strip().lower() == "clusterctl"


def materialize_git_pull_env(
    project: Mapping[str, Any],
    *,
    project_id: str,
    execution_id: str,
    data_dir: Path,
) -> dict[str, str]:
    """Decrypt bound secrets onto disk; return env for the claim payload only."""
    pull = public_git_pull(project)
    default_id = pull.get("defaultSecretId")
    repo_ids = pull.get("repoSecretIds") or {}
    if not default_id and not repo_ids:
        return {}

    tmp = git_ssh_material_dir(project_id, execution_id, data_dir=data_dir)
    tmp.mkdir(parents=True, exist_ok=True)
    os.chmod(tmp, 0o700)
    env: dict[str, str] = {}

    try:
        if default_id:
            secret = resolve_git_pull_secret(
                str(default_id),
                project_id=project_id,
                data_dir=data_dir,
                include_material=True,
            )
            key_path = tmp / "default"
            _write_key_file(key_path, str(secret.get("privateKey") or ""))
            env["GIT_SSH_COMMAND"] = resolve_git_ssh_command(str(key_path))

        for repo_name, secret_id in repo_ids.items():
            _validate_repo_name(repo_name)
            secret = resolve_git_pull_secret(
                secret_id,
                project_id=project_id,
                data_dir=data_dir,
                include_material=True,
            )
            key_path = tmp / repo_name
            _write_key_file(key_path, str(secret.get("privateKey") or ""))
            env[playbooks_ssh_key_env_name(repo_name)] = str(key_path)
    except Exception:
        shutil.rmtree(tmp, ignore_errors=True)
        raise
    return env


def claim_run_params_with_git_pull(
    execution: Mapping[str, Any],
    *,
    project: Mapping[str, Any],
    project_id: str,
    execution_id: str,
    data_dir: Path,
) -> dict[str, Any]:
    params = dict(execution.get("runParams") or {})
    if not is_atlas_clusterctl_execution(execution):
        return params
    extra = materialize_git_pull_env(
        project,
        project_id=project_id,
        execution_id=execution_id,
        data_dir=data_dir,
    )
    if not extra:
        return params
    merged = dict(params.get("env") or {})
    if not isinstance(merged, dict):
        merged = {}
    merged.update(extra)
    params["env"] = merged
    return params
