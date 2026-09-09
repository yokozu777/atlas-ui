"""Lab/bootstrap secrets: JWT and encryption key files under DATA_DIR/auth."""
from __future__ import annotations

import os
import secrets
from pathlib import Path


def auth_dir(data_dir: Path) -> Path:
    path = Path(data_dir) / "auth"
    path.mkdir(parents=True, exist_ok=True)
    return path


def jwt_secret_path(data_dir: Path) -> Path:
    return auth_dir(data_dir) / "jwt_secret"


def encryption_key_path(data_dir: Path) -> Path:
    return auth_dir(data_dir) / "encryption_key"


def _read_secret_file(path: Path) -> str:
    if not path.exists():
        return ""
    try:
        return path.read_text(encoding="utf-8").strip()
    except OSError:
        return ""


def _write_secret_file(path: Path, value: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(value, encoding="utf-8")
    os.chmod(path, 0o600)


def resolve_jwt_secret(data_dir: Path) -> str:
    env = os.environ.get("JWT_SECRET_KEY", "").strip()
    if env:
        return env
    stored = _read_secret_file(jwt_secret_path(data_dir))
    if stored:
        return stored
    raise RuntimeError(
        "JWT_SECRET_KEY is not set and data/auth/jwt_secret is missing. "
        "Set JWT_SECRET_KEY or start the hub with hub/start.sh."
    )


def resolve_encryption_key(data_dir: Path) -> str:
    env = os.environ.get("GLOBAL_SECRETS_ENCRYPTION_KEY", "").strip()
    if env:
        return env
    stored = _read_secret_file(encryption_key_path(data_dir))
    if stored:
        return stored
    legacy = Path(data_dir) / "global" / "secrets" / ".encryption_key"
    stored = _read_secret_file(legacy)
    if stored:
        return stored
    raise RuntimeError(
        "GLOBAL_SECRETS_ENCRYPTION_KEY is not set and no encryption key file was found. "
        "Set the env var or start the hub with hub/start.sh."
    )


def ensure_lab_secrets(data_dir: Path) -> None:
    """Create jwt/encryption files once when env is unset (lab scripts / Docker)."""
    if not os.environ.get("JWT_SECRET_KEY", "").strip():
        path = jwt_secret_path(data_dir)
        if not _read_secret_file(path):
            _write_secret_file(path, secrets.token_hex(32))
        os.environ["JWT_SECRET_KEY"] = _read_secret_file(path)
    if not os.environ.get("GLOBAL_SECRETS_ENCRYPTION_KEY", "").strip():
        path = encryption_key_path(data_dir)
        stored = _read_secret_file(path)
        if not stored:
            legacy = Path(data_dir) / "global" / "secrets" / ".encryption_key"
            stored = _read_secret_file(legacy)
            if stored:
                _write_secret_file(path, stored)
            else:
                _write_secret_file(path, secrets.token_urlsafe(32))
                stored = _read_secret_file(path)
        os.environ["GLOBAL_SECRETS_ENCRYPTION_KEY"] = stored


if __name__ == "__main__":
    root = Path(os.environ.get("DATA_DIR") or (Path(__file__).resolve().parent.parent / "data"))
    root.mkdir(parents=True, exist_ok=True)
    ensure_lab_secrets(root)
    print(f"lab secrets ready under {root / 'auth'}")
