"""Clone / pull public atlas-clusterctl into a host checkout path."""
from __future__ import annotations

import os
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from clusterctl_config import (
    ENV_CLUSTER_ROOT,
    clusterctl_fetched_at_from_ui_config,
    save_clusterctl_root_to_ui_config,
)

DEFAULT_GIT_URL = "https://github.com/yokozu777/atlas-clusterctl.git"
ENV_GIT_URL = "ATLAS_CLUSTERCTL_GIT_URL"
ENV_UI_ROOT = "ATLAS_UI_ROOT"
ENV_AUTO_INSTALL = "ATLAS_CLUSTERCTL_AUTO_INSTALL"
GIT_TIMEOUT_SEC = 180


class ClusterctlGitError(Exception):
    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.message = message


def default_git_url() -> str:
    return os.environ.get(ENV_GIT_URL, "").strip() or DEFAULT_GIT_URL


def default_dest() -> Path:
    env_root = os.environ.get(ENV_CLUSTER_ROOT, "").strip()
    if env_root:
        return Path(env_root).expanduser().resolve()
    ui_root = os.environ.get(ENV_UI_ROOT, "").strip()
    if ui_root:
        return (Path(ui_root).expanduser() / "atlas-clusterctl").resolve()
    return (Path.cwd() / "atlas-clusterctl").resolve()


def resolve_dest(raw: Optional[str]) -> Path:
    text = (raw or "").strip()
    if not text:
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


def _looks_like_clusterctl(path: Path) -> bool:
    return (path / "cluster").is_file() and (path / "clusterctl" / "__main__.py").is_file()


def _run_git(args: list[str], *, cwd: Optional[Path] = None) -> subprocess.CompletedProcess[str]:
    try:
        result = subprocess.run(
            ["git", "-c", "http.sslVerify=false", *args],
            cwd=str(cwd) if cwd else None,
            capture_output=True,
            text=True,
            timeout=GIT_TIMEOUT_SEC,
            check=False,
            env={
                **os.environ,
                "GIT_TERMINAL_PROMPT": "0",
                "GIT_SSL_NO_VERIFY": "1",
            },
        )
    except FileNotFoundError as exc:
        raise ClusterctlGitError(500, "git is not installed on this host") from exc
    except subprocess.TimeoutExpired as exc:
        raise ClusterctlGitError(504, "git timed out") from exc
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "git failed").strip()
        raise ClusterctlGitError(400, detail)
    return result


def _normalize_git_url(url: str) -> str:
    return url.strip().rstrip("/").removesuffix(".git")


def _probe_version(dest: Path) -> tuple[str, Optional[str]]:
    binary = dest / "cluster"
    if not binary.is_file():
        return "", "clusterctl binary missing"
    try:
        result = subprocess.run(
            [str(binary), "--version"],
            cwd=str(dest),
            capture_output=True,
            text=True,
            timeout=20,
            env={**os.environ, "ATLAS_CLUSTER_ROOT": str(dest)},
            check=False,
        )
    except OSError as exc:
        return "", str(exc)
    text = f"{result.stdout or ''}{result.stderr or ''}".strip()
    if result.returncode != 0:
        return "", text or f"exit {result.returncode}"
    return text, None


def auto_install_enabled() -> bool:
    raw = os.environ.get(ENV_AUTO_INSTALL, "1").strip().lower()
    return raw not in {"0", "false", "no", "off"}


def _iso_from_mtime(path: Path) -> Optional[str]:
    try:
        stamp = datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc)
    except OSError:
        return None
    return stamp.replace(microsecond=0).isoformat().replace("+00:00", "Z")


def checkout_fetched_at(path: Path) -> Optional[str]:
    for candidate in (path / ".git" / "FETCH_HEAD", path / ".git"):
        if candidate.exists():
            found = _iso_from_mtime(candidate)
            if found:
                return found
    return clusterctl_fetched_at_from_ui_config()


def inspect_checkout(*, url: Optional[str] = None, dest: Optional[str] = None) -> dict[str, Any]:
    git_url = resolve_url(url)
    path = resolve_dest(dest)
    exists = path.exists()
    is_repo = _is_git_repo(path)
    payload: dict[str, Any] = {
        "success": True,
        "gitUrl": git_url,
        "dest": str(path),
        "clusterctlRoot": str(path),
        "exists": exists,
        "isRepo": is_repo,
        "configured": exists and _looks_like_clusterctl(path),
        "version": "",
        "ok": False,
        "error": None,
        "fetchedAt": checkout_fetched_at(path) if exists else clusterctl_fetched_at_from_ui_config(),
    }
    if exists and not path.is_dir():
        payload["error"] = f"not a directory: {path}"
        return payload
    if payload["configured"]:
        version, error = _probe_version(path)
        payload["version"] = version
        payload["error"] = error
        payload["ok"] = error is None
    elif exists and not is_repo and not _is_empty_dir(path):
        payload["error"] = f"destination is not empty and is not a git checkout: {path}"
    elif exists and is_repo and not _looks_like_clusterctl(path):
        payload["error"] = (
            f"not an atlas-clusterctl checkout (need ./cluster and clusterctl/__main__.py): {path}"
        )
    return payload


_REF_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")


