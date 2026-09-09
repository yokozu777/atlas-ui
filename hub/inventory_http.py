"""Inventory file helpers for FastAPI (same DATA_DIR layout as Flask)."""
from __future__ import annotations

import io
import json
import logging
import os
import re
import time
import zipfile
from contextvars import ContextVar, Token
from pathlib import Path
from typing import Any, Optional

import yaml

from executions_store import get_project_dir
from project_kind import ensure_ansible_infra_layout

logger = logging.getLogger(__name__)

HOST_NAME_RE = re.compile(r"^[a-zA-Z0-9._-]+$")
INVENTORY_NAMES = (
    "invent.yaml",
    "invent.yml",
    "inventory.yaml",
    "inventory.yml",
    "hosts.yaml",
    "hosts.yml",
    "hosts",
    "hosts.ini",
)
EXPORT_INVENTORY_NAMES = (
    "invent.yaml",
    "invent.yml",
    "inventory.yaml",
    "inventory.yml",
    "hosts.yaml",
    "hosts.yml",
    "hosts",
    "hosts.ini",
)
SKIP_INVENTORY_NAMES = frozenset({"cluster.yaml", "cluster.yml"})

_inventory_leaf: ContextVar[Optional[Path]] = ContextVar(
    "atlas_inventory_leaf", default=None
)


class InventoryHttpError(Exception):
    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.message = message


def bind_atlas_inventory(leaf: Optional[Path]) -> Token:
    return _inventory_leaf.set(leaf)


def reset_atlas_inventory(token: Token) -> None:
    _inventory_leaf.reset(token)


def inventory_repo_root(project_id: str) -> Path:
    leaf = _inventory_leaf.get()
    if leaf is not None:
        return leaf
    return get_project_dir(project_id) / "repo"


def inventories_dir(project_id: str) -> Path:
    leaf = _inventory_leaf.get()
    if leaf is not None:
        return leaf
    project_dir = get_project_dir(project_id)
    ensure_ansible_infra_layout(project_dir)
    return project_dir / "repo" / "inventories"


def group_vars_dir(project_id: str) -> Path:
    return inventories_dir(project_id) / "group_vars"


def host_vars_dir(project_id: str) -> Path:
    return inventories_dir(project_id) / "host_vars"


def secrets_dir(project_id: str) -> Path:
    path = get_project_dir(project_id) / "secrets"
    path.mkdir(parents=True, exist_ok=True)
    return path


def require_project_id(project_id: Optional[str]) -> str:
    pid = (project_id or "").strip()
    if not pid:
        raise InventoryHttpError(400, "Project ID is required")
    return pid


def _is_under(path: Path, root: Path) -> bool:
    try:
        path.resolve().relative_to(root.resolve())
        return True
    except ValueError:
        return False


def resolve_inventory_file(project_id: str, file_param: str) -> Path:
    inventories = inventories_dir(project_id)
    repo = inventory_repo_root(project_id)
    param = (file_param or "inventory.yml").strip()
    if param.startswith("inventories/"):
        rel = param[len("inventories/") :]
        candidate = inventories / rel
        if candidate.exists():
            return candidate
        direct = repo / param
        if direct.exists():
            return direct
        return candidate
    if param in INVENTORY_NAMES:
        in_inv = inventories / param
        if in_inv.exists():
            return in_inv
        in_repo = repo / param
        if in_repo.exists():
            return in_repo
        return in_inv
    if "/" in param:
        nested = inventories / param
        if nested.exists():
            return nested
        return nested
    named = inventories / param
    if named.exists():
        return named
    return named


def list_inventory_files(project_id: str) -> list[dict[str, Any]]:
    inventories = inventories_dir(project_id)
    repo = inventory_repo_root(project_id)
    live_leaf = _inventory_leaf.get() is not None
    files: list[dict[str, Any]] = []
    if inventories.exists():
        for inv_file in inventories.rglob("*"):
            if not inv_file.is_file():
                continue
            if inv_file.name in SKIP_INVENTORY_NAMES:
                continue
            if not (
                inv_file.suffix in (".yml", ".yaml", ".ini")
                or inv_file.name in ("hosts", "hosts.ini")
            ):
                continue
            rel = inv_file.relative_to(inventories)
            if "host_vars" in rel.parts or "group_vars" in rel.parts:
                continue
            try:
                repo_rel = inv_file.relative_to(repo)
            except ValueError:
                repo_rel = rel
            files.append(
                {
                    "name": str(rel),
                    "path": str(repo_rel),
                    "env": rel.parts[0] if len(rel.parts) > 1 else None,
                }
            )
            if not live_leaf:
                inv_file.parent.joinpath("group_vars").mkdir(parents=True, exist_ok=True)
                inv_file.parent.joinpath("host_vars").mkdir(parents=True, exist_ok=True)
    for name in INVENTORY_NAMES:
        root_inv = repo / name
        if root_inv.is_file() and not any(
            item.get("path") == name or str(item.get("path", "")).endswith("/" + name)
            for item in files
        ):
            files.append({"name": name, "path": name, "env": None})
    files.sort(key=lambda item: item["path"])
    return files


