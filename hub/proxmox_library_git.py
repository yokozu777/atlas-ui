"""Clone and inspect the atlas-proxmox-library checkout."""
from __future__ import annotations

import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Any, Optional

from proxmox_library_config import (
    ENV_LIBRARY_ROOT,
    library_fetched_at_from_ui_config,
    library_ignore_host_key_from_ui_config,
    library_root_from_ui_config,
    looks_like_library,
    resolve_library_ignore_host_key,
    save_library_root,
)

DEFAULT_GIT_URL = "https://github.com/yokozu777/atlas-proxmox-library.git"
ENV_GIT_URL = "ATLAS_PROXMOX_LIBRARY_GIT_URL"
ENV_UI_ROOT = "ATLAS_UI_ROOT"
GIT_TIMEOUT_SEC = 180
_REF = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")
_GIT_SSH_IGNORE_HOST_KEY = (
    "ssh -o StrictHostKeyChecking=no "
    "-o UserKnownHostsFile=/dev/null "
    "-o LogLevel=ERROR"
)


class ProxmoxLibraryGitError(Exception):
    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.message = message


def default_git_url() -> str:
    return os.environ.get(ENV_GIT_URL, "").strip() or DEFAULT_GIT_URL


def _candidate_dirs() -> list[Path]:
    found: list[Path] = []
    ui_root = os.environ.get(ENV_UI_ROOT, "").strip()
    if ui_root:
        root = Path(ui_root).expanduser().resolve()
        found.append(root.parent / "atlas-proxmox-library")
        found.append(root / "atlas-proxmox-library")
    cwd = Path.cwd().resolve()
    found.extend(
        [
            cwd.parent / "atlas-proxmox-library",
            cwd.parent.parent / "atlas-proxmox-library",
            cwd / "atlas-proxmox-library",
        ]
    )
    return found


def default_dest() -> Path:
    env_root = os.environ.get(ENV_LIBRARY_ROOT, "").strip()
    if env_root:
        return Path(env_root).expanduser().resolve()
    for path in _candidate_dirs():
        if looks_like_library(path):
            return path
    ui_root = os.environ.get(ENV_UI_ROOT, "").strip()
    if ui_root:
        return (Path(ui_root).expanduser().resolve().parent / "atlas-proxmox-library")
    return (Path.cwd() / "atlas-proxmox-library").resolve()


def resolve_dest(raw: Optional[str]) -> Path:
    text = (raw or "").strip()
    if not text:
        saved = library_root_from_ui_config()
        if saved is not None:
            return saved.expanduser().resolve()
        return default_dest()
    path = Path(text).expanduser()
    if not path.is_absolute():
        ui_root = os.environ.get(ENV_UI_ROOT, "").strip()
        base = Path(ui_root).expanduser() if ui_root else Path.cwd()
        path = base / path
    return path.resolve()


def resolve_url(raw: Optional[str]) -> str:
    text = (raw or "").strip()
    return text or default_git_url()


def library_checkout() -> Path:
    """Directory the hub runs proxmox-library from."""
    env_root = os.environ.get(ENV_LIBRARY_ROOT, "").strip()
    if env_root:
        path = Path(env_root).expanduser().resolve()
        if looks_like_library(path):
            return path
    saved = library_root_from_ui_config()
    if saved is not None and looks_like_library(saved.expanduser().resolve()):
        return saved.expanduser().resolve()
    fallback = default_dest()
    if looks_like_library(fallback):
        return fallback
    raise ProxmoxLibraryGitError(
        400,
        "atlas-proxmox-library is not installed. Open Console, tab library, and install it.",
    )


def _is_empty_dir(path: Path) -> bool:
    if not path.exists():
        return True
    if not path.is_dir():
        return False
    try:
        next(path.iterdir())
    except StopIteration:
        return True
    return False


def _is_git_repo(path: Path) -> bool:
    return path.is_dir() and (path / ".git").exists()


def _git_env(ignore_host_key: bool) -> dict[str, str]:
    env = {**os.environ, "GIT_TERMINAL_PROMPT": "0", "GIT_SSL_NO_VERIFY": "1"}
    if ignore_host_key:
        env["GIT_SSH_COMMAND"] = _GIT_SSH_IGNORE_HOST_KEY
    return env


def _run_git(args: list[str], *, cwd: Optional[Path] = None, ignore_host_key: bool = False) -> str:
    try:
        result = subprocess.run(
            ["git", "-c", "http.sslVerify=false", *args],
            cwd=str(cwd) if cwd else None,
            env=_git_env(ignore_host_key),
            capture_output=True,
            text=True,
            timeout=GIT_TIMEOUT_SEC,
            check=False,
        )
    except FileNotFoundError as exc:
        raise ProxmoxLibraryGitError(500, "git is not installed on this host") from exc
    except subprocess.TimeoutExpired as exc:
        raise ProxmoxLibraryGitError(500, "git timed out") from exc
    if result.returncode != 0:
        detail = f"{result.stderr or ''}{result.stdout or ''}".strip() or "git failed"
        raise ProxmoxLibraryGitError(500, detail[:500])
    return (result.stdout or "").strip()


