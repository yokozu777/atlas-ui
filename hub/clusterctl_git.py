"""Clone / pull public atlas-clusterctl into a host checkout path."""
from __future__ import annotations

import json
import os
import re
import select
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from contextlib import contextmanager
from contextvars import ContextVar
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator, Optional

from clusterctl_config import (
    ENV_CLUSTER_ROOT,
    clusterctl_fetched_at_from_ui_config,
    clusterctl_ignore_host_key_from_ui_config,
    resolve_clusterctl_ignore_host_key,
    save_clusterctl_root_to_ui_config,
)

DEFAULT_GIT_URL = "https://github.com/yokozu777/atlas-clusterctl.git"
ENV_GIT_URL = "ATLAS_CLUSTERCTL_GIT_URL"
ENV_UI_ROOT = "ATLAS_UI_ROOT"
ENV_AUTO_INSTALL = "ATLAS_CLUSTERCTL_AUTO_INSTALL"
GIT_TIMEOUT_SEC = 180
_ignore_host_key: ContextVar[bool] = ContextVar(
    "atlas_clusterctl_ignore_host_key", default=False
)
_GIT_SSH_IGNORE_HOST_KEY = (
    "ssh -o StrictHostKeyChecking=no "
    "-o UserKnownHostsFile=/dev/null "
    "-o LogLevel=ERROR"
)


@contextmanager
def _using_ignore_host_key(enabled: bool) -> Iterator[None]:
    token = _ignore_host_key.set(bool(enabled))
    try:
        yield
    finally:
        _ignore_host_key.reset(token)


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


def _git_env() -> dict[str, str]:
    env = {
        **os.environ,
        "GIT_TERMINAL_PROMPT": "0",
        "GIT_SSL_NO_VERIFY": "1",
    }
    if _ignore_host_key.get():
        env["GIT_SSH_COMMAND"] = _GIT_SSH_IGNORE_HOST_KEY
    return env


def _with_progress(args: list[str]) -> list[str]:
    if not args or args[0] not in {"clone", "fetch", "pull"}:
        return args
    if "--progress" in args or "-q" in args:
        return args
    return [args[0], "--progress", *args[1:]]


def _stream_git(cmd: list[str], *, cwd: Optional[Path]) -> subprocess.CompletedProcess[str]:
    """Run git and copy its progress to stdout. Compose logs hide a captured clone."""
    try:
        proc = subprocess.Popen(
            cmd,
            cwd=str(cwd) if cwd else None,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            env=_git_env(),
        )
    except FileNotFoundError as exc:
        raise ClusterctlGitError(500, "git is not installed on this host") from exc
    stream = proc.stdout
    assert stream is not None
    fd = stream.fileno()
    os.set_blocking(fd, False)
    collected = bytearray()
    deadline = time.monotonic() + GIT_TIMEOUT_SEC

    def take(chunk: bytes) -> None:
        if not chunk:
            return
        collected.extend(chunk)
        sys.stdout.write(chunk.decode("utf-8", errors="replace").replace("\r", "\n"))
        sys.stdout.flush()

    try:
        while True:
            if time.monotonic() >= deadline:
                proc.kill()
                proc.wait(timeout=5)
                raise ClusterctlGitError(504, "git timed out")
            ready, _, _ = select.select([fd], [], [], 0.5)
            if ready:
                try:
                    chunk = os.read(fd, 4096)
                except BlockingIOError:
                    continue
                if not chunk:
                    break
                take(chunk)
                continue
            if proc.poll() is not None:
                while True:
                    try:
                        chunk = os.read(fd, 4096)
                    except BlockingIOError:
                        break
                    if not chunk:
                        break
                    take(chunk)
                break
        code = proc.wait(timeout=5)
    finally:
        stream.close()
    output = collected.decode("utf-8", errors="replace")
    if code != 0:
        raise ClusterctlGitError(400, output.strip() or "git failed")
    return subprocess.CompletedProcess(cmd, code, stdout=output, stderr="")


