import sys
from pathlib import Path as _AuthEnvPath

sys.path.insert(0, str(_AuthEnvPath(__file__).resolve().parent))
import auth_env  # noqa: F401
import os
import tempfile
import unittest
from pathlib import Path

_TMP = tempfile.TemporaryDirectory()
os.environ["DATA_DIR"] = _TMP.name
os.environ["STARGATE_FLASK_EMBEDDED"] = "0"

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

import gateway  # noqa: E402


class RbacEnforcementTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(gateway.app)

    def _login(self, username="admin", password="admin123"):
        res = self.client.post(
            "/api/auth/login",
            json={"username": username, "password": password},
        )
        self.assertEqual(res.status_code, 200, res.text)
        return {"Authorization": f"Bearer {res.json()['access_token']}"}

    def _role_id(self, name: str) -> str:
        role = gateway.role_service.get_role_by_name(name)
        self.assertIsNotNone(role, name)
        return role.id

    def _user_headers(self, username: str, role_name: str, password: str = "limited1"):
        existing = gateway.user_service.get_user_by_username(username)
        if existing:
            gateway.user_service.delete_user(existing.id)
        gateway.user_service.create_user(
            username=username,
            password=password,
            email=None,
            roles=[self._role_id(role_name)],
        )
        return self._login(username, password)

    def _admin_project(self, name: str) -> str:
        created = self.client.post(
            "/api/projects",
            json={"name": name, "kind": "atlas", "cluster_id": "dev/k8s"},
            headers=self._login(),
        )
        self.assertEqual(created.status_code, 200, created.text)
        return created.json()["project"]["id"]

    def test_viewer_reads_projects_not_users_or_execute(self):
        headers = self._user_headers("rbac-viewer", "viewer")
        listed = self.client.get("/api/projects", headers=headers)
        self.assertEqual(listed.status_code, 200, listed.text)
        users = self.client.get("/api/users", headers=headers)
        self.assertEqual(users.status_code, 403, users.text)
        project_id = self._admin_project("rbac-viewer-proj")
        denied_run = self.client.post(
            f"/api/projects/{project_id}/atlas/run",
            json={"phases": ["k8s"]},
            headers=headers,
        )
        self.assertEqual(denied_run.status_code, 403, denied_run.text)
        denied_hosts = self.client.put(
            f"/api/projects/{project_id}/atlas/hosts",
            json={"cluster_id": "dev/k8s", "groups": []},
            headers=headers,
        )
        self.assertEqual(denied_hosts.status_code, 403, denied_hosts.text)
        me = self.client.get("/api/auth/me", headers=headers)
        self.assertEqual(me.status_code, 200, me.text)
        body = me.json()
        self.assertFalse(body.get("isAdmin"))
        self.assertIn("projects.read", body.get("permissions") or [])
        self.assertNotIn("atlas.execute", body.get("permissions") or [])

    def test_operator_can_execute_not_edit_hosts_or_users(self):
        headers = self._user_headers("rbac-operator", "operator")
        project_id = self._admin_project("rbac-operator-proj")
        inspect = self.client.post(
            f"/api/projects/{project_id}/atlas/inspect",
            json={"argv": ["version"]},
            headers=headers,
        )
        self.assertNotEqual(inspect.status_code, 403, inspect.text)
        denied_hosts = self.client.put(
            f"/api/projects/{project_id}/atlas/hosts",
            json={"cluster_id": "dev/k8s", "groups": []},
            headers=headers,
        )
        self.assertEqual(denied_hosts.status_code, 403, denied_hosts.text)
        self.assertIn("inventory.update", denied_hosts.json().get("error", ""))
        denied_users = self.client.post(
            "/api/users",
            json={"username": "nope", "password": "secret12"},
            headers=headers,
        )
        self.assertEqual(denied_users.status_code, 403, denied_users.text)
        workers = self.client.post(
            "/api/admin/workers",
            json={"name": "op-worker"},
            headers=headers,
        )
        self.assertEqual(workers.status_code, 403, workers.text)

    def test_user_reads_secrets_cannot_create(self):
        headers = self._user_headers("rbac-user", "user")
        project_id = self._admin_project("rbac-user-secrets")
        listed = self.client.get(
            f"/api/secrets?project_id={project_id}",
            headers=headers,
        )
        self.assertEqual(listed.status_code, 200, listed.text)
        created = self.client.post(
            f"/api/secrets?project_id={project_id}",
            json={"name": "blocked", "value": "x"},
            headers=headers,
        )
        self.assertEqual(created.status_code, 403, created.text)

    def test_admin_me_and_create_user(self):
        headers = self._login()
        me = self.client.get("/api/auth/me", headers=headers)
        self.assertEqual(me.status_code, 200, me.text)
        body = me.json()
        self.assertTrue(body.get("isAdmin"))
        self.assertIn("users.create", body.get("permissions") or [])
        created = self.client.post(
            "/api/users",
            json={"username": "rbac-created", "password": "secret12"},
            headers=headers,
        )
        self.assertEqual(created.status_code, 201, created.text)
        workers = self.client.post(
            "/api/admin/workers",
            json={"name": "rbac-worker"},
            headers=headers,
        )
        self.assertEqual(workers.status_code, 200, workers.text)

    def test_last_admin_cannot_be_removed(self):
        headers = self._login()
        admin = gateway.user_service.get_user_by_username("admin")
        viewer_id = self._role_id("viewer")
        stripped = self.client.put(
            f"/api/users/{admin.id}",
            json={"roles": [viewer_id]},
            headers=headers,
        )
        self.assertEqual(stripped.status_code, 400, stripped.text)
        deleted = self.client.delete(f"/api/users/{admin.id}", headers=headers)
        self.assertEqual(deleted.status_code, 400, deleted.text)
        admin_role = gateway.role_service.get_role_by_name("admin")
        denied_role = self.client.delete(
            f"/api/roles/{admin_role.id}",
            headers=headers,
        )
        self.assertEqual(denied_role.status_code, 400, denied_role.text)

    def test_live_admin_role_revocation_ignores_jwt(self):
        headers = self._login()
        admin = gateway.user_service.get_user_by_username("admin")
        admin_role = gateway.role_service.get_role_by_name("admin")
        viewer_role = gateway.role_service.get_role_by_name("viewer")
        other = gateway.user_service.create_user(
            username="rbac-second-admin",
            password="limited1",
            email=None,
            roles=[admin_role.id],
        )
        try:
            gateway.user_service.update_user(admin.id, roles=[viewer_role.id])
            denied = self.client.get("/api/users", headers=headers)
            self.assertEqual(denied.status_code, 403, denied.text)
        finally:
            gateway.user_service.update_user(admin.id, roles=[admin_role.id])
            gateway.user_service.delete_user(other.id)
