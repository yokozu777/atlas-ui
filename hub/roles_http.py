"""RBAC roles CRUD for FastAPI (no Flask)."""
from __future__ import annotations

from typing import Any, Optional

from auth_validators import validate_role_name


class RolesHttpError(Exception):
    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.message = message


def _normalize_permission_ids(raw: Any, permission_service: Any) -> list[str]:
    if raw is None:
        return []
    if not isinstance(raw, list):
        raise RolesHttpError(400, "Permissions must be an array")
    permission_ids: list[str] = []
    for item in raw:
        pid = item.get("id", item) if isinstance(item, dict) else item
        pid = str(pid).strip() if pid is not None else ""
        if not pid:
            continue
        perm = permission_service.get_permission_by_id(pid) if permission_service else None
        if not perm:
            raise RolesHttpError(400, f"Permission with ID {pid} not found")
        permission_ids.append(pid)
    return permission_ids


def _role_payload(role: Any, permission_service: Any) -> dict[str, Any]:
    role_dict = role.to_dict()
    permission_names: list[str] = []
    permission_details: list[dict[str, Any]] = []
    for perm_id in role.permissions or []:
        perm = permission_service.get_permission_by_id(perm_id) if permission_service else None
        if perm:
            permission_names.append(perm.name)
            permission_details.append(
                {
                    "id": perm.id,
                    "name": perm.name,
                    "description": perm.description,
                    "resource": perm.resource,
                    "action": perm.action,
                }
            )
    role_dict["permission_names"] = permission_names
    role_dict["permission_details"] = permission_details
    return role_dict


def list_roles(role_service: Any, permission_service: Any) -> dict[str, Any]:
    roles_data = [_role_payload(role, permission_service) for role in role_service.get_all_roles()]
    return {"success": True, "roles": roles_data}


def create_role(
    role_service: Any, permission_service: Any, body: dict[str, Any]
) -> dict[str, Any]:
    name = str(body.get("name") or "").strip()
    description = str(body.get("description") or "").strip()
    ok, err = validate_role_name(name)
    if not ok:
        raise RolesHttpError(400, err or "Invalid role name")
    permission_ids = _normalize_permission_ids(body.get("permissions") or [], permission_service)
    try:
        role = role_service.create_role(
            name=name,
            description=description,
            permissions=permission_ids,
        )
    except ValueError as exc:
        raise RolesHttpError(400, str(exc)) from exc
    return {"success": True, "role": _role_payload(role, permission_service)}


def get_role(role_service: Any, permission_service: Any, role_id: str) -> dict[str, Any]:
    role = role_service.get_role_by_id(role_id)
    if not role:
        raise RolesHttpError(404, "Role not found")
    return {"success": True, "role": _role_payload(role, permission_service)}


def update_role(
    role_service: Any,
    permission_service: Any,
    role_id: str,
    body: dict[str, Any],
) -> dict[str, Any]:
    name = str(body.get("name") or "").strip() if body.get("name") else None
    description = (
        str(body.get("description") or "").strip()
        if "description" in body
        else None
    )
    permissions = body.get("permissions") if "permissions" in body else None
    if name is not None:
        ok, err = validate_role_name(name)
        if not ok:
            raise RolesHttpError(400, err or "Invalid role name")
    permission_ids: Optional[list[str]] = None
    if permissions is not None:
        permission_ids = _normalize_permission_ids(permissions, permission_service)
    try:
        role = role_service.update_role(
            role_id=role_id,
            name=name,
            description=description,
            permissions=permission_ids,
        )
    except ValueError as exc:
        raise RolesHttpError(400, str(exc)) from exc
    if not role:
        raise RolesHttpError(404, "Role not found")
    return {"success": True, "role": _role_payload(role, permission_service)}


def delete_role(role_service: Any, role_id: str) -> dict[str, Any]:
    if not role_service.delete_role(role_id):
        raise RolesHttpError(404, "Role not found")
    return {"success": True, "message": "Role deleted successfully"}
