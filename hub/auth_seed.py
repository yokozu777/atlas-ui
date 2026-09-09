#!/usr/bin/env python3
"""
Функции для инициализации базовых данных аутентификации (seed)
"""
import logging
import os
import secrets
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)


def seed_default_user(user_service, role_service, data_dir: Path) -> bool:
    """
    Create the first admin user when the auth store is empty.
    ATLAS_ADMIN_PASSWORD skips the forced password change (CI / explicit .env).
    Otherwise a one-time password is written to data/auth/admin-initial.txt.
    """
    try:
        users = user_service.get_all_users()
        if users:
            logger.info(f"Users already exist ({len(users)} users). Skipping default user creation.")
            return False

        password = os.environ.get("ATLAS_ADMIN_PASSWORD", "").strip()
        must_change = False
        if not password:
            password = secrets.token_urlsafe(16)
            must_change = True
            auth_dir = Path(data_dir) / "auth"
            auth_dir.mkdir(parents=True, exist_ok=True)
            initial = auth_dir / "admin-initial.txt"
            initial.write_text(
                f"username=admin\npassword={password}\n",
                encoding="utf-8",
            )
            os.chmod(initial, 0o600)
            logger.warning("Initial admin password written to %s (change it after first login)", initial)

        admin_user = user_service.create_user(
            username="admin",
            password=password,
            email=None,
            roles=[],
            must_change_password=must_change,
        )

        logger.info(f"Default admin user created: {admin_user.username} (ID: {admin_user.id})")

        admin_role = role_service.get_role_by_name("admin")
        if admin_role:
            user_service.add_role_to_user(admin_user.id, admin_role.id)
            logger.info("Admin role assigned to default user")

        return True
    except ValueError as e:
        logger.info(f"Default admin user already exists: {e}")
        return False
    except Exception as e:
        logger.error(f"Error creating default user: {e}", exc_info=True)
        return False


