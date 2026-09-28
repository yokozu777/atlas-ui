"""Remove generated playbook/inventory files after an execution finishes."""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import yaml

from executions_store import get_project_dir

logger = logging.getLogger(__name__)


def cleanup_generated_playbooks_for_execution(project_id: str, execution_id: str) -> None:
    project_dir = get_project_dir(project_id)
    gp_dir = project_dir / "runtime" / "generated_playbooks"
    if not gp_dir.exists():
        return
    playbook_file = gp_dir / f"{execution_id}.yml"
    inventory_file = gp_dir / f"inventory_{execution_id}.yml"
    if playbook_file.exists():
        playbook_file.unlink()
    if inventory_file.exists():
        inventory_file.unlink()
    for key_file in gp_dir.glob(f"key_{execution_id}*.pem"):
        key_file.unlink()
    leftover = gp_dir / f"key_{execution_id}.pem"
    if leftover.exists():
        leftover.unlink()
    logger.debug("cleaned generated playbooks for %s", execution_id)


def cleanup_run_generated_playbooks(run_params: dict[str, Any] | None) -> None:
    """Delete the playbook, inventory and key_*.pem recorded on one ansible run.

    Atlas and clusterctl executions have no temp_playbook. An empty value must
    not become Path('.'): unlink('.') raises IsADirectoryError (Errno 21).
    """
    if not isinstance(run_params, dict) or not run_params:
        return
    raw_playbook = str(run_params.get("temp_playbook") or "").strip()
    raw_inventory = str(run_params.get("temp_inventory") or "").strip()
    playbook_path = Path(raw_playbook) if raw_playbook else None
    gp_dir = playbook_path.parent if playbook_path is not None else None
    if raw_inventory and gp_dir is not None:
        inv_path = Path(raw_inventory)
        if inv_path.is_file() and inv_path.parent == gp_dir:
            for key_name in _inventory_key_names(inv_path):
                key_file = gp_dir / key_name
                if key_file.is_file():
                    key_file.unlink()
                    logger.debug("removed generated key %s", key_file)
            inv_path.unlink()
            logger.debug("removed generated inventory %s", inv_path)
    if playbook_path is not None and playbook_path.is_file():
        playbook_path.unlink()
        logger.debug("removed generated playbook %s", playbook_path)


def _inventory_key_names(inventory_path: Path) -> set[str]:
    names: set[str] = set()
    try:
        loaded = yaml.safe_load(inventory_path.read_text(encoding="utf-8")) or {}
    except Exception as exc:
        logger.debug("could not parse inventory for keys: %s", exc)
        return names
    if not isinstance(loaded, dict):
        return names
    hosts = (loaded.get("all") or {}) if isinstance(loaded.get("all"), dict) else {}
    hosts_dict = hosts.get("hosts") or {}
    if not isinstance(hosts_dict, dict):
        return names
    for host_data in hosts_dict.values():
        if not isinstance(host_data, dict):
            continue
        key_path = str(host_data.get("ansible_ssh_private_key_file") or "")
        if "generated_playbooks" not in key_path or not key_path.endswith(".pem"):
            continue
        key_name = Path(key_path).name
        if key_name.startswith("key_"):
            names.add(key_name)
    return names
