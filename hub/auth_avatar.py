"""Self-service avatar files under data/auth/avatars/{user_id}."""
from __future__ import annotations

import re
from pathlib import Path

AVATAR_MAX_BYTES = 512 * 1024
_USER_ID_RE = re.compile(r"^[A-Za-z0-9-]+$")

_PNG = b"\x89PNG\r\n\x1a\n"
_JPEG = b"\xff\xd8\xff"


class AvatarError(Exception):
    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.message = message


def _safe_user_id(user_id: str) -> str:
    value = (user_id or "").strip()
    if not value or not _USER_ID_RE.match(value):
        raise AvatarError(400, "Invalid user id")
    return value


def avatar_dir(data_dir: Path) -> Path:
    path = Path(data_dir) / "auth" / "avatars"
    path.mkdir(parents=True, exist_ok=True)
    return path


def avatar_path(data_dir: Path, user_id: str) -> Path:
    return avatar_dir(data_dir) / _safe_user_id(user_id)


def sniff_media_type(data: bytes) -> str:
    if data.startswith(_PNG):
        return "image/png"
    if data.startswith(_JPEG):
        return "image/jpeg"
    raise AvatarError(400, "Avatar must be a PNG or JPEG image")


def has_avatar(data_dir: Path, user_id: str) -> bool:
    try:
        path = avatar_path(data_dir, user_id)
    except AvatarError:
        return False
    return path.is_file() and path.stat().st_size > 0


def write_avatar(data_dir: Path, user_id: str, data: bytes) -> str:
    if not data:
        raise AvatarError(400, "Avatar is empty")
    if len(data) > AVATAR_MAX_BYTES:
        raise AvatarError(400, "Avatar must be 512KB or smaller")
    media = sniff_media_type(data)
    dest = avatar_path(data_dir, user_id)
    tmp = dest.with_suffix(".tmp")
    tmp.write_bytes(data)
    tmp.replace(dest)
    return media


def read_avatar(data_dir: Path, user_id: str) -> tuple[Path, str] | None:
    path = avatar_path(data_dir, user_id)
    if not path.is_file() or path.stat().st_size == 0:
        return None
    media = sniff_media_type(path.read_bytes()[:16])
    return path, media


def delete_avatar(data_dir: Path, user_id: str) -> bool:
    path = avatar_path(data_dir, user_id)
    if not path.is_file():
        return False
    path.unlink()
    return True
