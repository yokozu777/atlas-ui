"""Atlas cluster hosts topology (groups, IPs, provision CPU/RAM/disk)."""
from __future__ import annotations

from io import StringIO
from pathlib import Path
from typing import Any, Mapping, Optional

from atlas_cluster_fs import resolve_atlas_inventory_leaf
from atlas_vars_setup import PVE_TEMPLATE_NAMES, cascade_layers


class AtlasHostsError(Exception):
    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.message = message


HOST_FILE_NAMES = ("hosts", "hosts.yml", "hosts.yaml")
PROVISION_KEYS = ("vmid", "sockets", "cores", "memory", "numa", "clone", "disks")
DISK_KEYS = ("size", "slot", "storage")
COMPUTE_VARS_RELS = (
    "group_vars/all/atlas-compute-provision.yml",
    "group_vars/all/atlas-compute-provision.yaml",
)


def _yaml():
    from ruamel.yaml import YAML

    yaml = YAML()
    yaml.preserve_quotes = True
    yaml.width = 4096
    yaml.indent(mapping=2, sequence=4, offset=2)
    return yaml


def _require_leaf(project_id: str, cluster_id: Optional[str]) -> tuple[Path, str]:
    leaf = resolve_atlas_inventory_leaf(project_id, cluster_id)
    if leaf is None:
        raise AtlasHostsError(400, "atlas inventory leaf not found")
    cid = str(cluster_id or "").strip()
    if not cid:
        from atlas_cluster_fs import load_cluster_yaml

        cid = str((load_cluster_yaml(leaf) or {}).get("id") or "").strip()
    if not cid:
        raise AtlasHostsError(400, "cluster_id is required")
    return leaf, cid


def hosts_file_path(leaf: Path) -> Path:
    for name in HOST_FILE_NAMES:
        path = leaf / name
        if path.is_file():
            return path
    return leaf / "hosts"


def _as_int(value: Any, default: int = 0) -> int:
    if value is None or value == "":
        return default
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return default


def _as_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    text = str(value or "").strip().lower()
    return text in {"1", "true", "yes", "on"}


def _disk_from_mapping(raw: Any) -> dict[str, Any]:
    data = raw if isinstance(raw, Mapping) else {}
    extra = {
        str(key): value
        for key, value in data.items()
        if str(key) not in DISK_KEYS
    }
    slot = data.get("slot")
    return {
        "size": str(data.get("size") if data.get("size") is not None else "").strip(),
        "slot": _as_int(slot, 0) if slot is not None and str(slot).strip() != "" else 0,
        "storage": str(data.get("storage") or "").strip(),
        "extra": extra,
    }


def _host_from_mapping(ip: str, raw: Any) -> dict[str, Any]:
    data = raw if isinstance(raw, Mapping) else {}
    provision_raw = data.get("provision") if isinstance(data.get("provision"), Mapping) else {}
    disks_raw = provision_raw.get("disks")
    disks: list[dict[str, Any]] = []
    if isinstance(disks_raw, list):
        disks = [_disk_from_mapping(item) for item in disks_raw]
    extra = {
        str(key): value
        for key, value in data.items()
        if str(key) not in {"hostname", "provision"}
    }
    provision_extra = {
        str(key): value
        for key, value in provision_raw.items()
        if str(key) not in PROVISION_KEYS
    }
    return {
        "ip": str(ip).strip(),
        "hostname": str(data.get("hostname") or "").strip(),
        "vmid": str(provision_raw.get("vmid") if provision_raw.get("vmid") is not None else "").strip(),
        "sockets": _as_int(provision_raw.get("sockets"), 1),
        "cores": _as_int(provision_raw.get("cores"), 1),
        "memory": _as_int(provision_raw.get("memory"), 1024),
        "numa": _as_bool(provision_raw.get("numa")),
        "clone": str(provision_raw.get("clone") or "").strip(),
        "disks": disks,
        "extra": extra,
        "provisionExtra": provision_extra,
    }


