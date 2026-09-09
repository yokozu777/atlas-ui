"""Users CRUD and RBAC role list for FastAPI (no Flask)."""
from __future__ import annotations

from typing import Any, Optional

from auth_validators import validate_email, validate_password, validate_username


class UsersHttpError(Exception):
    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.message = message


def _role_enrichment(user_roles: list[str], role_service: Any) -> tuple[list[str], list[dict[str, Any]]]:
    role_names: list[str] = []
    role_details: list[dict[str, Any]] = []
    for role_id in user_roles or []:
        role = role_service.get_role_by_id(role_id)
        if role:
            role_names.append(role.name)
            role_details.append(
                {
                    "id": role.id,
                    "name": role.name,
                    "description": role.description,
                }
            )
    return role_names, role_details


def _user_payload(user: Any, role_service: Any) -> dict[str, Any]:
    data = user.to_dict()
    role_names, role_details = _role_enrichment(user.roles, role_service)
    data["role_names"] = role_names
    data["role_details"] = role_details
    data.pop("password_hash", None)
    return data


def _normalize_role_ids(roles: Any, role_service: Any, *, coerce_objects: bool) -> list[str]:
    if roles is None:
        return []
    if not isinstance(roles, list):
        raise UsersHttpError(400, "Roles must be an array")
    role_ids: list[str] = []
    for item in roles:
        if coerce_objects:
            rid = item.get("id", item) if isinstance(item, dict) else item
            rid = str(rid).strip() if rid is not None else None
            if not rid:
                continue
        else:
            rid = item
        role = role_service.get_role_by_id(rid)
        if not role:
            raise UsersHttpError(400, f"Role with ID {rid} not found")
        role_ids.append(rid)
    return role_ids


def list_users(user_service: Any, role_service: Any) -> dict[str, Any]:
    users_data = [_user_payload(user, role_service) for user in user_service.get_all_users()]
    return {"success": True, "users": users_data}


def create_user(user_service: Any, role_service: Any, body: dict[str, Any]) -> dict[str, Any]:
    username = (body.get("username") or "").strip()
    password = body.get("password") or ""
    email = (body.get("email") or "").strip() or None
    roles = body.get("roles") or []
    ok, err = validate_username(username)
    if not ok:
        raise UsersHttpError(400, err or "Invalid username")
    ok, err = validate_password(password)
    if not ok:
        raise UsersHttpError(400, err or "Invalid password")
    if email:
        ok, err = validate_email(email)
        if not ok:
            raise UsersHttpError(400, err or "Invalid email")
    role_ids = _normalize_role_ids(roles, role_service, coerce_objects=True)
    try:
        user = user_service.create_user(
            username=username,
            password=password,
            email=email,
            roles=role_ids,
        )
    except ValueError as exc:
        raise UsersHttpError(400, str(exc)) from exc
    return {"success": True, "user": user.to_dict()}


def get_user(user_service: Any, role_service: Any, user_id: str) -> dict[str, Any]:
    user = user_service.get_user_by_id(user_id)
    if not user:
        raise UsersHttpError(404, "User not found")
    return {"success": True, "user": _user_payload(user, role_service)}


def update_user(
    user_service: Any,
    role_service: Any,
    user_id: str,
    body: dict[str, Any],
    current_user_id: Optional[str],
) -> dict[str, Any]:
    username = (body.get("username") or "").strip() or None
    email = (body.get("email") or "").strip() or None
    roles = body.get("roles")
    is_active = body.get("is_active")
    current_password = body.get("current_password")
    new_password = body.get("password")

    if current_password is not None and new_password is not None:
        if not new_password or len(new_password) < 6:
            raise UsersHttpError(400, "New password must be at least 6 characters")
        if not user_service.change_password(user_id, current_password, new_password):
            raise UsersHttpError(400, "Current password is incorrect")
    elif new_password is not None:
        if user_id == current_user_id:
            raise UsersHttpError(
                400,
                "To change your own password, use Account settings and provide your current password",
            )
        if not new_password or len(new_password) < 6:
            raise UsersHttpError(400, "New password must be at least 6 characters")
        if not user_service.set_password(user_id, new_password):
            raise UsersHttpError(404, "User not found")

    if username is not None:
        ok, err = validate_username(username)
        if not ok:
            raise UsersHttpError(400, err or "Invalid username")
    if email is not None:
        ok, err = validate_email(email)
        if not ok:
            raise UsersHttpError(400, err or "Invalid email")
    if roles is not None:
        _normalize_role_ids(roles, role_service, coerce_objects=False)

    try:
        user = user_service.update_user(
            user_id=user_id,
            username=username,
            email=email,
            roles=roles,
            is_active=is_active,
        )
    except ValueError as exc:
        raise UsersHttpError(400, str(exc)) from exc
    if not user:
        raise UsersHttpError(404, "User not found")
    return {"success": True, "user": _user_payload(user, role_service)}


def delete_user(user_service: Any, user_id: str, current_user_id: Optional[str]) -> dict[str, Any]:
    if user_id == current_user_id:
        raise UsersHttpError(400, "You cannot delete your own account")
    if not user_service.delete_user(user_id):
        raise UsersHttpError(404, "User not found")
    return {"success": True, "message": "User deleted successfully"}


def list_rbac_roles(role_service: Any, permission_service: Any) -> dict[str, Any]:
    roles_data: list[dict[str, Any]] = []
    for role in role_service.get_all_roles():
        role_dict = role.to_dict()
        permission_names: list[str] = []
        permission_details: list[dict[str, Any]] = []
        for perm_id in role.permissions:
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
        roles_data.append(role_dict)
    return {"success": True, "roles": roles_data}