def seed_default_roles(role_service, permission_service, data_dir: Path, user_service=None) -> bool:
    """
    Создать базовые роли и права доступа при первом запуске
    
    Args:
        role_service: Экземпляр RoleService
        permission_service: Экземпляр PermissionService
        data_dir: Директория для данных
    
    Returns:
        True, если роли/права были созданы, False если уже существовали
    """
    created_any = False
    
    try:
        # Список базовых прав доступа
        default_permissions = [
            # Users permissions
            {'name': 'users.read', 'description': 'View users', 'resource': 'users', 'action': 'read'},
            {'name': 'users.create', 'description': 'Create users', 'resource': 'users', 'action': 'create'},
            {'name': 'users.update', 'description': 'Update users', 'resource': 'users', 'action': 'update'},
            {'name': 'users.delete', 'description': 'Delete users', 'resource': 'users', 'action': 'delete'},
            
            # Roles permissions
            {'name': 'roles.read', 'description': 'View roles', 'resource': 'roles', 'action': 'read'},
            {'name': 'roles.create', 'description': 'Create roles', 'resource': 'roles', 'action': 'create'},
            {'name': 'roles.update', 'description': 'Update roles', 'resource': 'roles', 'action': 'update'},
            {'name': 'roles.delete', 'description': 'Delete roles', 'resource': 'roles', 'action': 'delete'},
            
            # Permissions permissions
            {'name': 'permissions.read', 'description': 'View permissions', 'resource': 'permissions', 'action': 'read'},
            {'name': 'permissions.create', 'description': 'Create permissions', 'resource': 'permissions', 'action': 'create'},
            {'name': 'permissions.update', 'description': 'Update permissions', 'resource': 'permissions', 'action': 'update'},
            {'name': 'permissions.delete', 'description': 'Delete permissions', 'resource': 'permissions', 'action': 'delete'},
            
            # Projects permissions
            {'name': 'projects.read', 'description': 'View projects', 'resource': 'projects', 'action': 'read'},
            {'name': 'projects.create', 'description': 'Create projects', 'resource': 'projects', 'action': 'create'},
            {'name': 'projects.update', 'description': 'Update projects', 'resource': 'projects', 'action': 'update'},
            {'name': 'projects.delete', 'description': 'Delete projects', 'resource': 'projects', 'action': 'delete'},
            
            # Playbooks permissions
            {'name': 'playbooks.read', 'description': 'View playbooks', 'resource': 'playbooks', 'action': 'read'},
            {'name': 'playbooks.create', 'description': 'Create playbooks', 'resource': 'playbooks', 'action': 'create'},
            {'name': 'playbooks.update', 'description': 'Update playbooks', 'resource': 'playbooks', 'action': 'update'},
            {'name': 'playbooks.delete', 'description': 'Delete playbooks', 'resource': 'playbooks', 'action': 'delete'},
            {'name': 'playbooks.execute', 'description': 'Execute playbooks', 'resource': 'playbooks', 'action': 'execute'},
            {'name': 'atlas.execute', 'description': 'Run clusterctl on an atlas project', 'resource': 'atlas', 'action': 'execute'},
            {'name': 'atlas.execute_root_ssh', 'description': 'Run atlas clusterctl with --root-ssh', 'resource': 'atlas', 'action': 'execute_root_ssh'},
            
            # Inventory permissions
            {'name': 'inventory.read', 'description': 'View inventory', 'resource': 'inventory', 'action': 'read'},
            {'name': 'inventory.create', 'description': 'Create inventory', 'resource': 'inventory', 'action': 'create'},
            {'name': 'inventory.update', 'description': 'Update inventory', 'resource': 'inventory', 'action': 'update'},
            {'name': 'inventory.delete', 'description': 'Delete inventory', 'resource': 'inventory', 'action': 'delete'},
            
            # Secrets permissions
            {'name': 'secrets.read', 'description': 'View secrets', 'resource': 'secrets', 'action': 'read'},
            {'name': 'secrets.create', 'description': 'Create secrets', 'resource': 'secrets', 'action': 'create'},
            {'name': 'secrets.update', 'description': 'Update secrets', 'resource': 'secrets', 'action': 'update'},
            {'name': 'secrets.delete', 'description': 'Delete secrets', 'resource': 'secrets', 'action': 'delete'},
            {'name': 'global_secrets.read', 'description': 'View global secrets', 'resource': 'global_secrets', 'action': 'read'},
            {'name': 'global_secrets.create', 'description': 'Create global secrets', 'resource': 'global_secrets', 'action': 'create'},
            {'name': 'global_secrets.update', 'description': 'Update global secrets', 'resource': 'global_secrets', 'action': 'update'},
            {'name': 'global_secrets.delete', 'description': 'Delete global secrets', 'resource': 'global_secrets', 'action': 'delete'},
            
            # Settings permissions
            {'name': 'settings.read', 'description': 'View settings', 'resource': 'settings', 'action': 'read'},
            {'name': 'settings.update', 'description': 'Update settings', 'resource': 'settings', 'action': 'update'},
        ]
        
        # Создаем права доступа
        permission_ids = {}
        for perm_data in default_permissions:
            try:
                # Проверяем, существует ли уже такое право
                existing_perm = permission_service.get_permission_by_name(perm_data['name'])
                if existing_perm:
                    permission_ids[perm_data['name']] = existing_perm.id
                    continue
                
                # Создаем новое право
                perm = permission_service.create_permission(
                    name=perm_data['name'],
                    description=perm_data['description'],
                    resource=perm_data['resource'],
                    action=perm_data['action']
                )
                permission_ids[perm_data['name']] = perm.id
                created_any = True
                logger.info(f"Created permission: {perm.name}")
            except ValueError as e:
                # Право уже существует
                existing_perm = permission_service.get_permission_by_name(perm_data['name'])
                if existing_perm:
                    permission_ids[perm_data['name']] = existing_perm.id
                logger.debug(f"Permission {perm_data['name']} already exists: {e}")
            except Exception as e:
                logger.error(f"Error creating permission {perm_data['name']}: {e}", exc_info=True)
        
        # Создаем базовые роли
        default_roles = [
            {
                'name': 'admin',
                'description': 'Administrator - full access to all functions',
                'permissions': list(permission_ids.values())  # All permissions
            },
            {
                'name': 'user',
                'description': 'Regular user - basic access',
                'permissions': [
                    permission_ids.get('projects.read'),
                    permission_ids.get('playbooks.read'),
                    permission_ids.get('inventory.read'),
                    permission_ids.get('secrets.read'),
                    permission_ids.get('global_secrets.read'),
                    permission_ids.get('settings.read'),
                ]
            },
            {
                'name': 'operator',
                'description': 'Operator - can execute playbooks',
                'permissions': [
                    permission_ids.get('projects.read'),
                    permission_ids.get('playbooks.read'),
                    permission_ids.get('playbooks.execute'),
                    permission_ids.get('atlas.execute'),
                    permission_ids.get('inventory.read'),
                    permission_ids.get('secrets.read'),
                    permission_ids.get('global_secrets.read'),
                ]
            },
            {
                'name': 'viewer',
                'description': 'Viewer - read-only access',
                'permissions': [
                    permission_ids.get('projects.read'),
                    permission_ids.get('playbooks.read'),
                    permission_ids.get('inventory.read'),
                    permission_ids.get('settings.read'),
                ]
            }
        ]
        
        # Фильтруем None из списков permissions
        for role_data in default_roles:
            role_data['permissions'] = [p for p in role_data['permissions'] if p is not None]
        
        # Создаем роли
        for role_data in default_roles:
            try:
                # Проверяем, существует ли уже такая роль
                existing_role = role_service.get_role_by_name(role_data['name'])
                if existing_role:
                    logger.debug(f"Role {role_data['name']} already exists")
                    continue
                
                # Создаем новую роль
                role = role_service.create_role(
                    name=role_data['name'],
                    description=role_data['description'],
                    permissions=role_data['permissions']
                )
                created_any = True
                logger.info(f"Created role: {role.name} with {len(role.permissions)} permissions")
            except ValueError as e:
                # Роль уже существует
                logger.debug(f"Role {role_data['name']} already exists: {e}")
            except Exception as e:
                logger.error(f"Error creating role {role_data['name']}: {e}", exc_info=True)
        
        ensure_atlas_permissions(role_service, permission_service)

        # Назначаем роль admin пользователю admin, если он существует
        if user_service:
            admin_user = user_service.get_user_by_username('admin')
            if admin_user:
                admin_role = role_service.get_role_by_name('admin')
                if admin_role and admin_role.id not in admin_user.roles:
                    user_service.add_role_to_user(admin_user.id, admin_role.id)
                    logger.info(f"Admin role assigned to admin user")
        
        return created_any
    except Exception as e:
        logger.error(f"Error seeding default roles: {e}", exc_info=True)
        return False