def _walk_groups(node: Any, path: list[str], acc: list[dict[str, Any]]) -> None:
    if not isinstance(node, Mapping):
        return
    hosts_raw = node.get("hosts")
    hosts: list[dict[str, Any]] = []
    if isinstance(hosts_raw, Mapping):
        for ip, payload in hosts_raw.items():
            row = _host_from_mapping(str(ip), payload)
            if row["ip"]:
                hosts.append(row)
    elif isinstance(hosts_raw, list):
        for item in hosts_raw:
            if isinstance(item, Mapping):
                ip = next(iter(item), "")
                row = _host_from_mapping(str(ip), item.get(ip) if ip in item else item)
            else:
                row = _host_from_mapping(str(item), {})
            if row["ip"]:
                hosts.append(row)
    if path and (hosts or isinstance(hosts_raw, (Mapping, list))):
        acc.append(
            {
                "id": "/".join(path),
                "name": path[-1],
                "path": list(path),
                "hosts": hosts,
            }
        )
    children = node.get("children")
    if isinstance(children, Mapping):
        for name, child in children.items():
            key = str(name).strip()
            if not key:
                continue
            _walk_groups(child, path + [key], acc)


def _load_root(path: Path) -> Any:
    if not path.is_file():
        raise AtlasHostsError(404, f"hosts file not found: {path.name}")
    try:
        data = _yaml().load(path.read_text(encoding="utf-8"))
    except OSError as exc:
        raise AtlasHostsError(400, "hosts file is unreadable") from exc
    except Exception as exc:
        raise AtlasHostsError(400, f"hosts YAML is invalid: {exc}") from exc
    return data


def _clone_options(leaf: Path, cluster_id: str) -> list[str]:
    found: list[str] = []
    seen: set[str] = set()
    try:
        layers = cascade_layers(leaf, cluster_id)
    except Exception:
        layers = [("leaf", leaf)]
    for _origin, directory in layers:
        for rel in COMPUTE_VARS_RELS:
            path = directory / rel
            if not path.is_file():
                continue
            try:
                data = _yaml().load(path.read_text(encoding="utf-8")) or {}
            except Exception:
                continue
            if not isinstance(data, Mapping):
                continue
            templates = data.get("provision_pve_templates")
            if not isinstance(templates, Mapping):
                continue
            for key in templates:
                name = str(key).strip()
                if name and name not in seen:
                    seen.add(name)
                    found.append(name)
    if found:
        return found
    return list(PVE_TEMPLATE_NAMES)


def list_hosts_topology(project_id: str, cluster_id: Optional[str] = None) -> dict[str, Any]:
    leaf, cid = _require_leaf(project_id, cluster_id)
    path = hosts_file_path(leaf)
    data = _load_root(path)
    groups: list[dict[str, Any]] = []
    if isinstance(data, Mapping):
        root = data.get("all") if isinstance(data.get("all"), Mapping) else data
        _walk_groups(root, [], groups)
    return {
        "clusterId": cid,
        "file": path.name,
        "groups": groups,
        "cloneOptions": _clone_options(leaf, cid),
    }


def _disk_gb(size: Any) -> int:
    text = str(size or "").strip().lower().replace(" ", "")
    if not text:
        return 0
    number = ""
    unit = "g"
    for char in text:
        if char.isdigit() or char == ".":
            number += char
        else:
            if char in {"k", "m", "g", "t"}:
                unit = char
            break
    if not number:
        return 0
    try:
        value = float(number)
    except ValueError:
        return 0
    if unit == "t":
        return int(value * 1024)
    if unit == "m":
        return int(value / 1024)
    if unit == "k":
        return 0
    return int(value)