def _normalize_git_url(url: str) -> str:
    return url.strip().rstrip("/").removesuffix(".git")


def _validate_ref(ref: Optional[str]) -> str:
    chosen = (ref or "").strip()
    if not chosen or not _REF.fullmatch(chosen):
        raise ProxmoxLibraryGitError(400, f"invalid ref: {ref or ''}")
    return chosen


def _version_sort_key(name: str) -> list[tuple[int, int | str]]:
    key: list[tuple[int, int | str]] = []
    for part in re.split(r"(\d+)", name):
        if not part:
            continue
        if part.isdigit():
            key.append((0, int(part)))
        else:
            key.append((1, part.lower()))
    return key


def parse_ls_remote(stdout: str) -> list[str]:
    has_main = False
    tags: list[str] = []
    for raw in stdout.splitlines():
        name = raw.strip().split()[-1] if raw.strip() else ""
        if name == "refs/heads/main":
            has_main = True
        elif name.startswith("refs/tags/") and not name.endswith("^{}"):
            tags.append(name[len("refs/tags/") :])
    tags.sort(key=lambda item: item, reverse=True)
    return [*(["main"] if has_main else []), *tags]


def latest_ref(refs: list[str]) -> str:
    tags = [item for item in refs if item != "main"]
    if tags:
        tags.sort(key=_version_sort_key, reverse=True)
        return tags[0]
    if "main" in refs:
        return "main"
    raise ProxmoxLibraryGitError(400, "no main branch or tags on that Git URL")


def _checkout_ref(path: Path, ignore_host_key: bool) -> str:
    if not _is_git_repo(path):
        return ""
    try:
        branch = _run_git(["symbolic-ref", "--short", "HEAD"], cwd=path, ignore_host_key=ignore_host_key)
        if branch:
            return branch
    except ProxmoxLibraryGitError:
        branch = ""
    try:
        tag = _run_git(
            ["describe", "--tags", "--exact-match", "HEAD"],
            cwd=path,
            ignore_host_key=ignore_host_key,
        )
        if tag:
            return tag
    except ProxmoxLibraryGitError:
        tag = ""
    try:
        return _run_git(["rev-parse", "--short", "HEAD"], cwd=path, ignore_host_key=ignore_host_key)
    except ProxmoxLibraryGitError:
        return ""