def ensure_atlas_permissions(role_service, permission_service) -> None:
    """Idempotent: atlas.execute / atlas.execute_root_ssh exist and admin has them."""
    specs = [
        {
            "name": "atlas.execute",
            "description": "Run clusterctl on an atlas project",
            "resource": "atlas",
            "action": "execute",
        },
        {
            "name": "atlas.execute_root_ssh",
            "description": "Run atlas clusterctl with --root-ssh",
            "resource": "atlas",
            "action": "execute_root_ssh",
        },
    ]
    ids = []
    for spec in specs:
        existing = permission_service.get_permission_by_name(spec["name"])
        if existing:
            ids.append(existing.id)
            continue
        perm = permission_service.create_permission(
            name=spec["name"],
            description=spec["description"],
            resource=spec["resource"],
            action=spec["action"],
        )
        ids.append(perm.id)
        logger.info("Created permission: %s", perm.name)
    admin_role = role_service.get_role_by_name("admin")
    if admin_role:
        current = list(admin_role.permissions or [])
        changed = False
        for perm_id in ids:
            if perm_id not in current:
                current.append(perm_id)
                changed = True
        if changed:
            role_service.update_role(admin_role.id, permissions=current)
    operator = role_service.get_role_by_name("operator")
    if operator and ids:
        execute_id = ids[0]
        current = list(operator.permissions or [])
        if execute_id not in current:
            current.append(execute_id)
            role_service.update_role(operator.id, permissions=current)
