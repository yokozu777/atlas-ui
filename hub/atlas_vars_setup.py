"""Cascade-aware Vars setup: origin per key, save to current layer, local/global."""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Optional

import yaml

from atlas_cluster_fs import load_cluster_yaml, resolve_atlas_inventory_leaf
from atlas_inspect import inventory_leaf_path, list_inventory_cluster_ids
from inventory_http import InventoryHttpError

_KEY_LINE = re.compile(r"^([ \t]*)([A-Za-z0-9_]+)[ \t]*:(.*)$")
PVE_TEMPLATE_NAMES = ("ubuntu-base", "oracle-base", "debian-base")
_SCALAR_OK = re.compile(r"^[A-Za-z0-9._/-]+$")
_REUSE_KEY = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
_CHANGEME = re.compile(r"^changeme(?:\b|_)", re.IGNORECASE)
LEAF_DNS_SHARED_KEY = "dns_domain_suffix"


def is_pve_factory_cluster(cluster_yaml: dict[str, Any] | None) -> bool:
    playbooks = cluster_yaml.get("playbooks") if isinstance(cluster_yaml, dict) else None
    if not isinstance(playbooks, dict):
        return False
    compute = playbooks.get("atlas-compute-provision")
    if not isinstance(compute, dict):
        return False
    entries = compute.get("entries")
    if not isinstance(entries, dict):
        return False
    return "templates" in entries and "provision" not in entries


def _require_leaf(project_id: str, cluster_id: Optional[str]) -> tuple[Path, str]:
    leaf = resolve_atlas_inventory_leaf(project_id, cluster_id)
    if leaf is None:
        raise InventoryHttpError(400, "atlas inventory leaf not found")
    data = load_cluster_yaml(leaf)
    cid = str((data or {}).get("id") or cluster_id or "").strip()
    if not cid:
        raise InventoryHttpError(400, "cluster id is missing")
    return leaf, cid


def cascade_layers(leaf: Path, cluster_id: str) -> list[tuple[str, Path]]:
    """Return existing config dirs as (origin, dir) org → env → leaf."""
    text = str(cluster_id).strip().strip("/")
    layers: list[tuple[str, Path]] = []
    seen: set[Path] = set()

    def _add(origin: str, path: Path) -> None:
        resolved = path.resolve()
        if not path.is_dir() or resolved in seen:
            return
        seen.add(resolved)
        layers.append((origin, path))

    if "/" in text:
        env, _name = text.split("/", 1)
        env_root = leaf.parent
        clusters_root = env_root.parent
        _add("org", clusters_root / "default" / "default")
        env_default = env_root / "default"
        if env_root.name == env:
            _add("env", env_default)
        else:
            _add("env", clusters_root / env / "default")
    _add("leaf", leaf)
    return layers


def _safe_rel(rel: str) -> str:
    param = (rel or "").strip().replace("\\", "/").lstrip("/")
    if not param:
        raise InventoryHttpError(400, "path is required")
    if ".." in Path(param).parts:
        raise InventoryHttpError(400, "Path is invalid")
    if not param.startswith("group_vars/") and not param.startswith("host_vars/"):
        raise InventoryHttpError(400, "Path must be within group_vars or host_vars")
    if Path(param).suffix not in {".yml", ".yaml"}:
        raise InventoryHttpError(400, "Only YAML vars files are allowed")
    return param


def _load_mapping(path: Path) -> dict[str, Any]:
    if not path.is_file():
        return {}
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    except (OSError, yaml.YAMLError):
        return {}
    return data if isinstance(data, dict) else {}


def _format_scalar(value: Any) -> str:
    if value is None:
        return "''"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        return str(value)
    text = str(value)
    if text == "":
        return "''"
    if _SCALAR_OK.fullmatch(text):
        return text
    return json.dumps(text, ensure_ascii=False)


def coerce_write_value(raw: Any) -> Any:
    if isinstance(raw, (bool, int, float)) and not isinstance(raw, bool):
        return raw
    if isinstance(raw, bool):
        return raw
    if not isinstance(raw, str):
        return raw
    if raw in {"true", "false"}:
        return raw == "true"
    if re.fullmatch(r"-?\d+", raw):
        try:
            return int(raw)
        except ValueError:
            return raw
    return raw


