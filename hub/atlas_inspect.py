"""Read-only atlas-clusterctl inspect on the API host (not the worker queue)."""
from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path
from typing import Any, Mapping, Optional

from clusterctl_config import (
    clusterctl_root_from_project,
    resolve_clusters_root,
    resolve_workspace_root,
)

CLUSTER_CONFIG_NAME = "cluster.yaml"
INSPECT_TIMEOUT_SEC = 60

READONLY_COMMANDS = frozenset(
    {
        "plan",
        "limits",
        "vars",
        "list",
        "stages",
        "validate",
        "smoke",
        "workspace",
        "config",
        "repos",
    }
)
COMMAND_SUBS = {
    "workspace": frozenset({"show", "id"}),
    "config": frozenset({"show", "effective"}),
    "repos": frozenset({"status", "show"}),
}
FORBIDDEN_COMMANDS = frozenset({"run", "init", "use", "sync", "reset", "playbooks"})


class InspectError(ValueError):
    pass


def clusterctl_root_from_params(run_params: Mapping[str, Any] | None = None) -> Path:
    params = run_params or {}
    raw = params.get("clusterctl_root")
    payload: dict[str, Any] = {}
    if raw and str(raw).strip():
        payload["clusterctlRoot"] = str(raw).strip()
    found = clusterctl_root_from_project(payload)
    raw_found = str(found) if found else None
    if not raw_found or not str(raw_found).strip():
        raise InspectError(
            "ATLAS_CLUSTER_ROOT is empty: set atlas-clusterctl checkout in Settings "
            "(or project clusterctlRoot / hub env ATLAS_CLUSTER_ROOT) to the directory "
            "that contains the ./cluster binary."
        )
    root = Path(str(raw_found).strip()).expanduser().resolve()
    binary = root / "cluster"
    if not binary.is_file():
        raise InspectError(
            f"clusterctl not found: {binary} (ATLAS_CLUSTER_ROOT={root})"
        )
    return root


def inventory_leaf_path(clusters_root: Path, cluster_id: str) -> Path:
    return Path(clusters_root) / str(cluster_id).strip()


def normalize_inventory_cluster_id(cluster_id: str) -> str:
    cid = str(cluster_id or "").strip().replace("\\", "/")
    if not cid or cid.startswith("/") or cid.endswith("/"):
        raise InspectError("invalid cluster_id")
    parts = cid.split("/")
    if len(parts) not in (1, 2):
        raise InspectError("invalid cluster_id")
    for part in parts:
        if not part or part in {".", ".."} or part.startswith("."):
            raise InspectError("invalid cluster_id")
    return cid


def list_inventory_cluster_ids(clusters_root: Path) -> list[str]:
    """Leaf ids under clusters/ that have cluster.yaml (no clusterctl spawn)."""
    try:
        root = Path(clusters_root).expanduser().resolve()
    except OSError:
        return []
    if not root.is_dir():
        return []
    ids: list[str] = []

    def _maybe_add(config_dir: Path) -> None:
        if not config_dir.is_dir():
            return
        if not (config_dir / CLUSTER_CONFIG_NAME).is_file():
            return
        try:
            rel = config_dir.relative_to(root)
        except ValueError:
            return
        if any(part.startswith("_") or part.startswith(".") for part in rel.parts):
            return
        if len(rel.parts) == 2:
            ids.append(f"{rel.parts[0]}/{rel.parts[1]}")
        elif len(rel.parts) == 1:
            ids.append(rel.parts[0])

    try:
        entries = sorted(root.iterdir(), key=lambda item: item.name)
    except OSError:
        return []
    for env_dir in entries:
        if not env_dir.is_dir() or env_dir.name.startswith("_") or env_dir.name.startswith("."):
            continue
        try:
            children = sorted(env_dir.iterdir(), key=lambda item: item.name)
        except OSError:
            children = []
        for child in children:
            if child.is_dir():
                _maybe_add(child)
        _maybe_add(env_dir)
    return sorted(set(ids))


def resolve_clusters_root_for_list(
    run_params: Mapping[str, Any] | None = None,
) -> Path:
    """Resolve inventory root without requiring a cluster leaf or ./cluster binary."""
    params = dict(run_params or {})
    explicit = (
        params.get("clusters_root")
        or params.get("clustersRoot")
        or os.environ.get("ATLAS_CLUSTERS_ROOT")
    )
    if explicit and str(explicit).strip():
        return Path(str(explicit).strip()).expanduser().resolve()
    root = clusterctl_root_from_params(params)
    return resolve_clusters_root(root, params)