def _version(path: Path) -> str:
    binary = path / "proxmox-library"
    try:
        result = subprocess.run(
            [sys.executable, str(binary), "--version"],
            cwd=str(path),
            capture_output=True,
            text=True,
            timeout=15,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return ""
    text = (result.stdout or "").strip()
    if result.returncode != 0 or not text:
        return ""
    try:
        import json

        payload = json.loads(text)
    except json.JSONDecodeError:
        return text
    if isinstance(payload, dict):
        return str(payload.get("version") or "")
    return ""


def _fetched_at(path: Path) -> Optional[str]:
    for rel in (Path(".git") / "FETCH_HEAD", Path(".git")):
        target = path / rel
        try:
            stamp = target.stat().st_mtime
        except OSError:
            continue
        from datetime import datetime, timezone

        return (
            datetime.fromtimestamp(stamp, timezone.utc)
            .replace(microsecond=0)
            .isoformat()
            .replace("+00:00", "Z")
        )
    return library_fetched_at_from_ui_config()


def inspect_checkout(*, url: Optional[str] = None, dest: Optional[str] = None) -> dict[str, Any]:
    git_url = resolve_url(url)
    path = resolve_dest(dest)
    ignore = library_ignore_host_key_from_ui_config()
    exists = path.exists()
    is_repo = exists and _is_git_repo(path)
    configured = exists and looks_like_library(path)
    payload: dict[str, Any] = {
        "success": True,
        "ok": False,
        "configured": configured,
        "gitUrl": git_url,
        "dest": str(path),
        "libraryRoot": str(path),
        "exists": exists,
        "isRepo": is_repo,
        "version": "",
        "ref": "",
        "error": None,
        "fetchedAt": _fetched_at(path) if exists else library_fetched_at_from_ui_config(),
        "ignoreHostKey": ignore,
    }
    if not configured:
        if exists and not is_repo and not _is_empty_dir(path):
            payload["error"] = f"destination is not empty and is not a git checkout: {path}"
        return payload
    payload["ok"] = True
    payload["version"] = _version(path)
    payload["ref"] = _checkout_ref(path, ignore)
    return payload


def list_refs(*, url: Optional[str] = None, ignore_host_key: Any = None) -> dict[str, Any]:
    enabled = resolve_library_ignore_host_key(ignore_host_key)
    git_url = resolve_url(url)
    stdout = _run_git(
        ["ls-remote", "--heads", "--tags", "--refs", git_url],
        ignore_host_key=enabled,
    )
    return {
        "success": True,
        "gitUrl": git_url,
        "refs": parse_ls_remote(stdout),
        "refDates": {},
        "ignoreHostKey": enabled,
    }


def probe_checkout(*, url: Optional[str] = None, dest: Optional[str] = None) -> dict[str, Any]:
    path = resolve_dest(dest)
    if not looks_like_library(path):
        raise ProxmoxLibraryGitError(
            400,
            f"not an atlas-proxmox-library checkout (need ./proxmox-library and proxmoxlib/__main__.py): {path}",
        )
    save_library_root(path, fetched=False)
    return inspect_checkout(url=url, dest=str(path))


def _fetch_and_checkout(path: Path, ref: str, ignore_host_key: bool) -> None:
    if ref == "main":
        _run_git(["fetch", "--depth", "1", "origin", "main"], cwd=path, ignore_host_key=ignore_host_key)
        _run_git(["checkout", "-B", "main", "FETCH_HEAD"], cwd=path, ignore_host_key=ignore_host_key)
        return
    spec = f"refs/tags/{ref}:refs/tags/{ref}"
    _run_git(["fetch", "--depth", "1", "origin", spec], cwd=path, ignore_host_key=ignore_host_key)
    _run_git(
        ["checkout", "--force", "--detach", f"refs/tags/{ref}"],
        cwd=path,
        ignore_host_key=ignore_host_key,
    )


def install_library(
    *,
    url: Optional[str] = None,
    dest: Optional[str] = None,
    ref: Optional[str] = None,
    ignore_host_key: Any = None,
) -> dict[str, Any]:
    enabled = resolve_library_ignore_host_key(ignore_host_key)
    git_url = resolve_url(url)
    path = resolve_dest(dest)
    chosen = _validate_ref(ref)
    if path.exists() and not path.is_dir():
        raise ProxmoxLibraryGitError(400, f"not a directory: {path}")
    if _is_empty_dir(path):
        path.parent.mkdir(parents=True, exist_ok=True)
        _run_git(
            ["clone", "--depth", "1", "--branch", chosen, git_url, str(path)],
            ignore_host_key=enabled,
        )
    elif not _is_git_repo(path):
        raise ProxmoxLibraryGitError(400, f"destination is not empty: {path}")
    else:
        origin = _run_git(["remote", "get-url", "origin"], cwd=path, ignore_host_key=enabled)
        if _normalize_git_url(origin) != _normalize_git_url(git_url):
            raise ProxmoxLibraryGitError(400, f"origin is {origin}, not {git_url}")
        _fetch_and_checkout(path, chosen, enabled)
    if not looks_like_library(path):
        raise ProxmoxLibraryGitError(
            400,
            f"not an atlas-proxmox-library checkout (need ./proxmox-library and proxmoxlib/__main__.py): {path}",
        )
    save_library_root(path, fetched=True)
    payload = inspect_checkout(url=git_url, dest=str(path))
    payload["ignoreHostKey"] = enabled
    return payload


def ensure_library(
    *,
    url: Optional[str] = None,
    dest: Optional[str] = None,
    ignore_host_key: Any = None,
) -> dict[str, Any]:
    """Clone the newest tag (else main) when the checkout is missing or empty."""
    payload = inspect_checkout(url=url, dest=dest)
    dest_text = str(payload.get("dest") or "")
    if payload.get("configured"):
        print(f"proxmox-library: checkout ready at {dest_text}", flush=True)
        return payload
    if payload.get("error"):
        print(f"proxmox-library: {payload['error']}", flush=True)
        return payload
    git_url = str(payload.get("gitUrl") or "")
    print(f"proxmox-library: downloading {git_url} into {dest_text}", flush=True)
    enabled = resolve_library_ignore_host_key(ignore_host_key)
    listed = list_refs(url=url or git_url, ignore_host_key=enabled)
    chosen = latest_ref(listed.get("refs") or [])
    print(f"proxmox-library: using {chosen}", flush=True)
    result = install_library(
        url=listed.get("gitUrl"),
        dest=payload.get("dest"),
        ref=chosen,
        ignore_host_key=enabled,
    )
    if result.get("ok"):
        version = str(result.get("version") or "").splitlines()
        print(f"proxmox-library: ready {version[0] if version else dest_text}", flush=True)
    elif result.get("error"):
        print(f"proxmox-library: {result['error']}", flush=True)
    return result