def stringify_value(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, list):
        return "\n".join(stringify_value(item) for item in value if item is not None and item != "")
    return str(value)


def _next_significant(lines: list[str], start: int) -> Optional[str]:
    for index in range(start, len(lines)):
        stripped = lines[index].strip()
        if not stripped or stripped.startswith("#"):
            continue
        return lines[index]
    return None


def _split_value_and_comment(rest: str) -> tuple[str, str]:
    in_single = False
    in_double = False
    for i, char in enumerate(rest):
        if char == "'" and not in_double:
            in_single = not in_single
            continue
        if char == '"' and not in_single:
            in_double = not in_double
            continue
        if char == "#" and not in_single and not in_double:
            if i == 0 or rest[i - 1] in " \t":
                return rest[:i].rstrip(), rest[i:]
    return rest.rstrip(), ""


def top_level_span(lines: list[str], key: str) -> Optional[tuple[int, int]]:
    start: Optional[int] = None
    for index, line in enumerate(lines):
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        match = _KEY_LINE.match(line.rstrip("\n"))
        if not match or match.group(1) or match.group(2) != key:
            continue
        start = index
        break
    if start is None:
        return None
    end = start + 1
    while end < len(lines):
        line = lines[end]
        if not line.strip():
            nxt = _next_significant(lines, end + 1)
            if nxt is None:
                break
            match = _KEY_LINE.match(nxt.rstrip("\n"))
            if match and not match.group(1):
                break
            end += 1
            continue
        if line.lstrip().startswith("#"):
            indent = len(line) - len(line.lstrip())
            if indent == 0:
                break
            end += 1
            continue
        match = _KEY_LINE.match(line.rstrip("\n"))
        if match and not match.group(1):
            break
        end += 1
    return start, end


def _comment_from_pending(pending: list[str]) -> str:
    return " ".join(
        part for part in pending if part and not re.fullmatch(r"[-=#]{3,}", part)
    )


def comments_above_index(text: str) -> dict[str, str]:
    """Map each first-seen top-level key to the comment block immediately above it."""
    index: dict[str, str] = {}
    pending: list[str] = []
    for line in text.split("\n"):
        stripped = line.strip()
        if not stripped:
            pending = []
            continue
        if stripped.startswith("#"):
            pending.append(stripped.lstrip("#").strip())
            continue
        match = _KEY_LINE.match(line.rstrip("\n"))
        if match and not match.group(1):
            key = match.group(2)
            if key not in index:
                _value, inline = _split_value_and_comment(match.group(3))
                inline_body = inline.lstrip("#").strip()
                if inline_body and not re.fullmatch(r"[-=#]{3,}", inline_body):
                    index[key] = inline_body
                else:
                    index[key] = _comment_from_pending(pending)
            pending = []
            continue
        pending = []
    return index


def comment_above(text: str, key: str) -> str:
    return comments_above_index(text).get(key, "")


def set_top_level_key(text: str, key: str, value: Any) -> str:
    lines = text.split("\n")
    trailing = text.endswith("\n")
    formatted = _format_scalar(coerce_write_value(value))
    span = top_level_span(lines, key)
    comment = ""
    if span is not None:
        match = _KEY_LINE.match(lines[span[0]].rstrip("\n"))
        if match:
            _value, comment = _split_value_and_comment(match.group(3))
    comment_part = f" {comment}" if comment else ""
    new_line = f"{key}: {formatted}{comment_part}"
    if span is None:
        while lines and lines[-1] == "":
            lines.pop()
        if lines and lines[-1].strip():
            lines.append(new_line)
        elif not lines:
            lines = [new_line]
        else:
            lines.append(new_line)
    else:
        lines[span[0] : span[1]] = [new_line]
    body = "\n".join(lines)
    if trailing and not body.endswith("\n"):
        body += "\n"
    elif not trailing:
        body = body.rstrip("\n")
        if text.endswith("\n"):
            body += "\n"
    if not body.endswith("\n"):
        body += "\n"
    return body


