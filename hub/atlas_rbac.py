"""Atlas execute permissions. atlas.execute does not grant --root-ssh."""
from __future__ import annotations

EXECUTE_ERROR = "atlas.execute required"
ROOT_SSH_ERROR = "atlas.execute_root_ssh required for --root-ssh"


def atlas_run_error(*, can_execute: bool, can_root_ssh: bool, root_ssh: bool) -> str | None:
    if not can_execute:
        return EXECUTE_ERROR
    if root_ssh and not can_root_ssh:
        return ROOT_SSH_ERROR
    return None