def list_atlas_inventory_clusters(
    run_params: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    clusters_root = resolve_clusters_root_for_list(run_params)
    ids = list_inventory_cluster_ids(clusters_root)
    return {
        "clustersRoot": str(clusters_root),
        "clusters": [{"id": cluster_id, "kind": "deployable"} for cluster_id in ids],
    }


def resolve_inspect_cluster_id(
    *,
    requested: Optional[str],
    fallback: Optional[str],
    run_params: Mapping[str, Any] | None = None,
) -> str:
    """Session override must be a known leaf; otherwise use the project cluster_id."""
    if requested is not None and str(requested).strip():
        cid = normalize_inventory_cluster_id(str(requested))
        clusters_root = resolve_clusters_root_for_list(run_params)
        known = set(list_inventory_cluster_ids(clusters_root))
        if cid not in known:
            raise InspectError(f"unknown cluster_id {cid}")
        return cid
    if fallback is not None and str(fallback).strip():
        return str(fallback).strip()
    raise InspectError(
        "cluster_id is required for atlas inspect (inventory leaf, e.g. dev/k8s)"
    )


def require_inventory_leaf(clusters_root: Path, cluster_id: Optional[str]) -> Path:
    if not cluster_id or not str(cluster_id).strip():
        raise InspectError(
            "cluster_id is required for atlas inspect (inventory leaf, e.g. dev/k8s)"
        )
    cid = str(cluster_id).strip()
    leaf = inventory_leaf_path(clusters_root, cid)
    cfg = leaf / CLUSTER_CONFIG_NAME
    if not cfg.is_file():
        raise InspectError(
            f"Inventory leaf missing: {cfg} "
            f"(ATLAS_CLUSTERS_ROOT={clusters_root}, cluster_id={cid}). "
            "Checkout or bind atlas-inventory and set ATLAS_CLUSTERS_ROOT."
        )
    return leaf


def build_atlas_argv(run_params: dict[str, Any]) -> list[str]:
    argv = list(run_params.get("argv") or [])
    cluster_id = run_params.get("cluster_id")
    if cluster_id and "--cluster" not in argv:
        argv = ["--cluster", str(cluster_id), *argv]
    return argv


def prepare_atlas_run(run_params: Mapping[str, Any] | None = None) -> dict[str, Any]:
    params = dict(run_params or {})
    root = clusterctl_root_from_params(params)
    cluster_id = params.get("cluster_id")
    clusters_root = resolve_clusters_root(root, params)
    leaf = require_inventory_leaf(clusters_root, cluster_id)
    workspace_root = resolve_workspace_root(root, params)
    argv = build_atlas_argv(params)
    env = os.environ.copy()
    env["ATLAS_CLUSTER_ROOT"] = str(root)
    env["ATLAS_CLUSTERS_ROOT"] = str(clusters_root)
    env["ATLAS_WORKSPACE_ROOT"] = str(workspace_root)
    env["CLUSTER_ID"] = str(cluster_id).strip()
    return {
        "clusterctl_root": root,
        "binary": root / "cluster",
        "clusters_root": clusters_root,
        "workspace_root": workspace_root,
        "leaf": leaf,
        "argv": argv,
        "env": env,
        "cluster_id": str(cluster_id).strip(),
    }


def _positional_tokens(argv: list[str]) -> list[str]:
    tokens: list[str] = []
    i = 0
    while i < len(argv):
        item = argv[i]
        if item == "--cluster":
            i += 2
            continue
        if item.startswith("-"):
            i += 1
            continue
        tokens.append(item)
        i += 1
    return tokens


def assert_inspect_argv(argv: list[str]) -> list[str]:
    if not isinstance(argv, list) or not argv:
        raise InspectError("argv must be a non-empty array")
    cleaned: list[str] = []
    for item in argv:
        if not isinstance(item, str):
            raise InspectError("argv entries must be strings")
        if "\0" in item:
            raise InspectError("argv must not contain NUL")
        cleaned.append(item)
    tokens = _positional_tokens(cleaned)
    if not tokens:
        raise InspectError("argv has no clusterctl command")
    command = tokens[0]
    if command in FORBIDDEN_COMMANDS:
        raise InspectError(f"mutating command is not allowed on inspect: {command}")
    if command not in READONLY_COMMANDS:
        raise InspectError(f"unsupported inspect command: {command}")
    allowed_subs = COMMAND_SUBS.get(command)
    if allowed_subs is not None:
        if len(tokens) < 2:
            raise InspectError(f"{command} requires {'|'.join(sorted(allowed_subs))}")
        sub = tokens[1]
        if sub in FORBIDDEN_COMMANDS or sub not in allowed_subs:
            raise InspectError(f"{command} {sub} is not allowed on inspect")
    return cleaned


def parse_json_stdout(log: str) -> Any | None:
    body = log.strip()
    if not body:
        return None
    try:
        return json.loads(body)
    except json.JSONDecodeError:
        pass
    for opener, closer in (("{", "}"), ("[", "]")):
        start = body.find(opener)
        end = body.rfind(closer)
        if start >= 0 and end > start:
            try:
                return json.loads(body[start : end + 1])
            except json.JSONDecodeError:
                continue
    return None


def _workspace_parent(
    clusterctl_root: Path, run_params: Mapping[str, Any] | None = None
) -> Path:
    return resolve_workspace_root(clusterctl_root, run_params)


def allowed_read_roots(spec: Mapping[str, Any]) -> list[Path]:
    ctl = Path(spec["clusterctl_root"]).resolve()
    clusters = Path(spec["clusters_root"]).resolve()
    leaf = Path(spec["leaf"]).resolve()
    workspace = Path(spec["workspace_root"]).resolve() if spec.get("workspace_root") else _workspace_parent(ctl)
    roots = [clusters, leaf, workspace]
    if clusters.name == "clusters":
        roots.append(clusters.parent.resolve())
    return roots


def assert_contained(path: Path, roots: list[Path]) -> Path:
    resolved = path.resolve()
    for root in roots:
        try:
            resolved.relative_to(root.resolve())
            return resolved
        except ValueError:
            continue
    raise InspectError("path outside inventory/workspace")


def inspect_atlas(
    argv: list[str],
    cluster_id: str,
    run_params: Mapping[str, Any] | None = None,
    timeout: int = INSPECT_TIMEOUT_SEC,
) -> dict[str, Any]:
    cleaned = assert_inspect_argv(argv)
    params = dict(run_params or {})
    params["argv"] = cleaned
    params["cluster_id"] = cluster_id
    spec = prepare_atlas_run(params)
    cmd = [str(spec["binary"]), *spec["argv"]]
    try:
        completed = subprocess.run(
            cmd,
            cwd=str(spec["clusterctl_root"]),
            env=spec["env"],
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise InspectError(f"inspect timed out ({timeout}s)") from exc
    log = (completed.stdout or "") + (completed.stderr or "")
    parsed = parse_json_stdout(log) if "--json" in spec["argv"] else parse_json_stdout(log)
    return {
        "success": completed.returncode == 0,
        "argv": spec["argv"],
        "log": log,
        "json": parsed,
        "return_code": completed.returncode,
        "cluster_id": spec["cluster_id"],
    }


def _safe_stamp(stamp: str) -> str:
    value = str(stamp or "").strip()
    if not value or value in {".", ".."} or "/" in value or "\\" in value:
        raise InspectError("invalid stamp")
    return value


def _logs_dir_from_inspect(result: Mapping[str, Any], spec: Mapping[str, Any]) -> Path:
    payload = result.get("json")
    if not isinstance(payload, dict) or not payload.get("logs"):
        raise InspectError("workspace show did not return a logs path")
    logs_dir = Path(str(payload["logs"]))
    return assert_contained(logs_dir, allowed_read_roots(spec))


def list_atlas_logs(
    cluster_id: str, run_params: Mapping[str, Any] | None = None
) -> dict[str, Any]:
    result = inspect_atlas(["workspace", "show", "--json"], cluster_id, run_params)
    if result["return_code"] != 0:
        raise InspectError(result["log"] or "workspace show failed")
    params = dict(run_params or {})
    params["cluster_id"] = cluster_id
    spec = prepare_atlas_run({**params, "argv": ["workspace", "show", "--json"]})
    logs_dir = _logs_dir_from_inspect(result, spec)
    runs: list[dict[str, Any]] = []
    if logs_dir.is_dir():
        for child in logs_dir.iterdir():
            if not child.is_dir() or child.name in {"latest"}:
                continue
            meta = None
            meta_file = child / "meta.json"
            if meta_file.is_file():
                try:
                    meta = json.loads(meta_file.read_text(encoding="utf-8"))
                except (OSError, json.JSONDecodeError):
                    meta = None
            runs.append({"stamp": child.name, "dir": str(child), "meta": meta})
        runs.sort(key=lambda row: str(row["stamp"]), reverse=True)
    return {"logsDir": str(logs_dir), "runs": runs}


def read_atlas_log(
    cluster_id: str, stamp: str, run_params: Mapping[str, Any] | None = None
) -> str:
    listed = list_atlas_logs(cluster_id, run_params)
    logs_dir = Path(listed["logsDir"])
    params = dict(run_params or {})
    params["cluster_id"] = cluster_id
    spec = prepare_atlas_run({**params, "argv": ["workspace", "show", "--json"]})
    file_path = assert_contained(
        logs_dir / _safe_stamp(stamp) / "run.log",
        allowed_read_roots(spec),
    )
    if not file_path.is_file():
        raise InspectError(f"run.log not found for stamp {stamp}")
    return file_path.read_text(encoding="utf-8", errors="replace")


WORKSPACE_FILE_MAX = 512 * 1024


def _normalize_rel(rel: str) -> str:
    value = str(rel or "").replace("\\", "/").lstrip("/")
    if not value or "\0" in value:
        raise InspectError("invalid path")
    parts = value.split("/")
    if any(part in {"", ".", ".."} for part in parts):
        raise InspectError("invalid path")
    return value


def _workspace_rel(rel: str | None) -> str:
    value = str(rel or "").replace("\\", "/").strip("/")
    if not value:
        return ""
    if "\0" in value:
        raise InspectError("invalid path")
    parts = value.split("/")
    if any(part in {"", ".", ".."} for part in parts):
        raise InspectError("invalid path")
    return value


def _cluster_workspace_dir(
    cluster_id: str, run_params: Mapping[str, Any] | None = None
) -> tuple[Path, dict[str, Any]]:
    cid = normalize_inventory_cluster_id(str(cluster_id or "").strip())
    params = dict(run_params or {})
    params["cluster_id"] = cid
    spec = prepare_atlas_run({**params, "argv": ["workspace", "show", "--json"]})
    parent = Path(spec["workspace_root"]).resolve()
    cluster_ws = (parent / cid).resolve()
    try:
        cluster_ws.relative_to(parent)
    except ValueError as exc:
        raise InspectError("path outside inventory/workspace") from exc
    assert_contained(parent, allowed_read_roots(spec))
    return cluster_ws, spec


def _contained_in_cluster_ws(
    path: Path, cluster_ws: Path, spec: Mapping[str, Any]
) -> Path:
    resolved = path.resolve()
    try:
        resolved.relative_to(cluster_ws.resolve())
    except ValueError as exc:
        raise InspectError("path outside inventory/workspace") from exc
    return assert_contained(resolved, allowed_read_roots(spec))


def list_atlas_workspace(
    cluster_id: str,
    rel: str = "",
    run_params: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    cluster_ws, spec = _cluster_workspace_dir(cluster_id, run_params)
    normalized = _workspace_rel(rel)
    target = cluster_ws if not normalized else cluster_ws / normalized
    if not target.exists():
        return {"rel": normalized, "entries": []}
    resolved = _contained_in_cluster_ws(target, cluster_ws, spec)
    if not resolved.is_dir():
        raise InspectError(f"not a directory: {normalized or '.'}")
    entries: list[dict[str, Any]] = []
    for child in resolved.iterdir():
        try:
            child_resolved = _contained_in_cluster_ws(child, cluster_ws, spec)
        except InspectError:
            continue
        kind = "dir" if child_resolved.is_dir() else "file"
        name = child.name
        child_rel = f"{normalized}/{name}" if normalized else name
        item: dict[str, Any] = {
            "name": name,
            "rel": child_rel.replace("\\", "/"),
            "kind": kind,
        }
        if kind == "file":
            try:
                item["size"] = int(child_resolved.stat().st_size)
            except OSError:
                item["size"] = 0
        entries.append(item)
    entries.sort(key=lambda row: (row["kind"] != "dir", str(row["name"]).lower()))
    return {"rel": normalized, "entries": entries}


def read_atlas_workspace_file(
    cluster_id: str,
    rel: str,
    run_params: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    normalized = _workspace_rel(rel)
    if not normalized:
        raise InspectError("invalid path")
    cluster_ws, spec = _cluster_workspace_dir(cluster_id, run_params)
    resolved = _contained_in_cluster_ws(cluster_ws / normalized, cluster_ws, spec)
    if not resolved.is_file():
        raise InspectError(f"file not found: {normalized}")
    data = resolved.read_bytes()
    size = len(data)
    if b"\x00" in data[:8192]:
        return {"rel": normalized, "binary": True, "size": size}
    truncated = size > WORKSPACE_FILE_MAX
    text = data[:WORKSPACE_FILE_MAX].decode("utf-8", errors="replace")
    return {
        "rel": normalized,
        "content": text,
        "binary": False,
        "truncated": truncated,
        "size": size,
    }


def read_atlas_file(
    cluster_id: str, rel: str, run_params: Mapping[str, Any] | None = None
) -> dict[str, Any]:
    params = dict(run_params or {})
    params["cluster_id"] = cluster_id
    params["argv"] = ["vars", "--json"]
    spec = prepare_atlas_run(params)
    normalized = _normalize_rel(rel)
    full = assert_contained(
        Path(spec["clusters_root"]) / normalized,
        allowed_read_roots(spec),
    )
    if not full.is_file():
        raise InspectError(f"file not found: {normalized}")
    return {"rel": normalized, "content": full.read_text(encoding="utf-8", errors="replace")}