def set_top_level_block(text: str, key: str, block_lines: list[str]) -> str:
    lines = text.split("\n")
    span = top_level_span(lines, key)
    if span is None:
        while lines and lines[-1] == "":
            lines.pop()
        if lines and lines[-1].strip():
            lines.extend(block_lines)
        elif not lines:
            lines = list(block_lines)
        else:
            lines.extend(block_lines)
    else:
        lines[span[0] : span[1]] = block_lines
    body = "\n".join(lines)
    if not body.endswith("\n"):
        body += "\n"
    return body


def remove_top_level_key(text: str, key: str) -> str:
    lines = text.split("\n")
    span = top_level_span(lines, key)
    if span is None:
        return text if text.endswith("\n") or not text else text + "\n"
    del lines[span[0] : span[1]]
    body = "\n".join(lines)
    if not body.endswith("\n"):
        body += "\n"
    return body


def pve_templates_block(value: Any) -> list[str]:
    mapping = value if isinstance(value, dict) else {}
    lines = ["provision_pve_templates:"]
    for name in PVE_TEMPLATE_NAMES:
        item = mapping.get(name)
        if not isinstance(item, dict):
            item = {}
        ident = coerce_write_value(item.get("id", ""))
        url = item.get("image_url", "")
        lines.append(f"  {name}:")
        lines.append(f"    id: {_format_scalar(ident)}")
        lines.append(f"    image_url: {_format_scalar(url)}")
    return lines


def string_list_items(value: Any) -> list[str]:
    if isinstance(value, list):
        raw_items = value
    elif isinstance(value, str):
        raw_items = value.splitlines()
    elif value is None:
        raw_items = []
    else:
        raw_items = [value]
    items: list[str] = []
    for item in raw_items:
        if item is None:
            continue
        text = str(item).strip()
        if text:
            items.append(text)
    return items


def string_list_block(key: str, value: Any) -> list[str]:
    items = string_list_items(value)
    if not items:
        return [f"{key}: []"]
    lines = [f"{key}:"]
    for item in items:
        lines.append(f"  - {_format_scalar(item)}")
    return lines


def _file_for(layer_dir: Path, rel: str) -> Path:
    return layer_dir / rel


def _declared_playbooks(cluster_yaml: dict[str, Any]) -> list[str]:
    playbooks = cluster_yaml.get("playbooks")
    if not isinstance(playbooks, dict):
        return []
    return [str(name) for name in playbooks.keys()]


def _layer_has_file(layers: list[tuple[str, Path]], rel: str) -> bool:
    return any(_file_for(path, rel).is_file() for _origin, path in layers)


def _write_validated(path: Path, text: str) -> None:
    try:
        yaml.safe_load(text)
    except yaml.YAMLError as exc:
        raise InventoryHttpError(400, f"YAML validation error: {exc}") from exc
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text if text.endswith("\n") else text + "\n", encoding="utf-8")


def _cascade_maps(
    layers: list[tuple[str, Path]], rel: str
) -> list[tuple[str, Path, dict[str, Any]]]:
    """Load each cascade layer once: (origin, path, mapping)."""
    loaded: list[tuple[str, Path, dict[str, Any]]] = []
    for origin, directory in layers:
        path = _file_for(directory, rel)
        loaded.append((origin, path, _load_mapping(path)))
    return loaded


def _origin_and_value_from_maps(
    maps: list[tuple[str, Path, dict[str, Any]]], key: str
) -> tuple[str, Any, Optional[Path]]:
    origin = "missing"
    value: Any = None
    origin_path: Optional[Path] = None
    for name, path, mapping in maps:
        if key in mapping:
            origin = name
            value = mapping[key]
            origin_path = path
    return origin, value, origin_path


def _origin_and_value(
    layers: list[tuple[str, Path]], rel: str, key: str
) -> tuple[str, Any, Optional[Path]]:
    return _origin_and_value_from_maps(_cascade_maps(layers, rel), key)


