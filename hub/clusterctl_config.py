"""Read clusterctl `.config/config.yaml` path defaults for atlas projects."""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Mapping, MutableMapping, Optional

import yaml

CONFIG_DIRNAME = ".config"
CONFIG_FILENAME = "config.yaml"
ENV_CONFIG_PATH = "ATLAS_CLUSTERCTL_CONFIG"
ENV_CLUSTER_ROOT = "ATLAS_CLUSTER_ROOT"
ENV_CLUSTERS_ROOT = "ATLAS_CLUSTERS_ROOT"
ENV_WORKSPACE_ROOT = "ATLAS_WORKSPACE_ROOT"
ENV_UI_CONFIG_PATH = "ATLAS_UI_CONFIG"


def ui_config_path() -> Path:
    override = os.environ.get(ENV_UI_CONFIG_PATH, "").strip()
    if override:
        return Path(override).expanduser()
    return Path.home() / ".config" / "atlas-ui" / "config.json"


def clusterctl_root_from_ui_config() -> Optional[Path]:
    """Same file Settings → Local / clusterctl writes (~/.config/atlas-ui/config.json)."""
    path = ui_config_path()
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(raw, dict):
        return None
    value = raw.get("clusterctlRoot")
    if not value or not str(value).strip():
        return None
    return Path(str(value).strip()).expanduser()


def default_clusterctl_root() -> Optional[Path]:
    env = os.environ.get(ENV_CLUSTER_ROOT, "").strip()
    if env:
        return Path(env).expanduser()
    return clusterctl_root_from_ui_config()


def clusterctl_root_from_project(project: Mapping[str, Any] | None = None) -> Optional[Path]:
    payload = project or {}
    raw = payload.get("clusterctlRoot") or payload.get("clusterctl_root")
    if raw and str(raw).strip():
        return Path(str(raw).strip()).expanduser()
    return default_clusterctl_root()


def local_config_path(repo_root: Path) -> Path:
    override = os.environ.get(ENV_CONFIG_PATH, "").strip()
    if override:
        return Path(override).expanduser()
    return repo_root / CONFIG_DIRNAME / CONFIG_FILENAME


def resolve_configured_path(raw_path: str, *, repo_root: Path) -> Path:
    path = Path(raw_path).expanduser()
    if not path.is_absolute():
        return (repo_root / path).resolve()
    return path.resolve()


def _section_path(
    config: Mapping[str, Any], section: str, *, repo_root: Path
) -> Optional[Path]:
    block = config.get(section)
    if block is None:
        return None
    if not isinstance(block, dict):
        return None
    raw_path = block.get("path")
    if raw_path is None or raw_path == "":
        return None
    if not isinstance(raw_path, str):
        return None
    return resolve_configured_path(raw_path, repo_root=repo_root)


def load_path_defaults(repo_root: Path | None) -> dict[str, Any]:
    if repo_root is None:
        return {
            "clustersRoot": "",
            "workspaceRoot": "",
            "configPath": "",
            "configExists": False,
        }
    cfg_path = local_config_path(repo_root)
    exists = cfg_path.is_file()
    clusters = ""
    workspace = ""
    if exists:
        try:
            raw = yaml.safe_load(cfg_path.read_text(encoding="utf-8")) or {}
        except (OSError, yaml.YAMLError):
            raw = {}
        if isinstance(raw, dict):
            clusters_path = _section_path(raw, "clusters", repo_root=repo_root)
            workspace_path = _section_path(raw, "workspace", repo_root=repo_root)
            clusters = str(clusters_path) if clusters_path else ""
            workspace = str(workspace_path) if workspace_path else ""
    return {
        "clustersRoot": clusters,
        "workspaceRoot": workspace,
        "configPath": str(cfg_path),
        "configExists": exists,
    }