def _accumulate_host(host: Mapping[str, Any], seen: set[str], totals: dict[str, int]) -> None:
    ip = str(host.get("ip") or "").strip()
    if not ip or ip in seen:
        return
    seen.add(ip)
    totals["hostCount"] += 1
    sockets = max(_as_int(host.get("sockets"), 1), 1)
    cores = max(_as_int(host.get("cores"), 1), 1)
    totals["cpu"] += sockets * cores
    totals["memoryMb"] += max(_as_int(host.get("memory"), 0), 0)
    disks = host.get("disks")
    if isinstance(disks, list):
        for disk in disks:
            if isinstance(disk, Mapping):
                totals["diskGb"] += _disk_gb(disk.get("size"))


def summarize_hosts_capacity(leaf: Path) -> dict[str, int]:
    empty = {"hostCount": 0, "cpu": 0, "memoryMb": 0, "diskGb": 0}
    path = hosts_file_path(leaf)
    if not path.is_file():
        return empty
    try:
        data = _yaml().load(path.read_text(encoding="utf-8"))
    except Exception:
        return empty
    groups: list[dict[str, Any]] = []
    root: Any = None
    if isinstance(data, Mapping):
        root = data.get("all") if isinstance(data.get("all"), Mapping) else data
        _walk_groups(root, [], groups)
    totals = dict(empty)
    seen: set[str] = set()
    if isinstance(root, Mapping):
        hosts_raw = root.get("hosts")
        if isinstance(hosts_raw, Mapping):
            for ip, payload in hosts_raw.items():
                _accumulate_host(_host_from_mapping(str(ip), payload), seen, totals)
    for group in groups:
        for host in group.get("hosts") or []:
            if isinstance(host, Mapping):
                _accumulate_host(host, seen, totals)
    return totals


def _commented_map(items: Optional[Mapping[str, Any]] = None):
    from ruamel.yaml.comments import CommentedMap

    mapping = CommentedMap()
    if items:
        for key, value in items.items():
            mapping[key] = value
    return mapping


def _commented_seq(items: Optional[list[Any]] = None):
    from ruamel.yaml.comments import CommentedSeq

    seq = CommentedSeq()
    if items:
        seq.extend(items)
    return seq


def _disk_to_yaml(disk: Mapping[str, Any]) -> Any:
    mapping = _commented_map()
    size = disk.get("size")
    if size is not None and str(size).strip() != "":
        mapping["size"] = str(size).strip()
    if disk.get("slot") is not None and str(disk.get("slot")).strip() != "":
        mapping["slot"] = _as_int(disk.get("slot"), 0)
    storage = str(disk.get("storage") or "").strip()
    if storage:
        mapping["storage"] = storage
    extra = disk.get("extra") if isinstance(disk.get("extra"), Mapping) else {}
    for key, value in extra.items():
        if str(key) not in mapping:
            mapping[str(key)] = value
    return mapping


def _host_to_yaml(host: Mapping[str, Any]) -> Any:
    mapping = _commented_map()
    extra = host.get("extra") if isinstance(host.get("extra"), Mapping) else {}
    hostname = str(host.get("hostname") or "").strip()
    mapping["hostname"] = hostname
    provision = _commented_map()
    vmid = str(host.get("vmid") if host.get("vmid") is not None else "").strip()
    if vmid:
        provision["vmid"] = vmid
    provision["sockets"] = _as_int(host.get("sockets"), 1)
    provision["cores"] = _as_int(host.get("cores"), 1)
    provision["memory"] = _as_int(host.get("memory"), 1024)
    provision["numa"] = bool(host.get("numa"))
    clone = str(host.get("clone") or "").strip()
    if clone:
        provision["clone"] = clone
    disks_raw = host.get("disks")
    disks = _commented_seq()
    if isinstance(disks_raw, list):
        for item in disks_raw:
            if isinstance(item, Mapping):
                disks.append(_disk_to_yaml(item))
    if disks:
        provision["disks"] = disks
    extra_prov = (
        host.get("provisionExtra")
        if isinstance(host.get("provisionExtra"), Mapping)
        else {}
    )
    for key, value in extra_prov.items():
        if str(key) not in provision:
            provision[str(key)] = value
    mapping["provision"] = provision
    for key, value in extra.items():
        if str(key) not in mapping:
            mapping[str(key)] = value
    return mapping