def _all_keys_from_maps(maps: list[tuple[str, Path, dict[str, Any]]]) -> list[str]:
    keys: list[str] = []
    seen: set[str] = set()
    for _origin, _path, mapping in maps:
        for key in mapping:
            if key not in seen:
                seen.add(key)
                keys.append(key)
    return keys


def _file_exists_by_origin(layers: list[tuple[str, Path]], rel: str) -> dict[str, bool]:
    found = {"leaf": False, "env": False, "org": False}
    for origin, directory in layers:
        if _file_for(directory, rel).is_file() and origin in found:
            found[origin] = True
    return found


def _list_rel_paths(cluster_yaml: dict[str, Any], layers: list[tuple[str, Path]]) -> list[str]:
    pve = is_pve_factory_cluster(cluster_yaml)
    rels: list[str] = []
    for playbook in _declared_playbooks(cluster_yaml):
        if pve and playbook == "atlas-node-foundation":
            continue
        for suffix in (".yml", ".secrets.yml"):
            rel = f"group_vars/all/{playbook}{suffix}"
            if _layer_has_file(layers, rel):
                rels.append(rel)
    return rels


def _is_secrets_rel(rel: str) -> bool:
    name = Path(rel).name.lower()
    return ".secrets." in name


def _leaf_dns_overlay_rels(
    cluster_yaml: dict[str, Any], layers: list[tuple[str, Path]]
) -> list[str]:
    """Non-secret overlays that already declare ``dns_domain_suffix``."""
    rels: list[str] = []
    for rel in _list_rel_paths(cluster_yaml, layers):
        if _is_secrets_rel(rel):
            continue
        origin, _value, _path = _origin_and_value(layers, rel, LEAF_DNS_SHARED_KEY)
        if origin != "missing":
            rels.append(rel)
    return rels


def _apply_leaf_dns_suffix(
    cluster_yaml: dict[str, Any],
    layers: list[tuple[str, Path]],
    *,
    source_rel: str,
    target: str,
    value: Any,
) -> None:
    """Write the same leaf DNS suffix into every overlay that already has the key."""
    rels = _leaf_dns_overlay_rels(cluster_yaml, layers)
    if source_rel not in rels:
        rels = [source_rel, *rels]
    for rel in rels:
        _write_key_to_layer(layers, rel, target, LEAF_DNS_SHARED_KEY, value)
        if target != "leaf":
            _remove_key_from_leaf(layers, rel, LEAF_DNS_SHARED_KEY)


def _has_env_layer(layers: list[tuple[str, Path]]) -> bool:
    return any(origin == "env" for origin, _path in layers)


def _dir_for_origin(layers: list[tuple[str, Path]], origin: str) -> Optional[Path]:
    for name, directory in layers:
        if name == origin:
            return directory
    return None


def get_vars_setup(project_id: str, cluster_id: Optional[str] = None) -> dict[str, Any]:
    leaf, cid = _require_leaf(project_id, cluster_id)
    cluster_yaml = load_cluster_yaml(leaf)
    layers = cascade_layers(leaf, cid)
    files: list[dict[str, Any]] = []
    for rel in _list_rel_paths(cluster_yaml, layers):
        files.append(_file_descriptor(rel, layers))
    return {
        "success": True,
        "pveFactory": is_pve_factory_cluster(cluster_yaml),
        "hasEnvLayer": _has_env_layer(layers),
        "clusterId": cid,
        "files": files,
    }


def _file_descriptor(rel: str, layers: list[tuple[str, Path]]) -> dict[str, Any]:
    maps = _cascade_maps(layers, rel)
    keys: dict[str, Any] = {}
    nested: dict[str, Any] = {}
    for key in _all_keys_from_maps(maps):
        origin, value, _path = _origin_and_value_from_maps(maps, key)
        if isinstance(value, dict):
            nested[key] = {
                "value": value,
                "origin": origin,
            }
        else:
            keys[key] = {
                "value": stringify_value(value) if origin != "missing" else "",
                "origin": origin,
            }
    name = Path(rel).name
    return {
        "name": name,
        "path": rel,
        "exists": _file_exists_by_origin(layers, rel),
        "keys": keys,
        "nested": nested,
    }


