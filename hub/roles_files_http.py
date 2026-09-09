"""Ansible role file tree and GET/PUT content for FastAPI (no Flask)."""
from __future__ import annotations

import logging
from contextvars import ContextVar, Token
from pathlib import Path
from typing import Any, Optional

from executions_store import get_project_dir
from project_kind import ensure_ansible_infra_layout
from sources_http import resolve_project_source
from vault_http import decrypt_content, encrypt_content

logger = logging.getLogger(__name__)

_ATLAS_PACKS_UNSET = object()
_atlas_role_packs: ContextVar[Any] = ContextVar(
    "atlas_role_packs", default=_ATLAS_PACKS_UNSET
)

logger = logging.getLogger(__name__)


class RolesFilesHttpError(Exception):
    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.message = message


def require_project_id(project_id: Optional[str]) -> str:
    pid = (project_id or "").strip()
    if not pid:
        raise RolesFilesHttpError(400, "Project ID is required")
    return pid


def bind_atlas_role_packs(packs: Optional[dict[str, Path]]) -> Token:
    if packs is None:
        return _atlas_role_packs.set(_ATLAS_PACKS_UNSET)
    return _atlas_role_packs.set(packs)


def reset_atlas_role_packs(token: Token) -> None:
    _atlas_role_packs.reset(token)


def atlas_role_packs() -> Optional[dict[str, Path]]:
    value = _atlas_role_packs.get()
    if value is _ATLAS_PACKS_UNSET:
        return None
    return value if isinstance(value, dict) else {}


def _reject_dotdot(*parts: str) -> None:
    for part in parts:
        if part and ".." in part:
            raise RolesFilesHttpError(400, "Invalid path")


def roles_storage_root(project_id: str) -> Path:
    packs = atlas_role_packs()
    if packs is not None:
        raise RolesFilesHttpError(500, "atlas role packs do not use a single storage root")
    try:
        ensure_ansible_infra_layout(get_project_dir(project_id))
        source = resolve_project_source(project_id, "repo")
        return Path(source["rootPath"]) / "roles"
    except Exception as exc:
        logger.error("Failed to resolve Project Storage: %s", exc)
        raise RolesFilesHttpError(
            500, f"Failed to resolve Project Storage: {exc}"
        ) from exc


def _storage_root_relative(project_id: str, storage_root: Path) -> str:
    project_dir = get_project_dir(project_id).resolve()
    try:
        return str(storage_root.resolve().relative_to(project_dir))
    except ValueError:
        return "repo/roles"


def _build_tree(path: Path, parent_id: str = "", base_path: Optional[Path] = None) -> list[dict[str, Any]]:
    if base_path is None:
        base_path = path
    nodes: list[dict[str, Any]] = []
    if not path.exists() or not path.is_dir():
        return nodes
    try:
        for item in sorted(path.iterdir()):
            if not item.is_dir():
                continue
            item_name = item.name
            item_id = f"{parent_id}/{item_name}" if parent_id else item_name
            has_tasks_main = (item / "tasks" / "main.yaml").exists() or (
                item / "tasks" / "main.yml"
            ).exists()
            if not parent_id:
                node_type = "role" if has_tasks_main else "pack"
            else:
                node_type = "role" if has_tasks_main else "folder"
            node = {
                "id": item_id,
                "name": item_name,
                "path": str(item.relative_to(base_path)),
                "type": node_type,
                "children": _build_tree(item, item_id, base_path),
            }
            nodes.append(node)
    except PermissionError:
        logger.warning("Permission denied reading %s", path)
    except OSError as exc:
        logger.error("Error scanning %s: %s", path, exc)
    return nodes


def scan_roles_storage(project_id: str) -> list[dict[str, Any]]:
    packs = atlas_role_packs()
    if packs is not None:
        return _build_atlas_pack_forest(packs)
    roles_storage_path = roles_storage_root(project_id)
    if not roles_storage_path.exists():
        return []
    return _build_tree(roles_storage_path, base_path=roles_storage_path)


def _prefix_role_paths(nodes: list[dict[str, Any]], pack_name: str) -> None:
    for node in nodes:
        rel = str(node.get("path") or "")
        node["path"] = f"{pack_name}/{rel}" if rel else pack_name
        children = node.get("children")
        if isinstance(children, list):
            _prefix_role_paths(children, pack_name)


def _build_atlas_pack_forest(packs: dict[str, Path]) -> list[dict[str, Any]]:
    tree: list[dict[str, Any]] = []
    for name in sorted(packs):
        roles_dir = packs[name]
        children = _build_tree(roles_dir, parent_id=name, base_path=roles_dir)
        _prefix_role_paths(children, name)
        tree.append(
            {
                "id": name,
                "name": name,
                "path": name,
                "type": "pack",
                "children": children,
            }
        )
    return tree