def _child_node(parent: Mapping[str, Any], name: str) -> Any:
    children = parent.get("children")
    if not isinstance(children, Mapping):
        return None
    return children.get(name)


def _resolve_group_node(root: Mapping[str, Any], path: list[str]) -> Any:
    node = root.get("all") if isinstance(root.get("all"), Mapping) else root
    if not path:
        return node
    cursor = node
    for part in path:
        nxt = _child_node(cursor, part) if isinstance(cursor, Mapping) else None
        if nxt is None:
            return None
        cursor = nxt
    return cursor


def _validate_groups(groups: list[Mapping[str, Any]]) -> None:
    ips: set[str] = set()
    vmids: set[str] = set()
    for group in groups:
        hosts = group.get("hosts")
        if not isinstance(hosts, list):
            raise AtlasHostsError(400, "group hosts must be a list")
        name = str(group.get("name") or group.get("id") or "").strip()
        path = group.get("path")
        if not isinstance(path, list) or not path:
            raise AtlasHostsError(400, f"group {name or '?'} is missing path")
        for host in hosts:
            if not isinstance(host, Mapping):
                raise AtlasHostsError(400, f"invalid host in {name}")
            ip = str(host.get("ip") or "").strip()
            hostname = str(host.get("hostname") or "").strip()
            if not ip:
                raise AtlasHostsError(400, f"host IP is required in {name}")
            if " " in ip or "/" in ip:
                raise AtlasHostsError(400, f"invalid host IP {ip}")
            if ip in ips:
                raise AtlasHostsError(400, f"duplicate host IP {ip}")
            ips.add(ip)
            if not hostname:
                raise AtlasHostsError(400, f"hostname is required for {ip}")
            vmid = str(host.get("vmid") if host.get("vmid") is not None else "").strip()
            if vmid:
                if vmid in vmids:
                    raise AtlasHostsError(400, f"duplicate vmid {vmid}")
                vmids.add(vmid)


def save_hosts_topology(
    project_id: str,
    cluster_id: Optional[str],
    groups: Any,
) -> dict[str, Any]:
    if not isinstance(groups, list):
        raise AtlasHostsError(400, "groups must be a list")
    typed = [item for item in groups if isinstance(item, Mapping)]
    if len(typed) != len(groups):
        raise AtlasHostsError(400, "groups must be objects")
    _validate_groups(typed)
    leaf, cid = _require_leaf(project_id, cluster_id)
    path = hosts_file_path(leaf)
    data = _load_root(path)
    if not isinstance(data, Mapping):
        raise AtlasHostsError(400, "hosts YAML is not a mapping")
    for group in typed:
        path_parts = [str(part).strip() for part in group.get("path") or [] if str(part).strip()]
        node = _resolve_group_node(data, path_parts)
        if not isinstance(node, Mapping):
            raise AtlasHostsError(404, f"group {'/'.join(path_parts)} not found")
        hosts_map = _commented_map()
        for host in group.get("hosts") or []:
            if not isinstance(host, Mapping):
                continue
            ip = str(host.get("ip") or "").strip()
            if not ip:
                continue
            hosts_map[ip] = _host_to_yaml(host)
        node["hosts"] = hosts_map
    buf = StringIO()
    yaml = _yaml()
    yaml.dump(data, buf)
    text = buf.getvalue()
    if not text.endswith("\n"):
        text += "\n"
    try:
        path.write_text(text, encoding="utf-8")
    except OSError as exc:
        raise AtlasHostsError(400, "hosts file is not writable") from exc
    return list_hosts_topology(project_id, cid)