def _attach_origin_comments(
    desc: dict[str, Any], layers: list[tuple[str, Path]], rel: str
) -> None:
    indexes: dict[str, dict[str, str]] = {}
    for key in list(desc["keys"]) + list(desc["nested"]):
        payload = desc["nested"].get(key) or desc["keys"].get(key) or {}
        origin = payload.get("origin") or "missing"
        comment = ""
        if origin in {"leaf", "env", "org"}:
            if origin not in indexes:
                indexes[origin] = {}
                directory = _dir_for_origin(layers, origin)
                if directory is not None:
                    path = _file_for(directory, rel)
                    if path.is_file():
                        try:
                            indexes[origin] = comments_above_index(
                                path.read_text(encoding="utf-8")
                            )
                        except OSError:
                            indexes[origin] = {}
            comment = indexes[origin].get(key, "")
        if key in desc["keys"]:
            desc["keys"][key]["comment"] = comment
        if key in desc["nested"]:
            desc["nested"][key]["comment"] = comment


def get_vars_setup_file(
    project_id: str, rel_path: str, cluster_id: Optional[str] = None
) -> dict[str, Any]:
    leaf, cid = _require_leaf(project_id, cluster_id)
    rel = _safe_rel(rel_path)
    layers = cascade_layers(leaf, cid)
    desc = _file_descriptor(rel, layers)
    _attach_origin_comments(desc, layers, rel)
    return {
        "success": True,
        "pveFactory": is_pve_factory_cluster(load_cluster_yaml(leaf)),
        "hasEnvLayer": _has_env_layer(layers),
        "clusterId": cid,
        **desc,
    }


def _target_origin_for_save(current: str) -> str:
    if current in {"env", "org", "leaf"}:
        return current
    return "leaf"


def _write_key_to_layer(
    layers: list[tuple[str, Path]],
    rel: str,
    origin: str,
    key: str,
    value: Any,
    *,
    nested: bool = False,
) -> None:
    directory = _dir_for_origin(layers, origin)
    if directory is None:
        raise InventoryHttpError(400, f"{origin} layer is not available")
    path = _file_for(directory, rel)
    text = path.read_text(encoding="utf-8") if path.is_file() else ""
    if nested:
        next_text = set_top_level_block(text, key, pve_templates_block(value))
    elif isinstance(value, list):
        next_text = set_top_level_block(text, key, string_list_block(key, value))
    else:
        next_text = set_top_level_key(text, key, value)
    _write_validated(path, next_text)


def _remove_key_from_leaf(layers: list[tuple[str, Path]], rel: str, key: str) -> None:
    directory = _dir_for_origin(layers, "leaf")
    if directory is None:
        return
    path = _file_for(directory, rel)
    if not path.is_file():
        return
    next_text = remove_top_level_key(path.read_text(encoding="utf-8"), key)
    if next_text.strip():
        _write_validated(path, next_text)
    else:
        path.write_text(next_text if next_text.endswith("\n") else "\n", encoding="utf-8")