def _explicit_path(
    params: Mapping[str, Any], keys: tuple[str, ...], env_key: str
) -> Optional[Path]:
    for key in keys:
        raw = params.get(key)
        if raw and str(raw).strip():
            return Path(str(raw).strip()).expanduser().resolve()
    raw = os.environ.get(env_key)
    if raw and str(raw).strip():
        return Path(str(raw).strip()).expanduser().resolve()
    return None


def sibling_inventory_clusters(clusterctl_root: Path) -> Optional[Path]:
    sibling = clusterctl_root.parent / "atlas-inventory" / "clusters"
    if sibling.is_dir():
        return sibling.resolve()
    return None


def resolve_clusters_root(
    clusterctl_root: Path, run_params: Mapping[str, Any] | None = None
) -> Path:
    """Live inventory: runParams/env, then config.yaml, sibling inventory, product clusters/."""
    params = run_params or {}
    explicit = _explicit_path(
        params, ("clusters_root", "clustersRoot"), ENV_CLUSTERS_ROOT
    )
    if explicit is not None:
        return explicit
    configured = load_path_defaults(clusterctl_root).get("clustersRoot")
    if configured and str(configured).strip():
        return Path(str(configured).strip()).expanduser().resolve()
    sibling = sibling_inventory_clusters(clusterctl_root)
    if sibling is not None:
        return sibling
    return (clusterctl_root / "clusters").resolve()


def resolve_workspace_root(
    clusterctl_root: Path, run_params: Mapping[str, Any] | None = None
) -> Path:
    """Workspace parent: runParams/env, then config.yaml, then <clusterctl>/workspace."""
    params = run_params or {}
    explicit = _explicit_path(
        params, ("workspace_root", "workspaceRoot"), ENV_WORKSPACE_ROOT
    )
    if explicit is not None:
        return explicit
    configured = load_path_defaults(clusterctl_root).get("workspaceRoot")
    if configured and str(configured).strip():
        return Path(str(configured).strip()).expanduser().resolve()
    return (clusterctl_root / "workspace").resolve()


def _nested_path(body: Mapping[str, Any], section: str) -> tuple[bool, Optional[str]]:
    block = body.get(section)
    if not isinstance(block, dict) or "path" not in block:
        return False, None
    raw = block.get("path")
    if raw is None:
        return True, None
    value = str(raw).strip()
    return True, value or None


def _first_present(
    body: Mapping[str, Any], keys: tuple[str, ...]
) -> tuple[bool, Optional[str]]:
    for key in keys:
        if key not in body:
            continue
        raw = body.get(key)
        if raw is None:
            return True, None
        value = str(raw).strip()
        return True, value or None
    return False, None


def apply_project_path_fields(
    project: MutableMapping[str, Any], body: Mapping[str, Any]
) -> None:
    """Copy clustersRoot / workspaceRoot from a PUT body. Empty string clears."""
    present, clusters = _first_present(body, ("clustersRoot", "clusters_root"))
    if not present:
        present, clusters = _nested_path(body, "clusters")
    if present:
        if clusters:
            project["clustersRoot"] = clusters
        else:
            project.pop("clustersRoot", None)
            project.pop("clusters_root", None)

    present, workspace = _first_present(body, ("workspaceRoot", "workspace_root"))
    if not present:
        present, workspace = _nested_path(body, "workspace")
    if present:
        if workspace:
            project["workspaceRoot"] = workspace
        else:
            project.pop("workspaceRoot", None)
            project.pop("workspace_root", None)


def inspect_run_params_from_project(project: Mapping[str, Any]) -> dict[str, Any]:
    params: dict[str, Any] = {}
    root = clusterctl_root_from_project(project)
    if root:
        params["clusterctl_root"] = str(root)
    clusters = project.get("clustersRoot") or project.get("clusters_root")
    if clusters:
        params["clusters_root"] = clusters
    workspace = project.get("workspaceRoot") or project.get("workspace_root")
    if workspace:
        params["workspace_root"] = workspace
    return params