def get_roles_storage(project_id: str) -> dict[str, Any]:
    packs = atlas_role_packs()
    if packs is not None:
        return {
            "success": True,
            "storageRoot": "cluster-playbooks",
            "tree": scan_roles_storage(project_id),
        }
    storage_root = roles_storage_root(project_id)
    return {
        "success": True,
        "storageRoot": _storage_root_relative(project_id, storage_root),
        "tree": scan_roles_storage(project_id),
    }


def _parse_role_path(role_path: str) -> tuple[str, str, list[str]]:
    parts = [part for part in (role_path or "").split("/") if part]
    if not parts:
        raise RolesFilesHttpError(400, f"Invalid role path: {role_path}")
    if len(parts) == 1:
        role_name = parts[0]
        pack_id = role_name
    else:
        pack_id = parts[0]
        role_name = "/".join(parts[1:])
    _reject_dotdot(pack_id, role_name)
    return pack_id, role_name, parts


def _role_dir(roles_storage_path: Path, pack_id: str, role_name: str, first_level: bool) -> Path:
    packs = atlas_role_packs()
    if packs is not None:
        root = packs.get(pack_id)
        if root is None:
            raise RolesFilesHttpError(404, f"Role pack not found: {pack_id}")
        return root / role_name
    if first_level or pack_id == role_name:
        return roles_storage_path / role_name
    return roles_storage_path / pack_id / role_name


def list_role_files(project_id: str, role_path: str) -> dict[str, Any]:
    pack_id, role_name, parts = _parse_role_path(role_path)
    packs = atlas_role_packs()
    if packs is not None:
        role_path_full = _role_dir(Path("."), pack_id, role_name, len(parts) == 1)
    else:
        roles_storage_path = roles_storage_root(project_id)
        role_path_full = _role_dir(roles_storage_path, pack_id, role_name, len(parts) == 1)
    if not role_path_full.exists() or not role_path_full.is_dir():
        raise RolesFilesHttpError(404, "Role not found")
    files: list[dict[str, Any]] = []

    def collect_files(directory: Path, base_path: str = "") -> None:
        try:
            for item in directory.iterdir():
                if item.name.startswith("."):
                    continue
                relative_path = f"{base_path}/{item.name}" if base_path else item.name
                if item.is_file():
                    files.append(
                        {
                            "path": relative_path,
                            "name": item.name,
                            "type": "file",
                            "size": item.stat().st_size,
                        }
                    )
                elif item.is_dir():
                    collect_files(item, relative_path)
        except PermissionError:
            logger.warning("Permission denied accessing %s", directory)

    collect_files(role_path_full)
    return {
        "success": True,
        "files": files,
        "pack": pack_id,
        "role": role_name,
    }


def _resolve_role_file(
    project_id: str, pack_id: str, role_name: str, file_path: str
) -> tuple[Path, Path]:
    _reject_dotdot(pack_id, role_name, file_path)
    packs = atlas_role_packs()
    if packs is not None:
        role_dir = _role_dir(Path("."), pack_id, role_name, pack_id == role_name)
        jail_root = packs.get(pack_id)
        if jail_root is None:
            raise RolesFilesHttpError(404, f"Role pack not found: {pack_id}")
    else:
        roles_storage_path = roles_storage_root(project_id)
        role_dir = _role_dir(roles_storage_path, pack_id, role_name, pack_id == role_name)
        jail_root = role_dir
    file_path_full = role_dir / file_path
    try:
        file_path_full.resolve().relative_to(jail_root.resolve())
        file_path_full.resolve().relative_to(role_dir.resolve())
    except ValueError as exc:
        raise RolesFilesHttpError(400, "File path outside role directory") from exc
    return role_dir, file_path_full


def get_role_file(
    project_id: str,
    pack_id: str,
    role_name: str,
    file_path: str,
    vault_id: Optional[str] = None,
) -> dict[str, Any]:
    _, file_path_full = _resolve_role_file(project_id, pack_id, role_name, file_path)
    if not file_path_full.exists():
        raise RolesFilesHttpError(404, f"File not found: {file_path}")
    if not file_path_full.is_file():
        raise RolesFilesHttpError(400, f"Path is not a file: {file_path}")
    try:
        with open(file_path_full, encoding="utf-8") as fh:
            content = fh.read()
    except UnicodeDecodeError:
        with open(file_path_full, "rb") as fh:
            content = fh.read().decode("utf-8", errors="replace")
    except OSError as exc:
        logger.error("Error reading file %s: %s", file_path_full, exc)
        raise RolesFilesHttpError(500, f"Error reading file: {exc}") from exc
    if vault_id:
        content = decrypt_content(project_id, content, vault_id)
    return {
        "success": True,
        "content": content,
        "path": file_path,
        "pack": pack_id,
        "role": role_name,
    }