def put_vars_setup_file(
    project_id: str,
    rel_path: str,
    *,
    cluster_id: Optional[str] = None,
    updates: Optional[dict[str, Any]] = None,
    nested: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    leaf, cid = _require_leaf(project_id, cluster_id)
    rel = _safe_rel(rel_path)
    layers = cascade_layers(leaf, cid)
    cluster_yaml = load_cluster_yaml(leaf)
    payload = dict(updates or {})
    dns_value = payload.pop(LEAF_DNS_SHARED_KEY, None)
    if dns_value is not None:
        origin, _current, _path = _origin_and_value(layers, rel, LEAF_DNS_SHARED_KEY)
        target = _target_origin_for_save(origin)
        _apply_leaf_dns_suffix(
            cluster_yaml,
            layers,
            source_rel=rel,
            target=target,
            value=dns_value,
        )
    for key, value in payload.items():
        origin, _current, _path = _origin_and_value(layers, rel, str(key))
        target = _target_origin_for_save(origin)
        _write_key_to_layer(layers, rel, target, str(key), value)
    for key, value in (nested or {}).items():
        origin, _current, _path = _origin_and_value(layers, rel, str(key))
        target = _target_origin_for_save(origin)
        _write_key_to_layer(layers, rel, target, str(key), value, nested=True)
    return get_vars_setup_file(project_id, rel, cid)


def move_vars_setup_key(
    project_id: str,
    rel_path: str,
    key: str,
    action: str,
    *,
    cluster_id: Optional[str] = None,
    value: Any = None,
    nested: bool = False,
) -> dict[str, Any]:
    leaf, cid = _require_leaf(project_id, cluster_id)
    rel = _safe_rel(rel_path)
    layers = cascade_layers(leaf, cid)
    name = (action or "").strip().lower()
    if name not in {"local", "global"}:
        raise InventoryHttpError(400, "action must be local or global")
    origin, current, _path = _origin_and_value(layers, rel, key)
    payload = current if value is None else value
    if payload is None and origin == "missing":
        payload = {} if nested else ""
    if key == LEAF_DNS_SHARED_KEY and not nested:
        cluster_yaml = load_cluster_yaml(leaf)
        if name == "local":
            _apply_leaf_dns_suffix(
                cluster_yaml,
                layers,
                source_rel=rel,
                target="leaf",
                value=payload,
            )
        else:
            if _dir_for_origin(layers, "env") is None:
                raise InventoryHttpError(400, "env/default layer is not available")
            _apply_leaf_dns_suffix(
                cluster_yaml,
                layers,
                source_rel=rel,
                target="env",
                value=payload,
            )
        return get_vars_setup_file(project_id, rel, cid)
    if name == "local":
        _write_key_to_layer(layers, rel, "leaf", key, payload, nested=nested)
    else:
        if _dir_for_origin(layers, "env") is None:
            raise InventoryHttpError(400, "env/default layer is not available")
        _write_key_to_layer(layers, rel, "env", key, payload, nested=nested)
        _remove_key_from_leaf(layers, rel, key)
    return get_vars_setup_file(project_id, rel, cid)


def _clusters_root_for_leaf(leaf: Path, cluster_id: str) -> Path:
    root = leaf
    for _part in cluster_id.split("/"):
        if _part:
            root = root.parent
    return root


def _reuse_scalar(value: Any) -> Optional[str]:
    if value is None or isinstance(value, (bool, dict, list)):
        return None
    text = stringify_value(value).strip()
    if not text or "{{" in text:
        return None
    if _CHANGEME.match(text):
        return None
    return text


def list_reused_secrets(
    project_id: str,
    cluster_id: Optional[str],
    keys: list[str],
) -> dict[str, Any]:
    """Saved scalars for the requested keys, read from every inventory leaf.

    Values are returned to the caller and must not be written to logs.
    """
    leaf, cid = _require_leaf(project_id, cluster_id)
    wanted = [key for key in dict.fromkeys(keys) if _REUSE_KEY.fullmatch(key)][:64]
    options: list[dict[str, str]] = []
    if not wanted:
        return {"success": True, "clusterId": cid, "options": options}
    clusters_root = _clusters_root_for_leaf(leaf, cid)
    wanted_set = set(wanted)
    for other_id in list_inventory_cluster_ids(clusters_root):
        other_leaf = inventory_leaf_path(clusters_root, other_id)
        group_vars = other_leaf / "group_vars"
        if not group_vars.is_dir():
            continue
        origin = "env" if other_id == "default" or other_id.endswith("/default") else "leaf"
        for path in sorted(group_vars.rglob("*")):
            if not path.is_file() or path.suffix not in {".yml", ".yaml"}:
                continue
            data = _load_mapping(path)
            if not data:
                continue
            rel = path.relative_to(other_leaf).as_posix()
            for key in wanted:
                if key not in data or key not in wanted_set:
                    continue
                text = _reuse_scalar(data[key])
                if text is None:
                    continue
                options.append(
                    {
                        "key": key,
                        "clusterId": other_id,
                        "file": rel,
                        "origin": origin,
                        "value": text,
                    }
                )
    return {"success": True, "clusterId": cid, "options": options}