def _run_git(
    args: list[str], *, cwd: Optional[Path] = None, progress: bool = False
) -> subprocess.CompletedProcess[str]:
    argv = _with_progress(args) if progress else args
    cmd = [
        "git",
        "-c",
        "http.sslVerify=false",
        "-c",
        "advice.detachedHead=false",
        *argv,
    ]
    if progress and argv is not args:
        return _stream_git(cmd, cwd=cwd)
    try:
        result = subprocess.run(
            cmd,
            cwd=str(cwd) if cwd else None,
            capture_output=True,
            text=True,
            timeout=GIT_TIMEOUT_SEC,
            check=False,
            env=_git_env(),
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
        "ref": checkout_ref(path) if is_repo else "",
        "ok": False,
        "error": None,
        "fetchedAt": checkout_fetched_at(path) if exists else clusterctl_fetched_at_from_ui_config(),
        "ignoreHostKey": clusterctl_ignore_host_key_from_ui_config(),
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


def checkout_ref(path: Path) -> str:
    """Branch name, else the exact tag at HEAD, else a short commit."""
    if not _is_git_repo(path):
        return ""
    branch = _git_stdout(["symbolic-ref", "--short", "HEAD"], path)
    if branch:
        return branch
    tag = _git_stdout(["describe", "--tags", "--exact-match", "HEAD"], path)
    if tag:
        return tag
    return _git_stdout(["rev-parse", "--short", "HEAD"], path)


def _git_stdout(args: list[str], cwd: Path) -> str:
    try:
        result = subprocess.run(
            ["git", "-c", "advice.detachedHead=false", *args],
            cwd=str(cwd),
            capture_output=True,
            text=True,
            timeout=20,
            check=False,
            env=_git_env(),
        )
    except (OSError, subprocess.TimeoutExpired):
        return ""
    if result.returncode != 0:
        return ""
    return (result.stdout or "").strip()


def _iso_z(value: str) -> str:
    text = (value or "").strip()
    if not text:
        return ""
    try:
        stamp = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return text
    return stamp.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def github_repo_from_url(url: str) -> Optional[tuple[str, str]]:
    text = (url or "").strip()
    rest = ""
    for prefix in ("https://github.com/", "http://github.com/", "ssh://git@github.com/"):
        if text.startswith(prefix):
            rest = text[len(prefix) :]
            break
    else:
        if text.startswith("git@github.com:"):
            rest = text[len("git@github.com:") :]
    rest = rest.strip().strip("/").removesuffix(".git")
    owner, sep, name = rest.partition("/")
    if not sep or not owner or not name or "/" in name:
        return None
    return owner, name


def _local_git_dir(url: str) -> Optional[Path]:
    text = (url or "").strip()
    if text.startswith("file://"):
        text = text[len("file://") :]
    path = Path(text)
    if path.is_dir() and (path / ".git").exists():
        return path
    return None


def _local_ref_dates(repo: Path) -> dict[str, str]:
    result = _run_git(
        [
            "for-each-ref",
            "--format=%(refname)%09%(creatordate:iso-strict)",
            "refs/heads/main",
            "refs/tags",
        ],
        cwd=repo,
    )
    dates: dict[str, str] = {}
    for raw in (result.stdout or "").splitlines():
        name, sep, stamp = raw.partition("\t")
        if not sep:
            continue
        iso = _iso_z(stamp)
        if not iso:
            continue
        if name == "refs/heads/main":
            dates["main"] = iso
        elif name.startswith("refs/tags/") and not name.endswith("^{}"):
            dates[name.removeprefix("refs/tags/")] = iso
    return dates


def _github_get_json(url: str) -> Any:
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/vnd.github+json",
            "User-Agent": "atlas-ui",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )
    token = (os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN") or "").strip()
    if token:
        request.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(request, timeout=12) as response:
        return json.loads(response.read().decode())


def _commit_pushed_at(payload: Any) -> str:
    if not isinstance(payload, dict):
        return ""
    commit = payload.get("commit") or {}
    committer = commit.get("committer") or {}
    return _iso_z(str(committer.get("date") or ""))


def _github_one_date(owner: str, name: str, ref: str) -> str:
    root = f"https://api.github.com/repos/{owner}/{name}"
    if ref == "main":
        return _commit_pushed_at(_github_get_json(f"{root}/commits/main"))
    quoted = urllib.parse.quote(ref, safe="")
    try:
        info = _github_get_json(f"{root}/git/ref/tags/{quoted}")
    except urllib.error.HTTPError:
        info = {}
    obj = info.get("object") if isinstance(info, dict) else {}
    if isinstance(obj, dict) and obj.get("type") == "tag" and obj.get("url"):
        tag = _github_get_json(str(obj["url"]))
        tagger = tag.get("tagger") if isinstance(tag, dict) else {}
        stamp = _iso_z(str((tagger or {}).get("date") or ""))
        if stamp:
            return stamp
    sha = str(obj.get("sha") or ref) if isinstance(obj, dict) else ref
    return _commit_pushed_at(
        _github_get_json(f"{root}/commits/{urllib.parse.quote(sha, safe='')}")
    )


def _github_ref_dates(owner: str, name: str, refs: list[str]) -> dict[str, str]:
    dates: dict[str, str] = {}
    if not refs:
        return dates
    with ThreadPoolExecutor(max_workers=8) as pool:
        pending = {
            pool.submit(_github_one_date, owner, name, ref): ref for ref in refs
        }
        try:
            for future in as_completed(pending, timeout=25):
                ref = pending[future]
                try:
                    stamp = future.result()
                except (OSError, urllib.error.URLError, TimeoutError, json.JSONDecodeError):
                    continue
                if stamp:
                    dates[ref] = stamp
        except TimeoutError:
            pass
    return dates


def ref_pushed_at(url: str, refs: list[str]) -> dict[str, str]:
    local = _local_git_dir(url)
    if local is not None:
        found = _local_ref_dates(local)
        return {name: found[name] for name in refs if name in found}
    slug = github_repo_from_url(url)
    if slug is None:
        return {}
    try:
        return _github_ref_dates(slug[0], slug[1], refs)
    except (OSError, urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        return {}


def list_clusterctl_refs(
    *, url: Optional[str] = None, ignore_host_key: Any = None
) -> dict[str, Any]:
    enabled = resolve_clusterctl_ignore_host_key(ignore_host_key)
    git_url = resolve_url(url)
    with _using_ignore_host_key(enabled):
        result = _run_git(["ls-remote", "--heads", "--tags", "--refs", git_url])
    refs = parse_ls_remote(result.stdout or "")
    return {
        "success": True,
        "gitUrl": git_url,
        "refs": refs,
        "refDates": ref_pushed_at(git_url, refs),
        "ignoreHostKey": enabled,
    }


def _finish_install(path: Path, git_url: str) -> dict[str, Any]:
    if not _looks_like_clusterctl(path):
        raise ClusterctlGitError(
            400,
            f"not an atlas-clusterctl checkout (need ./cluster and clusterctl/__main__.py): {path}",
        )
    save_clusterctl_root_to_ui_config(path, fetched=True)
    return inspect_checkout(url=git_url, dest=str(path))


def _fetch_and_checkout(path: Path, ref: str, *, progress: bool = False) -> None:
    if ref == "main":
        _run_git(["fetch", "--depth", "1", "origin", "main"], cwd=path, progress=progress)
        _run_git(["checkout", "-B", "main", "FETCH_HEAD"], cwd=path)
        return
    spec = f"refs/tags/{ref}:refs/tags/{ref}"
    _run_git(["fetch", "--depth", "1", "origin", spec], cwd=path, progress=progress)
    _run_git(["checkout", "--force", "--detach", f"refs/tags/{ref}"], cwd=path)


def install_clusterctl(
    *,
    url: Optional[str] = None,
    dest: Optional[str] = None,
    ref: Optional[str] = None,
    progress: bool = False,
    ignore_host_key: Any = None,
) -> dict[str, Any]:
    enabled = resolve_clusterctl_ignore_host_key(ignore_host_key)
    git_url = resolve_url(url)
    path = resolve_dest(dest)
    chosen = _validate_ref(ref)
    with _using_ignore_host_key(enabled):
        if path.exists() and not path.is_dir():
            raise ClusterctlGitError(400, f"not a directory: {path}")
        if _is_empty_dir(path):
            path.parent.mkdir(parents=True, exist_ok=True)
            _run_git(
                ["clone", "--depth", "1", "--branch", chosen, git_url, str(path)],
                progress=progress,
            )
            payload = _finish_install(path, git_url)
        elif not _is_git_repo(path):
            raise ClusterctlGitError(400, f"destination is not empty: {path}")
        else:
            origin = _run_git(["remote", "get-url", "origin"], cwd=path).stdout.strip()
            if _normalize_git_url(origin) != _normalize_git_url(git_url):
                raise ClusterctlGitError(400, f"origin is {origin}, not {git_url}")
            _fetch_and_checkout(path, chosen, progress=progress)
            payload = _finish_install(path, git_url)
    payload["ignoreHostKey"] = enabled
    return payload


def clone_clusterctl(
    *,
    url: Optional[str] = None,
    dest: Optional[str] = None,
    ignore_host_key: Any = None,
) -> dict[str, Any]:
    enabled = resolve_clusterctl_ignore_host_key(ignore_host_key)
    git_url = resolve_url(url)
    path = resolve_dest(dest)
    with _using_ignore_host_key(enabled):
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
    payload = inspect_checkout(url=git_url, dest=str(path))
    payload["ignoreHostKey"] = enabled
    return payload


def pull_clusterctl(
    *,
    url: Optional[str] = None,
    dest: Optional[str] = None,
    ignore_host_key: Any = None,
) -> dict[str, Any]:
    enabled = resolve_clusterctl_ignore_host_key(ignore_host_key)
    path = resolve_dest(dest)
    with _using_ignore_host_key(enabled):
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
    payload = inspect_checkout(url=git_url, dest=str(path))
    payload["ignoreHostKey"] = enabled
    return payload


def ensure_clusterctl(
    *,
    url: Optional[str] = None,
    dest: Optional[str] = None,
    ignore_host_key: Any = None,
) -> dict[str, Any]:
    """Clone the newest tag (else main) when the checkout is missing or empty."""
    payload = inspect_checkout(url=url, dest=dest)
    dest_text = str(payload.get("dest") or "")
    if payload.get("configured"):
        print(f"clusterctl: checkout ready at {dest_text}", flush=True)
        return payload
    if payload.get("error"):
        print(f"clusterctl: {payload['error']}", flush=True)
        return payload
    git_url = str(payload.get("gitUrl") or "")
    print(f"clusterctl: downloading {git_url} into {dest_text}", flush=True)
    enabled = resolve_clusterctl_ignore_host_key(ignore_host_key)
    listed = list_clusterctl_refs(url=url or git_url, ignore_host_key=enabled)
    chosen = latest_ref(listed.get("refs") or [])
    print(f"clusterctl: using {chosen}", flush=True)
    result = install_clusterctl(
        url=listed.get("gitUrl"),
        dest=payload.get("dest"),
        ref=chosen,
        progress=True,
        ignore_host_key=enabled,
    )
    if result.get("ok"):
        version = str(result.get("version") or "").splitlines()
        print(f"clusterctl: ready {version[0] if version else dest_text}", flush=True)
    elif result.get("error"):
        print(f"clusterctl: {result['error']}", flush=True)
    return result
