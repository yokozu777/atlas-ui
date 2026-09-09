"""Permissions CRUD for FastAPI (no Flask)."""
from __future__ import annotations

from typing import Any, Optional

from auth_validators import validate_permission_name


class PermissionsHttpError(Exception):
    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.message = message


def list_permissions(permission_service: Any) -> dict[str, Any]:
    rows = [perm.to_dict() for perm in permission_service.get_all_permissions()]
    return {"success": True, "permissions": rows}


def create_permission(permission_service: Any, body: dict[str, Any]) -> dict[str, Any]:
    name = str(body.get("name") or "").strip()
    description = str(body.get("description") or "").strip()
    resource = str(body.get("resource") or "").strip()
    action = str(body.get("action") or "").strip()
    ok, err = validate_permission_name(name)
    if not ok:
        raise PermissionsHttpError(400, err or "Invalid permission name")
    if not resource:
        raise PermissionsHttpError(400, "Ресурс обязателен")
    if not action:
        raise PermissionsHttpError(400, "Действие обязательно")
    try:
        permission = permission_service.create_permission(
            name=name,
            description=description,
            resource=resource,
            action=action,
        )
    except ValueError as exc:
        raise PermissionsHttpError(400, str(exc)) from exc
    return {"success": True, "permission": permission.to_dict()}


def get_permission(permission_service: Any, perm_id: str) -> dict[str, Any]:
    permission = permission_service.get_permission_by_id(perm_id)
    if not permission:
        raise PermissionsHttpError(404, "Право доступа не найдено")
    return {"success": True, "permission": permission.to_dict()}


def update_permission(
    permission_service: Any, perm_id: str, body: dict[str, Any]
) -> dict[str, Any]:
    name = str(body.get("name") or "").strip() if body.get("name") else None
    description = str(body.get("description") or "").strip() if body.get("description") else None
    resource = str(body.get("resource") or "").strip() if body.get("resource") else None
    action = str(body.get("action") or "").strip() if body.get("action") else None
    if name is not None:
        ok, err = validate_permission_name(name)
        if not ok:
            raise PermissionsHttpError(400, err or "Invalid permission name")
    try:
        permission = permission_service.update_permission(
            perm_id=perm_id,
            name=name,
            description=description,
            resource=resource,
            action=action,
        )
    except ValueError as exc:
        raise PermissionsHttpError(400, str(exc)) from exc
    if not permission:
        raise PermissionsHttpError(404, "Право доступа не найдено")
    return {"success": True, "permission": permission.to_dict()}


def delete_permission(permission_service: Any, perm_id: str) -> dict[str, Any]:
    if not permission_service.delete_permission(perm_id):
        raise PermissionsHttpError(404, "Право доступа не найдено")
    return {"success": True, "message": "Право доступа успешно удалено"}


def list_permissions_by_resource(permission_service: Any, resource: str) -> dict[str, Any]:
    rows = [perm.to_dict() for perm in permission_service.get_permissions_by_resource(resource)]
    return {"success": True, "permissions": rows}