def read_inventory_file(project_id: str, file_param: str) -> dict[str, Any]:
    path = resolve_inventory_file(project_id, file_param)
    if not path.exists() or not path.is_file():
        raise InventoryHttpError(404, f"File {file_param} not found in Project Storage")
    content = path.read_text(encoding="utf-8")
    return {"success": True, "content": content, "file": file_param}


def save_inventory_file(project_id: str, file_param: str, content: str) -> dict[str, Any]:
    if not content:
        raise InventoryHttpError(400, "File content cannot be empty")
    try:
        yaml.safe_load(content)
    except yaml.YAMLError as exc:
        raise InventoryHttpError(400, f"YAML validation error: {exc}") from exc
    path = resolve_inventory_file(project_id, file_param or "inventories/inventory.yml")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content if content.endswith("\n") else content + "\n", encoding="utf-8")
    path.parent.joinpath("group_vars").mkdir(parents=True, exist_ok=True)
    path.parent.joinpath("host_vars").mkdir(parents=True, exist_ok=True)
    return {"success": True, "message": f"File {file_param} saved"}


def _load_yaml(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    return data if isinstance(data, dict) else {}


def _dump_yaml(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        yaml.safe_dump(data, default_flow_style=False, allow_unicode=True, sort_keys=False),
        encoding="utf-8",
    )


def _walk_hosts(node: Any, acc: list[str]) -> None:
    if not isinstance(node, dict):
        return
    hosts = node.get("hosts")
    if isinstance(hosts, dict):
        acc.extend(str(name) for name in hosts.keys())
    elif isinstance(hosts, list):
        for item in hosts:
            if isinstance(item, str):
                acc.append(item)
            elif isinstance(item, dict):
                acc.extend(str(name) for name in item.keys())
    children = node.get("children")
    if isinstance(children, dict):
        for child in children.values():
            _walk_hosts(child, acc)


def _walk_groups(node: Any, acc: dict[str, Any], parent: str) -> None:
    if not isinstance(node, dict):
        return
    hosts: list[str] = []
    raw_hosts = node.get("hosts")
    if isinstance(raw_hosts, dict):
        hosts = [str(name) for name in raw_hosts.keys()]
    elif isinstance(raw_hosts, list):
        hosts = [str(item) if not isinstance(item, dict) else next(iter(item)) for item in raw_hosts]
    child_names: list[str] = []
    children = node.get("children")
    if isinstance(children, dict):
        child_names = list(children.keys())
        for name, child in children.items():
            _walk_groups(child, acc, str(name))
    if parent not in acc:
        acc[parent] = {"hosts": hosts, "children": child_names}
    else:
        existing = acc[parent]
        existing["hosts"] = list(dict.fromkeys(existing.get("hosts", []) + hosts))
        existing["children"] = list(dict.fromkeys(existing.get("children", []) + child_names))


def resolve_selected_inventory_paths(
    project_id: str, selected: Optional[list[str]]
) -> list[str]:
    inventories = inventories_dir(project_id)
    paths: list[str] = []
    if selected:
        for param in selected:
            path = resolve_inventory_file(project_id, param)
            if path.exists():
                paths.append(str(path))
        return paths
    if inventories.exists():
        for name in INVENTORY_NAMES:
            candidate = inventories / name
            if candidate.is_file():
                paths.append(str(candidate))
        if paths:
            return paths
        for inv_file in inventories.rglob("*"):
            if inv_file.is_file() and inv_file.name in INVENTORY_NAMES:
                rel = inv_file.relative_to(inventories)
                if "group_vars" not in rel.parts and "host_vars" not in rel.parts:
                    if str(inv_file) not in paths:
                        paths.append(str(inv_file))
    return paths


def list_hosts(project_id: str, selected: Optional[list[str]] = None) -> list[str]:
    names: list[str] = []
    seen: set[str] = set()
    for path_str in resolve_selected_inventory_paths(project_id, selected):
        data = _load_yaml(Path(path_str))
        found: list[str] = []
        if "all" in data and isinstance(data["all"], dict):
            _walk_hosts(data["all"], found)
        else:
            _walk_hosts(data, found)
        for name in found:
            if name not in seen:
                seen.add(name)
                names.append(name)
    return names


def list_groups(project_id: str, selected: Optional[list[str]] = None) -> dict[str, Any]:
    groups: dict[str, Any] = {}
    for path_str in resolve_selected_inventory_paths(project_id, selected):
        data = _load_yaml(Path(path_str))
        if "all" in data and isinstance(data["all"], dict):
            _walk_groups(data["all"], groups, "all")
        else:
            _walk_groups(data, groups, "root")
    if "all" in groups and not groups["all"].get("hosts") and not groups["all"].get("vars"):
        del groups["all"]
    return groups


def add_host(
    project_id: str,
    host_name: str,
    inventory_file: str = "inventory.yml",
    group_name: str = "all",
    host_ip: str = "",
    vars_file: str = "",
) -> dict[str, Any]:
    host_name = host_name.strip()
    if not host_name:
        raise InventoryHttpError(400, "Host name not specified")
    if not HOST_NAME_RE.match(host_name):
        raise InventoryHttpError(400, "Host name contains invalid characters")
    path = resolve_inventory_file(project_id, inventory_file)
    inventory_data = _load_yaml(path) if path.exists() else {"all": {}}
    if "all" not in inventory_data:
        inventory_data["all"] = {}
    vars_file = _normalize_vars_file(vars_file, host_name)
    entry: dict[str, Any] = {"vars_file": vars_file}
    if host_ip:
        entry["ansible_host"] = host_ip
    if group_name == "all":
        hosts = inventory_data["all"].setdefault("hosts", {})
        if isinstance(hosts, dict):
            if host_name in hosts:
                raise InventoryHttpError(400, f"Host {host_name} already exists in inventory")
            hosts[host_name] = entry
        elif isinstance(hosts, list):
            if host_name in hosts:
                raise InventoryHttpError(400, f"Host {host_name} already exists in inventory")
            hosts.append(host_name)
    else:
        children = inventory_data["all"].setdefault("children", {})
        group_data = children.setdefault(group_name, {"hosts": {}})
        hosts = group_data.setdefault("hosts", {})
        if isinstance(hosts, dict):
            if host_name in hosts:
                raise InventoryHttpError(
                    400, f"Host {host_name} already exists in group {group_name}"
                )
            hosts[host_name] = entry
        elif isinstance(hosts, list):
            if host_name in hosts:
                raise InventoryHttpError(
                    400, f"Host {host_name} already exists in group {group_name}"
                )
            hosts.append(host_name)
    _dump_yaml(path, inventory_data)
    _ensure_vars_file(project_id, vars_file, inventory_file)
    return {
        "success": True,
        "message": f"Host {host_name} successfully added to group {group_name}",
        "host_name": host_name,
        "group_name": group_name,
        "inventory_file": inventory_file,
        "vars_file": vars_file,
    }


def add_group(
    project_id: str,
    group_name: str,
    inventory_file: str = "",
    hosts: Optional[list[Any]] = None,
) -> dict[str, Any]:
    group_name = group_name.strip()
    if not group_name:
        raise InventoryHttpError(400, "Group name is required")
    if not group_name.replace("_", "").replace("-", "").isalnum():
        raise InventoryHttpError(
            400,
            "Group name can only contain letters, numbers, underscores and hyphens",
        )
    path = resolve_inventory_file(project_id, inventory_file or "inventory.yml")
    inventory_data = _load_yaml(path) if path.exists() else {"all": {}}
    inventory_data.setdefault("all", {}).setdefault("children", {})
    if group_name in inventory_data["all"]["children"]:
        raise InventoryHttpError(400, f"Group {group_name} already exists")
    group_data: dict[str, Any] = {}
    if hosts:
        group_data["hosts"] = {}
        for host in hosts:
            if isinstance(host, str) and host.strip():
                group_data["hosts"][host.strip()] = {
                    "vars_file": f"host_vars/{host.strip()}.yml"
                }
    inventory_data["all"]["children"][group_name] = group_data
    _dump_yaml(path, inventory_data)
    return {"success": True, "group_name": group_name}


def get_group_vars(project_id: str, group_name: str) -> dict[str, Any]:
    path = group_vars_dir(project_id) / f"{Path(group_name).name}.yml"
    if not path.exists():
        return {"success": True, "vars": {}}
    try:
        content = path.read_text(encoding="utf-8")
        return {"success": True, "content": content, "vars": _load_yaml(path)}
    except OSError as exc:
        raise InventoryHttpError(500, str(exc)) from exc


def put_group_vars(project_id: str, group_name: str, content: Any) -> dict[str, Any]:
    directory = group_vars_dir(project_id)
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"{Path(group_name).name}.yml"
    if isinstance(content, str):
        path.write_text(content if content.endswith("\n") else content + "\n", encoding="utf-8")
    else:
        _dump_yaml(path, content or {})
    return {"success": True}


def _normalize_vars_file(vars_file: str, host_name: str) -> str:
    raw = (vars_file or "").strip().replace("\\", "/")
    if not raw:
        return f"host_vars/{host_name}.yml"
    if raw.startswith("/"):
        raise InventoryHttpError(400, "Vars file must be a relative path")
    parts = Path(raw).parts
    if ".." in parts:
        raise InventoryHttpError(400, "Vars file path is invalid")
    if Path(raw).suffix not in (".yml", ".yaml"):
        raise InventoryHttpError(400, "Vars file must be YAML")
    return raw


def _ensure_vars_file(project_id: str, vars_file: str, inventory_file: str = "") -> Path:
    repo = inventory_repo_root(project_id)
    rel = Path(vars_file)
    if rel.parts and rel.parts[0] == "inventories":
        dest = repo / rel
    elif inventory_file:
        dest = resolve_inventory_file(project_id, inventory_file).parent / rel
    else:
        dest = inventories_dir(project_id) / rel
    if dest.exists():
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    if not dest.exists():
        dest.write_text("{}\n", encoding="utf-8")
    return dest


def list_vars_files(project_id: str, kind: str) -> list[dict[str, str]]:
    dir_name = "group_vars" if kind == "group" else "host_vars"
    if kind not in ("group", "host"):
        raise InventoryHttpError(400, "kind must be group or host")
    repo = inventory_repo_root(project_id)
    files: list[dict[str, str]] = []
    if not repo.exists():
        return files
    for path in sorted(repo.rglob("*"), key=lambda item: str(item).lower()):
        if not path.is_file() or path.suffix not in (".yml", ".yaml"):
            continue
        try:
            rel = path.relative_to(repo)
        except ValueError:
            continue
        if ".git" in rel.parts or dir_name not in rel.parts:
            continue
        files.append(
            {
                "name": path.name,
                "path": rel.as_posix(),
                "stem": path.stem,
            }
        )
    return files


def resolve_vars_file(project_id: str, rel_path: str) -> Path:
    repo = inventory_repo_root(project_id).resolve()
    param = (rel_path or "").strip().replace("\\", "/").lstrip("/")
    if param.startswith("repo/"):
        param = param[len("repo/") :]
    if not param:
        raise InventoryHttpError(400, "path is required")
    if ".." in Path(param).parts:
        raise InventoryHttpError(400, "Path is invalid")
    candidate = (repo / param).resolve()
    if not _is_under(candidate, repo):
        raise InventoryHttpError(400, "Path outside project repo")
    parts = candidate.relative_to(repo).parts
    if "group_vars" not in parts and "host_vars" not in parts:
        raise InventoryHttpError(400, "Path must be within group_vars or host_vars")
    if candidate.suffix not in (".yml", ".yaml"):
        raise InventoryHttpError(400, "Only YAML vars files are allowed")
    return candidate


def get_vars_file(project_id: str, rel_path: str) -> dict[str, Any]:
    path = resolve_vars_file(project_id, rel_path)
    if not path.exists() or not path.is_file():
        return {"success": True, "content": "", "path": rel_path, "vars": {}}
    content = path.read_text(encoding="utf-8")
    return {
        "success": True,
        "content": content,
        "path": Path(rel_path).as_posix() if rel_path else rel_path,
        "vars": _load_yaml(path),
    }


def put_vars_file(project_id: str, rel_path: str, content: Any) -> dict[str, Any]:
    path = resolve_vars_file(project_id, rel_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    if isinstance(content, str):
        text = content if content.endswith("\n") else content + "\n"
        try:
            yaml.safe_load(text)
        except yaml.YAMLError as exc:
            raise InventoryHttpError(400, f"YAML validation error: {exc}") from exc
        path.write_text(text, encoding="utf-8")
    else:
        _dump_yaml(path, content or {})
    return {"success": True, "path": path.relative_to(inventory_repo_root(project_id)).as_posix()}


def delete_vars_file(project_id: str, rel_path: str) -> dict[str, Any]:
    path = resolve_vars_file(project_id, rel_path)
    if not path.exists() or not path.is_file():
        raise InventoryHttpError(404, f"File {rel_path} not found")
    path.unlink()
    return {"success": True, "message": f"File {rel_path} deleted"}


def _read_vars_dir(directory: Path) -> dict[str, str]:
    result: dict[str, str] = {}
    if not directory.exists() or not directory.is_dir():
        return result
    try:
        entries = sorted(directory.iterdir(), key=lambda p: p.name.lower())
    except OSError as exc:
        raise InventoryHttpError(500, str(exc)) from exc
    for path in entries:
        if not path.is_file() or path.suffix not in (".yml", ".yaml"):
            continue
        try:
            result[path.stem] = path.read_text(encoding="utf-8")
        except OSError as exc:
            raise InventoryHttpError(500, str(exc)) from exc
    return result


def _read_vars_tree(project_id: str, kind: str) -> dict[str, str]:
    result: dict[str, str] = {}
    repo = inventory_repo_root(project_id)
    for item in list_vars_files(project_id, kind):
        path = repo / item["path"]
        try:
            result[item["stem"]] = path.read_text(encoding="utf-8")
        except OSError as exc:
            raise InventoryHttpError(500, str(exc)) from exc
    return result


def list_preview_vars(project_id: str) -> dict[str, Any]:
    group_vars = _read_vars_tree(project_id, "group")
    host_vars = _read_vars_tree(project_id, "host")
    if not group_vars:
        group_vars = _read_vars_dir(group_vars_dir(project_id))
    if not host_vars:
        host_vars = _read_vars_dir(host_vars_dir(project_id))
    return {
        "success": True,
        "group_vars": group_vars,
        "host_vars": host_vars,
    }


def delete_inventory_file(project_id: str, file_param: str) -> dict[str, Any]:
    path = resolve_inventory_file(project_id, file_param)
    repo = inventory_repo_root(project_id)
    if not _is_under(path, repo):
        raise InventoryHttpError(400, "Path outside project repo")
    if not path.exists() or not path.is_file():
        raise InventoryHttpError(404, f"File {file_param} not found")
    path.unlink()
    return {"success": True, "message": f"File {file_param} deleted"}


def _find_group_node(node: Any, group_name: str) -> Optional[dict[str, Any]]:
    if not isinstance(node, dict):
        return None
    children = node.get("children")
    if isinstance(children, dict):
        child = children.get(group_name)
        if isinstance(child, dict):
            return child
        for nested in children.values():
            found = _find_group_node(nested, group_name)
            if found is not None:
                return found
    return None


def _pop_group(node: Any, group_name: str) -> bool:
    if not isinstance(node, dict):
        return False
    children = node.get("children")
    if isinstance(children, dict):
        if group_name in children:
            del children[group_name]
            return True
        for nested in children.values():
            if _pop_group(nested, group_name):
                return True
    return False


def _ensure_group_node(inventory_data: dict[str, Any], group_name: str) -> dict[str, Any]:
    all_node = inventory_data.setdefault("all", {})
    if not isinstance(all_node, dict):
        all_node = {}
        inventory_data["all"] = all_node
    if group_name == "all":
        return all_node
    found = _find_group_node(all_node, group_name)
    if found is not None:
        return found
    children = all_node.setdefault("children", {})
    if not isinstance(children, dict):
        children = {}
        all_node["children"] = children
    children[group_name] = {"hosts": {}}
    return children[group_name]


def delete_group(
    project_id: str, group_name: str, inventory_file: str = ""
) -> dict[str, Any]:
    group_name = group_name.strip()
    if not group_name:
        raise InventoryHttpError(400, "Group name is required")
    if group_name in ("all", "ungrouped"):
        raise InventoryHttpError(400, f"Group {group_name} cannot be deleted")
    path = resolve_inventory_file(project_id, inventory_file or "inventory.yml")
    if not path.exists():
        raise InventoryHttpError(404, "Inventory file not found")
    inventory_data = _load_yaml(path)
    all_node = inventory_data.get("all")
    if not _pop_group(all_node, group_name):
        raise InventoryHttpError(404, f"Group {group_name} not found")
    _dump_yaml(path, inventory_data)
    return {"success": True, "group_name": group_name}


def assign_host_to_group(
    project_id: str,
    host_name: str,
    group_name: str,
    inventory_file: str = "",
) -> dict[str, Any]:
    host_name = host_name.strip()
    group_name = (group_name or "all").strip() or "all"
    if not host_name:
        raise InventoryHttpError(400, "Host name not specified")
    if not HOST_NAME_RE.match(host_name):
        raise InventoryHttpError(400, "Host name contains invalid characters")
    path = resolve_inventory_file(project_id, inventory_file or "inventory.yml")
    inventory_data = _load_yaml(path) if path.exists() else {"all": {}}
    node = _ensure_group_node(inventory_data, group_name)
    hosts = node.get("hosts")
    if isinstance(hosts, list):
        if host_name not in hosts:
            hosts.append(host_name)
    elif isinstance(hosts, dict):
        if host_name not in hosts:
            hosts[host_name] = {"vars_file": f"host_vars/{host_name}.yml"}
    else:
        node["hosts"] = {host_name: {"vars_file": f"host_vars/{host_name}.yml"}}
    _dump_yaml(path, inventory_data)
    return {
        "success": True,
        "host_name": host_name,
        "group_name": group_name,
    }


def set_group_hosts(
    project_id: str,
    group_name: str,
    hosts: Optional[list[Any]] = None,
    inventory_file: str = "",
) -> dict[str, Any]:
    group_name = group_name.strip()
    if not group_name:
        raise InventoryHttpError(400, "Group name is required")
    path = resolve_inventory_file(project_id, inventory_file or "inventory.yml")
    inventory_data = _load_yaml(path) if path.exists() else {"all": {}}
    node = _ensure_group_node(inventory_data, group_name)
    existing = node.get("hosts")
    existing_map: dict[str, Any] = {}
    if isinstance(existing, dict):
        existing_map = existing
    elif isinstance(existing, list):
        existing_map = {str(item): {} for item in existing if item}
    new_hosts: dict[str, Any] = {}
    for item in hosts or []:
        name = str(item).strip()
        if not name:
            continue
        new_hosts[name] = existing_map.get(name) or {"vars_file": f"host_vars/{name}.yml"}
    node["hosts"] = new_hosts
    _dump_yaml(path, inventory_data)
    return {"success": True, "group_name": group_name, "hosts": list(new_hosts.keys())}


def resolve_host_vars_file(
    project_id: str, host_name: str, inventory_file: str = ""
) -> Path:
    name = Path(host_name).name
    for suffix in (".yml", ".yaml"):
        direct = host_vars_dir(project_id) / f"{name}{suffix}"
        if direct.exists():
            return direct
    for item in list_vars_files(project_id, "host"):
        if item["stem"] == name:
            return inventory_repo_root(project_id) / item["path"]
    if inventory_file:
        return (
            resolve_inventory_file(project_id, inventory_file).parent
            / "host_vars"
            / f"{name}.yml"
        )
    return host_vars_dir(project_id) / f"{name}.yml"


def _ansible_config_selection_file(project_id: str) -> Path:
    return get_project_dir(project_id) / "data" / "ansible-config-selection.json"


def _read_selected_ansible_config(project_id: str) -> Optional[str]:
    selection_file = _ansible_config_selection_file(project_id)
    if not selection_file.exists():
        return None
    try:
        return json.loads(selection_file.read_text(encoding="utf-8")).get("selected_config")
    except (OSError, json.JSONDecodeError):
        return None


def resolve_ansible_config_path(project_id: str, file_param: str) -> Path:
    project_dir = get_project_dir(project_id).resolve()
    param = (file_param or "ansible-config/ansible.cfg").strip().replace("\\", "/").lstrip("/")
    if ".." in Path(param).parts:
        raise InventoryHttpError(400, "Invalid ansible config path")
    if param.startswith("ansible-config/"):
        candidate = (project_dir / param).resolve()
    elif param == "repo/ansible.cfg":
        candidate = (project_dir / "repo" / "ansible.cfg").resolve()
    elif param == "ansible.cfg":
        root = project_dir / "ansible.cfg"
        repo_cfg = project_dir / "repo" / "ansible.cfg"
        candidate = (root if root.exists() else repo_cfg).resolve()
    elif param.endswith(".cfg") and "/" not in param:
        candidate = (project_dir / "ansible-config" / param).resolve()
    else:
        raise InventoryHttpError(400, "Invalid ansible config path")
    if not _is_under(candidate, project_dir):
        raise InventoryHttpError(400, "Path outside project")
    if candidate.suffix != ".cfg":
        raise InventoryHttpError(400, "Only .cfg files are allowed")
    return candidate


def list_ansible_config(project_id: str) -> dict[str, Any]:
    project_dir = get_project_dir(project_id)
    ansible_config_dir = project_dir / "ansible-config"
    ansible_config_dir.mkdir(parents=True, exist_ok=True)
    config_files: list[dict[str, Any]] = []
    seen: set[str] = set()

    def add_file(path: Path, rel: str, is_primary: bool = False) -> None:
        if rel in seen:
            return
        seen.add(rel)
        config_files.append({"name": path.name, "path": rel, "is_primary": is_primary})

    root_cfg = project_dir / "ansible.cfg"
    if root_cfg.is_file():
        add_file(root_cfg, "ansible.cfg", True)
    repo_cfg = project_dir / "repo" / "ansible.cfg"
    if repo_cfg.is_file():
        add_file(repo_cfg, "repo/ansible.cfg", not seen)
    for file_path in sorted(ansible_config_dir.glob("*.cfg")):
        add_file(
            file_path,
            f"ansible-config/{file_path.name}",
            file_path.name == "ansible.cfg" and not seen,
        )
    if not config_files:
        config_files.append(
            {
                "name": "ansible.cfg",
                "path": "ansible-config/ansible.cfg",
                "is_primary": True,
            }
        )
    selected_config = _read_selected_ansible_config(project_id)
    if not selected_config:
        selected_config = next(
            (item["path"] for item in config_files if item.get("is_primary")),
            config_files[0]["path"],
        )
    return {"success": True, "files": config_files, "selected_config": selected_config}


def get_ansible_config(project_id: str, file_param: str) -> dict[str, Any]:
    path = resolve_ansible_config_path(project_id, file_param)
    if not path.exists() or not path.is_file():
        return {"success": True, "content": "", "path": file_param}
    return {
        "success": True,
        "content": path.read_text(encoding="utf-8"),
        "path": file_param,
    }


def save_ansible_config(project_id: str, file_param: str, content: str) -> dict[str, Any]:
    path = resolve_ansible_config_path(project_id, file_param)
    path.parent.mkdir(parents=True, exist_ok=True)
    text = content if content.endswith("\n") else content + "\n"
    path.write_text(text, encoding="utf-8")
    return {"success": True, "path": file_param, "message": f"File {file_param} saved"}


def select_ansible_config(project_id: str, file_param: str) -> dict[str, Any]:
    path = resolve_ansible_config_path(project_id, file_param)
    if not path.exists() and file_param not in ("ansible-config/ansible.cfg", "ansible.cfg"):
        raise InventoryHttpError(404, f"Config {file_param} not found")
    selection_file = _ansible_config_selection_file(project_id)
    selection_file.parent.mkdir(parents=True, exist_ok=True)
    selection_file.write_text(
        json.dumps({"selected_config": file_param}, indent=2),
        encoding="utf-8",
    )
    return {"success": True, "selected_config": file_param}


def delete_ansible_config(project_id: str, file_param: str) -> dict[str, Any]:
    path = resolve_ansible_config_path(project_id, file_param)
    if not path.exists() or not path.is_file():
        raise InventoryHttpError(404, f"Config {file_param} not found")
    path.unlink()
    return {"success": True, "message": f"File {file_param} deleted"}


def _secret_file(project_id: str, secret_name: str) -> Path:
    ssh_keys = secrets_dir(project_id) / "ssh_keys" / f"{secret_name}.json"
    if ssh_keys.exists():
        return ssh_keys
    return secrets_dir(project_id) / f"{secret_name}.json"


def set_host_connection_secret(
    project_id: str,
    host_name: str,
    secret_name: Optional[str],
    ansible_user: str = "root",
    port: str = "22",
    inventory_file: str = "",
) -> dict[str, Any]:
    host_file = resolve_host_vars_file(project_id, host_name, inventory_file)
    host_vars = _load_yaml(host_file) if host_file.exists() else {}
    for key in (
        "ansible_host",
        "ansible_user",
        "ansible_port",
        "ansible_ssh_private_key_file",
        "ansible_password",
    ):
        host_vars.pop(key, None)
    if secret_name:
        secret_path = _secret_file(project_id, secret_name)
        if not secret_path.exists():
            raise InventoryHttpError(404, f"Secret {secret_name} not found")
        secret_data = json.loads(secret_path.read_text(encoding="utf-8"))
        secret_username = str(secret_data.get("username") or "").strip()
        if secret_username:
            ansible_user = secret_username
        host_vars["ansible_host"] = host_name
        host_vars["ansible_user"] = ansible_user
        host_vars["ansible_port"] = int(port) if port else 22
        secret_type = secret_data.get("type")
        if secret_type == "ssh_key":
            os.chmod(secret_path, 0o600)
            host_vars["connectionSecret"] = secret_name
            host_vars["ansible_ssh_private_key_file"] = str(secret_path)
        elif secret_type == "login_password":
            password = secret_data.get("password", "")
            if not password:
                raise InventoryHttpError(400, "Password is empty in secret")
            host_vars["connectionSecret"] = secret_name
            host_vars["ansible_password"] = password
        else:
            raise InventoryHttpError(400, f"Unsupported secret type: {secret_type}")
    else:
        host_vars.pop("connectionSecret", None)
    _dump_yaml(host_file, host_vars)
    return {"success": True, "message": "Connection settings saved successfully"}


def ensure_inventory_sidecar_dirs(inventory_file_path: Path) -> None:
    inventory_dir = inventory_file_path.parent
    (inventory_dir / "group_vars").mkdir(parents=True, exist_ok=True)
    (inventory_dir / "host_vars").mkdir(parents=True, exist_ok=True)


def export_inventory_zip(project_id: str) -> tuple[bytes, str]:
    inventories = inventories_dir(project_id)
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        if inventories.exists():
            for inv_file in inventories.rglob("*"):
                if not inv_file.is_file() or inv_file.name not in EXPORT_INVENTORY_NAMES:
                    continue
                rel = inv_file.relative_to(inventories)
                if "group_vars" in rel.parts or "host_vars" in rel.parts:
                    continue
                zf.write(str(inv_file), f"inventories/{rel.as_posix()}")
    timestamp = time.strftime("%Y%m%d_%H%M%S")
    return buffer.getvalue(), f"inventory_export_{timestamp}.zip"


def import_inventory_archive(project_id: str, filename: str, payload: bytes) -> dict[str, Any]:
    name = (filename or "").strip()
    if not name:
        raise InventoryHttpError(400, "File not selected")
    target_dir = inventories_dir(project_id)
    target_dir.mkdir(parents=True, exist_ok=True)
    imported: list[str] = []
    errors: list[str] = []
    if name.endswith(".zip"):
        try:
            with zipfile.ZipFile(io.BytesIO(payload), "r") as zf:
                for info in zf.namelist():
                    if info.endswith("/") or "__MACOSX" in info:
                        continue
                    if not (info.endswith(".yml") or info.endswith(".yaml")):
                        continue
                    try:
                        content = zf.read(info)
                        yaml.safe_load(content)
                    except yaml.YAMLError as exc:
                        errors.append(f"{info}: invalid YAML - {exc}")
                        continue
                    except OSError as exc:
                        errors.append(f"{info}: {exc}")
                        continue
                    file_name = Path(info).name
                    dest = target_dir / file_name
                    dest.write_bytes(content)
                    ensure_inventory_sidecar_dirs(dest)
                    imported.append(file_name)
        except zipfile.BadZipFile as exc:
            raise InventoryHttpError(400, "Invalid ZIP archive") from exc
    else:
        if not (name.endswith(".yml") or name.endswith(".yaml")):
            raise InventoryHttpError(400, "Only .yml and .yaml files are supported")
        try:
            yaml.safe_load(payload)
        except yaml.YAMLError as exc:
            raise InventoryHttpError(400, f"Invalid YAML: {exc}") from exc
        dest = target_dir / Path(name).name
        dest.write_bytes(payload)
        ensure_inventory_sidecar_dirs(dest)
        imported.append(dest.name)
    if not imported:
        raise InventoryHttpError(400, "Failed to import any files")
    return {
        "success": True,
        "imported_files": imported,
        "imported": imported,
        "errors": errors or None,
        "message": f"Imported files: {len(imported)}",
    }


def ensure_all_inventory_dirs(project_id: str) -> None:
    inventories = inventories_dir(project_id)
    if not inventories.exists():
        return
    seen: set[Path] = set()
    for name in INVENTORY_NAMES:
        path = inventories / name
        if path.exists() and path.is_file():
            seen.add(path)
    for inv_file in inventories.rglob("*"):
        if inv_file.is_file() and inv_file.name in INVENTORY_NAMES:
            rel = inv_file.relative_to(inventories)
            if "group_vars" not in rel.parts and "host_vars" not in rel.parts:
                seen.add(inv_file)
    for inventory_file in seen:
        ensure_inventory_sidecar_dirs(inventory_file)