def _validate_ref(raw: Optional[str]) -> str:
    text = (raw or "").strip()
    if not text:
        raise ClusterctlGitError(400, "ref is required")
    if not _REF_RE.fullmatch(text):
        raise ClusterctlGitError(400, f"invalid ref: {text}")
    return text


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
        line = raw.strip()
        if not line:
            continue
        name = line.split()[-1]
        if name == "refs/heads/main":
            has_main = True
        elif name.startswith("refs/tags/"):
            tag = name.removeprefix("refs/tags/")
            if tag.endswith("^{}"):
                continue
            tags.append(tag)
    tags.sort(key=_version_sort_key, reverse=True)
    return (["main"] if has_main else []) + tags


def latest_ref(refs: list[str]) -> str:
    tags = [item for item in refs if item != "main"]
    if tags:
        return tags[0]
    if "main" in refs:
        return "main"
    raise ClusterctlGitError(400, "no main branch or tags on that Git URL")


def list_clusterctl_refs(*, url: Optional[str] = None) -> dict[str, Any]:
    git_url = resolve_url(url)
    result = _run_git(["ls-remote", "--heads", "--tags", "--refs", git_url])
    refs = parse_ls_remote(result.stdout or "")
    return {"success": True, "gitUrl": git_url, "refs": refs}


def _finish_install(path: Path, git_url: str) -> dict[str, Any]:
    if not _looks_like_clusterctl(path):
        raise ClusterctlGitError(
            400,
            f"not an atlas-clusterctl checkout (need ./cluster and clusterctl/__main__.py): {path}",
        )
    save_clusterctl_root_to_ui_config(path, fetched=True)
    return inspect_checkout(url=git_url, dest=str(path))


def _fetch_and_checkout(path: Path, ref: str) -> None:
    if ref == "main":
        _run_git(["fetch", "--depth", "1", "origin", "main"], cwd=path)
        _run_git(["checkout", "-B", "main", "FETCH_HEAD"], cwd=path)
        return
    spec = f"refs/tags/{ref}:refs/tags/{ref}"
    _run_git(["fetch", "--depth", "1", "origin", spec], cwd=path)
    _run_git(["checkout", "--force", "--detach", f"refs/tags/{ref}"], cwd=path)


def install_clusterctl(
    *,
    url: Optional[str] = None,
    dest: Optional[str] = None,
    ref: Optional[str] = None,
) -> dict[str, Any]:
    git_url = resolve_url(url)
    path = resolve_dest(dest)
    chosen = _validate_ref(ref)
    if path.exists() and not path.is_dir():
        raise ClusterctlGitError(400, f"not a directory: {path}")
    if _is_empty_dir(path):
        path.parent.mkdir(parents=True, exist_ok=True)
        _run_git(["clone", "--depth", "1", "--branch", chosen, git_url, str(path)])
        return _finish_install(path, git_url)
    if not _is_git_repo(path):
        raise ClusterctlGitError(400, f"destination is not empty: {path}")
    origin = _run_git(["remote", "get-url", "origin"], cwd=path).stdout.strip()
    if _normalize_git_url(origin) != _normalize_git_url(git_url):
        raise ClusterctlGitError(400, f"origin is {origin}, not {git_url}")
    _fetch_and_checkout(path, chosen)
    return _finish_install(path, git_url)


def clone_clusterctl(*, url: Optional[str] = None, dest: Optional[str] = None) -> dict[str, Any]:
    git_url = resolve_url(url)
    path = resolve_dest(dest)
    if path.exists() and not path.is_dir():
        raise ClusterctlGitError(400, f"not a directory: {path}")
    if path.exists() and not _is_empty_dir(path):
        if _is_git_repo(path):
            raise ClusterctlGitError(400, "checkout already exists; use Pull")
        raise ClusterctlGitError(400, f"destination is not empty: {path}")
    path.parent.mkdir(parents=True, exist_ok=True)
    _run_git(["clone", "--depth", "1", git_url, str(path)])
    if not _looks_like_clusterctl(path):
        raise ClusterctlGitError(
            400,
            f"cloned tree is not atlas-clusterctl (need ./cluster and clusterctl/__main__.py): {path}",
        )
    save_clusterctl_root_to_ui_config(path, fetched=True)
    return inspect_checkout(url=git_url, dest=str(path))


def pull_clusterctl(*, url: Optional[str] = None, dest: Optional[str] = None) -> dict[str, Any]:
    path = resolve_dest(dest)
    if not _is_git_repo(path):
        raise ClusterctlGitError(400, f"not a git checkout: {path}")
    origin = _run_git(["remote", "get-url", "origin"], cwd=path).stdout.strip()
    requested = (url or "").strip()
    git_url = requested or origin or default_git_url()
    if requested and origin and _normalize_git_url(origin) != _normalize_git_url(requested):
        raise ClusterctlGitError(
            400,
            f"origin is {origin}, not {git_url}",
        )
    _run_git(["pull", "--ff-only"], cwd=path)
    if not _looks_like_clusterctl(path):
        raise ClusterctlGitError(
            400,
            f"not an atlas-clusterctl checkout (need ./cluster and clusterctl/__main__.py): {path}",
        )
    save_clusterctl_root_to_ui_config(path, fetched=True)
    return inspect_checkout(url=git_url, dest=str(path))


def ensure_clusterctl(*, url: Optional[str] = None, dest: Optional[str] = None) -> dict[str, Any]:
    """Clone the newest tag (else main) when the checkout is missing or empty."""
    payload = inspect_checkout(url=url, dest=dest)
    if payload.get("configured"):
        return payload
    if payload.get("error"):
        return payload
    listed = list_clusterctl_refs(url=url or payload.get("gitUrl"))
    chosen = latest_ref(listed.get("refs") or [])
    return install_clusterctl(
        url=listed.get("gitUrl"),
        dest=payload.get("dest"),
        ref=chosen,
    )
