"""Checkout path for atlas-proxmox-library (Console → library)."""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Optional

ENV_LIBRARY_ROOT = "ATLAS_PROXMOX_LIBRARY_ROOT"
ENV_UI_CONFIG_PATH = "ATLAS_UI_CONFIG"


def ui_config_path() -> Path:
    override = os.environ.get(ENV_UI_CONFIG_PATH, "").strip()
    if override:
        return Path(override).expanduser()
    return Path.home() / ".config" / "atlas-ui" / "config.json"


def load_ui_config() -> dict[str, Any]:
    path = ui_config_path()
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return raw if isinstance(raw, dict) else {}


def save_ui_config(payload: dict[str, Any]) -> None:
    path = ui_config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def library_root_from_ui_config() -> Optional[Path]:
    value = load_ui_config().get("libraryRoot")
    if not value or not str(value).strip():
        return None
    return Path(str(value).strip()).expanduser()


def library_fetched_at_from_ui_config() -> Optional[str]:
    raw = load_ui_config().get("libraryFetchedAt")
    if not raw or not str(raw).strip():
        return None
    return str(raw).strip()


def library_ignore_host_key_from_ui_config() -> bool:
    return load_ui_config().get("libraryIgnoreHostKey") is True


def save_library_ignore_host_key(enabled: bool) -> None:
    payload = load_ui_config()
    payload["libraryIgnoreHostKey"] = bool(enabled)
    save_ui_config(payload)


def save_library_root(root: Path, *, fetched: bool = False) -> None:
    from datetime import datetime, timezone

    payload = load_ui_config()
    payload["libraryRoot"] = str(Path(root).expanduser().resolve())
    if fetched:
        payload["libraryFetchedAt"] = (
            datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
        )
    save_ui_config(payload)


def looks_like_library(path: Path) -> bool:
    try:
        return (path / "proxmox-library").is_file() and (path / "proxmoxlib" / "__main__.py").is_file()
    except OSError:
        return False


def resolve_library_ignore_host_key(raw: Any = None) -> bool:
    if raw is None:
        return library_ignore_host_key_from_ui_config()
    if isinstance(raw, bool):
        enabled = raw
    else:
        text = str(raw).strip().lower()
        if text in {"1", "true", "yes", "on"}:
            enabled = True
        elif text in {"0", "false", "no", "off"}:
            enabled = False
        else:
            return library_ignore_host_key_from_ui_config()
    save_library_ignore_host_key(enabled)
    return enabled
