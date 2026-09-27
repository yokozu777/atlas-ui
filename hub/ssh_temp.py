"""Ephemeral OpenSSH identity files under DATA_DIR/temp (never system /tmp)."""
from __future__ import annotations

import json
import logging
import os
import re
import shlex
import shutil
import time
import uuid
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator, Optional, Union

from ssh_key_material import decrypt_openssh_private

logger = logging.getLogger(__name__)

DEFAULT_GIT_SSH_COMMAND = (
    "ssh -o IdentitiesOnly=yes -o BatchMode=yes "
    "-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null"
)
DEFAULT_SSH_KEY_SCOPE = "hub"
DEFAULT_SSH_SWEEP_MAX_AGE_SECONDS = 86400
_SCOPE_RE = re.compile(r"^[A-Za-z0-9_-]+$")

PathLike = Union[str, Path]


def resolve_ssh_key_scope(scope: Optional[str] = None) -> str:
    raw = (scope if scope is not None else os.environ.get("ATLAS_SSH_KEY_SCOPE") or DEFAULT_SSH_KEY_SCOPE)
    text = str(raw).strip() or DEFAULT_SSH_KEY_SCOPE
    if not _SCOPE_RE.fullmatch(text):
        logger.warning("Invalid SSH key scope %r; using %s", text, DEFAULT_SSH_KEY_SCOPE)
        return DEFAULT_SSH_KEY_SCOPE
    return text


def worker_ssh_key_scope(worker_id: Optional[str]) -> str:
    cleaned = "".join(
        ch if ch.isalnum() or ch in "-_" else "-" for ch in str(worker_id or "unknown")
    )
    cleaned = re.sub(r"-+", "-", cleaned).strip("-_") or "unknown"
    return f"worker-{cleaned[:80]}"


def apply_worker_ssh_key_scope(worker_id: Optional[str]) -> str:
    scope = worker_ssh_key_scope(worker_id)
    os.environ["ATLAS_SSH_KEY_SCOPE"] = scope
    return scope


def ssh_key_sweep_max_age_seconds(raw: Optional[str] = None) -> int:
    text = (
        raw
        if raw is not None
        else os.environ.get("ATLAS_SSH_SWEEP_MAX_AGE_SECONDS", "")
    )
    text = str(text or "").strip()
    if not text:
        return DEFAULT_SSH_SWEEP_MAX_AGE_SECONDS
    try:
        value = int(text)
    except ValueError:
        return DEFAULT_SSH_SWEEP_MAX_AGE_SECONDS
    return max(1, value)


def ssh_keys_dir(data_dir: Path, scope: Optional[str] = None) -> Path:
    resolved = resolve_ssh_key_scope(scope)
    path = Path(data_dir) / "temp" / "ssh-keys" / resolved
    path.mkdir(parents=True, exist_ok=True)
    try:
        os.chmod(path.parent, 0o700)
        os.chmod(path, 0o700)
    except OSError:
        pass
    return path


def write_ssh_identity(
    private_key: str,
    *,
    data_dir: Path,
    passphrase: str = "",
    scope: Optional[str] = None,
) -> Path:
    pem = decrypt_openssh_private(private_key, passphrase=passphrase)
    path = ssh_keys_dir(data_dir, scope) / f"{uuid.uuid4().hex}.key"
    path.write_text(pem, encoding="utf-8")
    os.chmod(path, 0o600)
    return path


def unlink_ssh_identity(path: Optional[PathLike]) -> None:
    if not path:
        return
    try:
        Path(path).unlink(missing_ok=True)
    except OSError as exc:
        logger.warning("Could not remove SSH identity %s: %s", path, exc)


@contextmanager
def materialize_ssh_identity(
    private_key: str,
    *,
    data_dir: Path,
    passphrase: str = "",
    scope: Optional[str] = None,
) -> Iterator[Path]:
    path = write_ssh_identity(
        private_key, data_dir=data_dir, passphrase=passphrase, scope=scope
    )
    try:
        yield path
    finally:
        unlink_ssh_identity(path)


def build_git_ssh_command(
    key_path: PathLike, *, username: Optional[str] = None
) -> str:
    cmd = (
        f"ssh -i {shlex.quote(str(key_path))} -o IdentitiesOnly=yes "
        "-o BatchMode=yes -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null"
    )
    if username and username != "git":
        cmd += f" -l {shlex.quote(str(username))}"
    return cmd


def _unlink_glob(directory: Path, pattern: str) -> None:
    if not directory.is_dir():
        return
    for path in directory.glob(pattern):
        if path.is_file():
            unlink_ssh_identity(path)


def _file_age_seconds(path: Path, now: float) -> Optional[float]:
    try:
        return now - path.stat().st_mtime
    except OSError:
        return None


def _sweep_identity_files(
    directory: Path, *, max_age_s: Optional[float] = None, now: Optional[float] = None
) -> None:
    if not directory.is_dir():
        return
    stamp = time.time() if now is None else now
    for path in list(directory.iterdir()):
        if not path.is_file():
            continue
        if max_age_s is not None:
            age = _file_age_seconds(path, stamp)
            if age is None or age < max_age_s:
                continue
        unlink_ssh_identity(path)


def sweep_stale_git_ssh(projects_dir: Path) -> None:
    if not projects_dir.is_dir():
        return
    for proj in projects_dir.iterdir():
        root = proj / "tmp" / "git-ssh"
        if not root.is_dir():
            continue
        for exec_dir in list(root.iterdir()):
            if not exec_dir.is_dir():
                continue
            exec_file = proj / "history" / "executions" / f"{exec_dir.name}.json"
            keep = False
            if exec_file.is_file():
                try:
                    data = json.loads(exec_file.read_text(encoding="utf-8"))
                    keep = data.get("status") in {"QUEUED", "RUNNING"}
                except (OSError, json.JSONDecodeError):
                    keep = False
            if not keep:
                shutil.rmtree(exec_dir, ignore_errors=True)
        try:
            if root.is_dir() and not any(root.iterdir()):
                root.rmdir()
        except OSError:
            pass


def sweep_stale_ssh_files(
    data_dir: Path,
    *,
    projects_dir: Optional[Path] = None,
    scope: Optional[str] = None,
    max_age_s: Optional[float] = None,
) -> None:
    """Remove leftover identity files from this process scope. Does not touch system /tmp."""
    root = Path(data_dir)
    own = resolve_ssh_key_scope(scope)
    ttl = float(ssh_key_sweep_max_age_seconds() if max_age_s is None else max_age_s)
    keys = root / "temp" / "ssh-keys"
    now = time.time()
    _sweep_identity_files(keys / own)
    if keys.is_dir():
        for path in list(keys.iterdir()):
            if path.is_file():
                age = _file_age_seconds(path, now)
                if age is not None and age >= ttl:
                    unlink_ssh_identity(path)
                continue
            if path.is_dir() and path.name != own:
                _sweep_identity_files(path, max_age_s=ttl, now=now)
    temp = root / "temp"
    _unlink_glob(temp, "ssh_key_*.pem")
    sweep_stale_git_ssh(Path(projects_dir) if projects_dir is not None else root / "projects")
