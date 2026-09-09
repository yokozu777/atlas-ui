"""Remove generated playbook/inventory files after an execution finishes."""
from __future__ import annotations

import logging

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