def put_role_file(
    project_id: str,
    pack_id: str,
    role_name: str,
    file_path: str,
    body: dict[str, Any],
) -> dict[str, Any]:
    if not body or "content" not in body:
        raise RolesFilesHttpError(400, "Content is required")
    content = body["content"]
    if content is None:
        raise RolesFilesHttpError(400, "Content is required")
    if not isinstance(content, str):
        content = str(content)
    vault_id = body.get("vaultId") or body.get("vault_id")
    if vault_id:
        content = encrypt_content(project_id, content, str(vault_id))
    _, file_path_full = _resolve_role_file(project_id, pack_id, role_name, file_path)
    try:
        file_path_full.parent.mkdir(parents=True, exist_ok=True)
        with open(file_path_full, "w", encoding="utf-8") as fh:
            fh.write(content)
    except OSError as exc:
        logger.error("Error writing file %s: %s", file_path_full, exc)
        raise RolesFilesHttpError(500, f"Error writing file: {exc}") from exc
    return {
        "success": True,
        "path": file_path,
        "pack": pack_id,
        "role": role_name,
    }


def _handbook_root_from_roles_dir(roles_dir: Path) -> Path:
    if roles_dir.name == "roles":
        return roles_dir.parent
    return roles_dir


def handbook_roots(project_id: str) -> list[tuple[str, Path]]:
    packs = atlas_role_packs()
    if packs is not None:
        return [
            (name, _handbook_root_from_roles_dir(Path(roles_dir)))
            for name, roles_dir in packs.items()
        ]
    storage_root = roles_storage_root(project_id)
    root = storage_root.parent if storage_root.name == "roles" else storage_root
    return [("repo", root)]


def _handbook_pack_label(pack_id: str) -> str:
    if pack_id == "repo":
        return "Repository"
    return pack_id


def _is_handbook_rel(rel: str) -> bool:
    n = rel.replace("\\", "/")
    if not n or n.startswith("/") or ".." in n.split("/"):
        return False
    if not n.endswith(".md"):
        return False
    if n == "README.md":
        return True
    return n.startswith("docs/")


def _handbook_title(rel: str) -> str:
    n = rel.replace("\\", "/")
    if n == "README.md":
        return "README"
    if n == "docs/index.md":
        return "Menu"
    name = Path(n).name
    if name.lower() in ("readme.md", "index.md"):
        parent = Path(n).parent.name
        return parent or name[:-3]
    return name[:-3].replace("-", " ").replace("_", " ")


def _scan_handbook_files(root: Path) -> list[dict[str, str]]:
    files: list[dict[str, str]] = []
    readme = root / "README.md"
    if readme.is_file():
        files.append({"path": "README.md", "title": "README"})
    docs_dir = root / "docs"
    if docs_dir.is_dir():
        for item in sorted(docs_dir.rglob("*.md")):
            if not item.is_file():
                continue
            rel = str(item.relative_to(root)).replace("\\", "/")
            if _is_handbook_rel(rel) and rel != "README.md":
                files.append({"path": rel, "title": _handbook_title(rel)})
    return files


def list_role_handbook(project_id: str) -> dict[str, Any]:
    packs: list[dict[str, Any]] = []
    for name, root in handbook_roots(project_id):
        files = _scan_handbook_files(root)
        packs.append(
            {
                "id": name,
                "name": _handbook_pack_label(name),
                "files": files,
            }
        )
    return {"success": True, "packs": packs}


def get_role_handbook_file(project_id: str, pack_id: str, file_path: str) -> dict[str, Any]:
    rel = (file_path or "").replace("\\", "/").lstrip("/")
    _reject_dotdot(pack_id, rel)
    if not _is_handbook_rel(rel):
        raise RolesFilesHttpError(400, "Only README.md and docs/*.md are allowed")
    roots = {name: root for name, root in handbook_roots(project_id)}
    root = roots.get(pack_id)
    if root is None:
        raise RolesFilesHttpError(404, f"Role repo not found: {pack_id}")
    full = (root / rel).resolve()
    base = root.resolve()
    if full != base and not str(full).startswith(str(base) + "/"):
        raise RolesFilesHttpError(400, "Invalid path")
    if not full.is_file():
        raise RolesFilesHttpError(404, f"Document not found: {rel}")
    try:
        markdown = full.read_text(encoding="utf-8")
    except OSError as exc:
        raise RolesFilesHttpError(500, f"Error reading file: {exc}") from exc
    return {
        "success": True,
        "pack": pack_id,
        "path": rel,
        "markdown": markdown,
    }
